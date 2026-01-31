-- ================================================================================================
-- Gallery Storage 照片墙存储桶配置
-- ================================================================================================

-- 1. 允许管理员上传文件
create policy "Admin can upload gallery"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'gallery'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 2. 允许管理员删除文件
create policy "Admin can delete gallery"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'gallery'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 3. 允许所有人读取文件（公开访问）
create policy "Public can read gallery"
on storage.objects for select
to public
using (bucket_id = 'gallery');

-- ================================================================================================
-- 允许照片墙照片的 album_id 为 null
-- ================================================================================================

-- 修改 album_id 字段，允许为 null
ALTER TABLE public.album_photos
ALTER COLUMN album_id DROP NOT NULL;

-- 添加约束：照片必须属于相册或者是公开照片墙照片
ALTER TABLE public.album_photos
ADD CONSTRAINT check_album_or_public
CHECK (album_id IS NOT NULL OR is_public = true);

COMMENT ON CONSTRAINT check_album_or_public ON public.album_photos IS '照片必须属于相册或者是公开照片墙照片';
