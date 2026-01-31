-- ================================================================================================
-- 修复专属空间删除问题 & 添加有效期管理
-- ================================================================================================

-- 1. 添加有效期字段和收件人名称字段到 albums 表
-- expires_at 由管理员配置，不设置数据库默认值
alter table public.albums add column if not exists expires_at timestamptz;
alter table public.albums add column if not exists recipient_name text default '拾光者';

-- 2. 更新现有相册的有效期（如果为空，设置为创建时间+7天作为初始值）
update public.albums
set expires_at = created_at + interval '7 days'
where expires_at is null;

-- 3. 删除旧函数（如果存在）
drop function if exists public.cascade_delete_album() cascade;

-- 4. 创建专门的相册删除触发器函数（级联删除所有相关内容）
create or replace function public.cascade_delete_album()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 删除相册下的所有照片（会触发 queue_storage_deletion）
  delete from public.album_photos where album_id = old.id;

  -- 删除相册下的所有文件夹
  delete from public.album_folders where album_id = old.id;

  -- 删除用户绑定关系
  delete from public.user_album_bindings where album_id = old.id;

  return old;
end;
$$;

-- 5. 绑定触发器到 albums 表
drop trigger if exists on_album_deleted on public.albums;
create trigger on_album_deleted
  before delete on public.albums
  for each row
  execute function public.cascade_delete_album();

-- 6. 确保 queue_storage_deletion 函数存在（存储清理机制的核心）
create or replace function public.queue_storage_deletion()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 根据表名判断存储桶
  if old.url is not null then
    insert into public.sys_storage_delete_queue (bucket_name, file_path)
    values ('albums', old.url);
  elsif old.storage_path is not null then
    insert into public.sys_storage_delete_queue (bucket_name, file_path)
    values ('poses', old.storage_path);
  end if;
  return old;
end;
$$;

-- 7. 确保 album_photos 表的删除触发器存在
drop trigger if exists on_photo_deleted on public.album_photos;
create trigger on_photo_deleted
  after delete on public.album_photos
  for each row
  execute function public.queue_storage_deletion();

-- 8. 为 poses 表添加删除触发器
drop trigger if exists on_pose_deleted on public.poses;
create trigger on_pose_deleted
  after delete on public.poses
  for each row
  execute function public.queue_storage_deletion();

-- 9. 更新 get_user_bound_albums 函数以使用新的 expires_at 字段
create or replace function public.get_user_bound_albums()
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid;
  result jsonb;
begin
  v_user_id := auth.uid();

  if v_user_id is null then
    return '[]'::jsonb;
  end if;

  select coalesce(json_agg(
    jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'cover_url', a.cover_url,
      'created_at', a.created_at,
      'access_key', a.access_key,
      'bound_at', b.created_at,
      'expires_at', coalesce(a.expires_at, a.created_at + interval '7 days'),
      'is_expired', case
        when a.expires_at is not null then a.expires_at < now()
        else (a.created_at + interval '7 days') < now()
      end
    )
    order by b.created_at desc
  ), '[]'::json)
  into result
  from public.user_album_bindings b
  join public.albums a on a.id = b.album_id
  where b.user_id = v_user_id;

  return result;
end;
$$;

-- 10. 更新 get_album_content 函数以包含有效期信息
create or replace function public.get_album_content(input_key text)
returns jsonb language plpgsql security definer as $$
declare
  v_album_id uuid;
  result jsonb;
