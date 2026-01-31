-- ================================================================================================
-- 修复 albums 表的 RLS 策略，允许用户通过密钥访问相册
-- ================================================================================================

-- 1. 启用 RLS（如果尚未启用）
alter table public.albums enable row level security;

-- 2. 删除可能存在的旧策略
drop policy if exists "Allow public read access with access_key" on public.albums;
drop policy if exists "Allow authenticated users to read albums" on public.albums;

-- 3. 创建新策略：允许任何人通过 access_key 查询相册
create policy "Allow public read access with access_key"
on public.albums
for select
to public
using (true);

-- 4. 确保管理员可以完全管理相册（如果 profiles 表存在 role 字段）
drop policy if exists "Allow admin full access" on public.albums;
create policy "Allow admin full access"
on public.albums
for all
to authenticated
using (
  exists (
    select 1 from public.profiles
    where profiles.id = auth.uid()
    and profiles.role = 'admin'
  )
);
