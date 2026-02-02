-- ================================================================================================
-- 📂 项目：拾光谣 - 相册访问控制系统
-- 📝 版本：v2.0 - Album Access Control (合并 005 + 008)
-- 🎯 目标：用户相册绑定 + RLS策略优化
-- 📅 日期：2026-02-02
-- ================================================================================================

-- ================================================================================================
-- 1. 用户-相册绑定表
-- ================================================================================================

-- 表：用户相册绑定
-- 用途：记录已登录用户与专属空间的绑定关系，实现免密钥访问
create table if not exists public.user_album_bindings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  album_id uuid references public.albums(id) on delete cascade not null,
  created_at timestamptz default now(),

  -- 确保同一用户不会重复绑定同一相册
  unique(user_id, album_id)
);

-- 索引优化：加速按用户查询绑定的相册
create index if not exists idx_bindings_user on public.user_album_bindings(user_id);

-- ================================================================================================
-- 2. RLS 策略 - 用户绑定表
-- ================================================================================================

alter table public.user_album_bindings enable row level security;

-- 用户只能查看和管理自己的绑定
create policy "User manage own bindings" on user_album_bindings
  for all using (auth.uid() = user_id);

-- 管理员可以查看所有绑定
create policy "Admin view all bindings" on user_album_bindings
  for select using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- ================================================================================================
-- 3. RLS 策略 - 相册表优化
-- ================================================================================================

-- 启用 RLS（如果尚未启用）
alter table public.albums enable row level security;

-- 删除可能存在的旧策略
drop policy if exists "Allow public read access with access_key" on public.albums;
drop policy if exists "Allow authenticated users to read albums" on public.albums;
drop policy if exists "Allow admin full access" on public.albums;
drop policy if exists "Admin manage albums" on public.albums;

-- 创建新策略：允许任何人通过 access_key 查询相册
create policy "Allow public read access with access_key"
on public.albums
for select
to public
using (true);

-- 确保管理员可以完全管理相册
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

-- ================================================================================================
-- 4. RPC 函数：绑定用户与相册
-- ================================================================================================

create or replace function public.bind_user_to_album(p_access_key text)
returns jsonb language plpgsql security definer as $$
declare
  v_user_id uuid;
  v_album_id uuid;
  v_album_info jsonb;
begin
  -- 获取当前用户ID
  v_user_id := auth.uid();

  if v_user_id is null then
    raise exception '请先登录';
  end if;

  -- 验证密钥并获取相册ID
  select id into v_album_id from public.albums where access_key = p_access_key;

  if v_album_id is null then
    raise exception '密钥错误';
  end if;

  -- 插入绑定记录（如果已存在则忽略）
  insert into public.user_album_bindings (user_id, album_id)
  values (v_user_id, v_album_id)
  on conflict (user_id, album_id) do nothing;

  -- 返回相册信息
  select jsonb_build_object(
    'id', id,
    'title', title,
    'cover_url', cover_url,
    'created_at', created_at
  ) into v_album_info
  from public.albums
  where id = v_album_id;

  return v_album_info;
end;
$$;

-- ================================================================================================
-- 5. RPC 函数：获取用户绑定的所有相册
-- ================================================================================================

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
      -- 使用expires_at字段（如果为空则使用创建时间+7天作为默认值）
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

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 相册访问控制系统创建完成！';
  RAISE NOTICE '📊 已创建表：user_album_bindings';
  RAISE NOTICE '🔒 已优化 RLS 策略：albums 表';
  RAISE NOTICE '🔄 已创建 RPC 函数：bind_user_to_album, get_user_bound_albums';
END $$;