begin
  -- 验证密钥并获取相册ID
  select id into v_album_id from public.albums where access_key = input_key;

  if v_album_id is null then
    raise exception '密钥错误';
  end if;

  -- 构建返回数据
  select jsonb_build_object(
    'album', jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'welcome_letter', a.welcome_letter,
      'cover_url', a.cover_url,
      'enable_tipping', a.enable_tipping,
      'recipient_name', coalesce(a.recipient_name, '拾光者'),
      'expires_at', coalesce(a.expires_at, a.created_at + interval '7 days'),
      'is_expired', case
        when a.expires_at is not null then a.expires_at < now()
        else (a.created_at + interval '7 days') < now()
      end
    ),
    'folders', coalesce((
      select json_agg(jsonb_build_object('id', f.id, 'name', f.name) order by f.created_at desc)
      from public.album_folders f
      where f.album_id = v_album_id
    ), '[]'::json),
    'photos', coalesce((
      select json_agg(jsonb_build_object(
        'id', p.id,
        'folder_id', p.folder_id,
        'storage_path', p.url,
        'width', p.width,
        'height', p.height,
        'is_public', p.is_public
      ) order by p.created_at desc)
      from public.album_photos p
      where p.album_id = v_album_id
    ), '[]'::json)
  ) into result
  from public.albums a
  where a.id = v_album_id;

  return result;
end;
$$;

-- 11. 创建存储清理的辅助函数（用于定时任务调用）
create or replace function public.process_storage_delete_queue(batch_size int default 100)
returns jsonb
language plpgsql
security definer
as $$
declare
  deleted_count int := 0;
  failed_count int := 0;
  queue_record record;
begin
  -- 获取待删除的文件列表
  for queue_record in
    select id, bucket_name, file_path
    from public.sys_storage_delete_queue
    order by created_at asc
    limit batch_size
  loop
    begin
      -- 注意：实际的文件删除需要在 Edge Function 中通过 Storage API 完成
      -- 这里只是标记为已处理（删除队列记录）
      delete from public.sys_storage_delete_queue where id = queue_record.id;
      deleted_count := deleted_count + 1;
    exception when others then
      failed_count := failed_count + 1;
    end;
  end loop;

  return jsonb_build_object(
    'processed', deleted_count,
    'failed', failed_count,
    'remaining', (select count(*) from public.sys_storage_delete_queue)
  );
end;
$$;

-- 12. 优化 cleanup_expired_data 函数（先删除旧版本）
drop function if exists public.cleanup_expired_data() cascade;
create or replace function public.cleanup_expired_data()
returns jsonb
language plpgsql
security definer
as $$
declare
  deleted_photos int := 0;
  deleted_folders int := 0;
  deleted_albums int := 0;
begin
  -- 删除过期且未公开的照片（会触发 queue_storage_deletion）
  with deleted as (
    delete from public.album_photos
    where created_at < now() - interval '7 days'
    and is_public = false
    returning id
  )
  select count(*) into deleted_photos from deleted;

  -- 删除空文件夹
  with deleted as (
    delete from public.album_folders
    where id not in (
      select distinct folder_id
      from public.album_photos
      where folder_id is not null
    )
    and created_at < now() - interval '24 hours'
    returning id
  )
  select count(*) into deleted_folders from deleted;

  -- 删除过期的空相册
  with deleted as (
    delete from public.albums
    where expires_at < now()
    and id not in (
      select distinct album_id
      from public.album_photos
    )
    returning id
  )
  select count(*) into deleted_albums from deleted;

  return jsonb_build_object(
    'deleted_photos', deleted_photos,
    'deleted_folders', deleted_folders,
    'deleted_albums', deleted_albums,
    'timestamp', now()
  );
end;
$$;

-- 13. 添加索引优化查询性能
create index if not exists idx_album_photos_created_at
  on public.album_photos(created_at)
  where is_public = false;

create index if not exists idx_albums_expires_at
  on public.albums(expires_at)
  where expires_at is not null;

create index if not exists idx_storage_delete_queue_created_at
  on public.sys_storage_delete_queue(created_at);

-- 14. 添加注释说明
comment on function public.queue_storage_deletion() is
  '触发器函数：将删除的文件路径加入清理队列，由定时任务处理实际的Storage删除';

comment on function public.process_storage_delete_queue(int) is
  '批量处理存储删除队列，应由Edge Function定时调用';

comment on function public.cleanup_expired_data() is
  '清理过期数据（照片、文件夹、相册），应由定时任务每天调用';

comment on table public.sys_storage_delete_queue is
  '存储文件删除队列，记录需要从Storage中删除的文件路径';
