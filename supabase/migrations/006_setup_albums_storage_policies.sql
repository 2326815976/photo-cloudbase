-- ================================================================================================
-- Albums Storage 存储桶权限配置
-- ================================================================================================

-- 创建 albums 存储桶（私有）
insert into storage.buckets (id, name, public)
values ('albums', 'albums', false)
on conflict (id) do update set public = false;

-- 1. 允许管理员上传文件
create policy "Admin can upload albums"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'albums'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 2. 允许管理员删除文件
create policy "Admin can delete albums"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'albums'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 3. 允许管理员更新文件
create policy "Admin can update albums"
on storage.objects for update
to authenticated
using (
  bucket_id = 'albums'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 4. 允许管理员读取文件（用于生成签名URL）
create policy "Admin can read albums"
on storage.objects for select
to authenticated
using (
  bucket_id = 'albums'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- ================================================================================================
-- RPC 函数：删除照片（带密钥验证）
-- ================================================================================================
create or replace function public.delete_album_photo(
  p_access_key text,
  p_photo_id uuid
)
returns void language plpgsql security definer as $$
declare
  v_album_id uuid;
  v_storage_path text;
begin
  -- 验证密钥并获取相册ID
  select a.id into v_album_id
  from public.albums a
  join public.album_photos p on p.album_id = a.id
  where a.access_key = p_access_key and p.id = p_photo_id;

  if v_album_id is null then
    raise exception '无权操作：密钥错误或照片不属于该空间';
  end if;

  -- 获取存储路径
  select url into v_storage_path from public.album_photos where id = p_photo_id;

  -- 删除数据库记录（触发器会自动加入删除队列）
  delete from public.album_photos where id = p_photo_id;
end;
$$;
