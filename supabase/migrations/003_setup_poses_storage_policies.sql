-- ================================================================================================
-- Poses Storage 存储桶权限配置
-- ================================================================================================

-- 注意：此脚本需要在 Supabase Dashboard 的 SQL Editor 中执行
-- 或者确保 poses 存储桶已经在 Storage 中创建

-- 为 poses 存储桶设置 RLS 策略
-- 1. 允许所有人读取（公开访问）
insert into storage.buckets (id, name, public)
values ('poses', 'poses', true)
on conflict (id) do update set public = true;

-- 2. 允许管理员上传文件
create policy "Admin can upload poses"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'poses'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 3. 允许管理员删除文件
create policy "Admin can delete poses"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'poses'
  and exists (
    select 1 from public.profiles
    where id = auth.uid()
    and role = 'admin'
  )
);

-- 4. 允许所有人读取文件（因为存储桶是公开的）
create policy "Public can view poses"
on storage.objects for select
to public
using (bucket_id = 'poses');
