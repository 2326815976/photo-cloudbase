-- ================================================================================================
-- 修复专属空间删除问题 & 添加有效期管理
-- ================================================================================================

-- 0. 删除 albums 表上的错误触发器
drop trigger if exists on_photo_deleted on public.albums;

-- 1. 添加有效期字段和收件人名称字段到 albums 表
alter table public.albums add column if not exists expires_at timestamptz;
alter table public.albums add column if not exists recipient_name text default '拾光者';

-- 2. 删除旧函数（如果存在）
drop function if exists public.cascade_delete_album() cascade;

-- 3. 创建专门的相册删除触发器函数（级联删除所有相关内容）
create function public.cascade_delete_album()
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

-- 4. 绑定触发器到 albums 表
drop trigger if exists on_album_deleted on public.albums;
create trigger on_album_deleted
  before delete on public.albums
  for each row
  execute function public.cascade_delete_album();

-- 5. 更新 get_user_bound_albums 函数以使用新的 expires_at 字段
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
      -- 使用新的 expires_at 字段，如果为空则使用旧的7天逻辑
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

-- 6. 更新 get_album_content 函数以包含有效期信息
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

-- 7. 清理照片删除触发器（Supabase Storage 会自动处理孤儿文件）
drop trigger if exists on_photo_deleted on public.album_photos;
drop function if exists public.queue_storage_deletion() cascade;
