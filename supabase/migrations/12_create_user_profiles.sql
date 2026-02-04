-- ================================================================================================
-- 📂 项目：拾光谣 - 用户认证扩展表
-- 📝 版本：v1.0
-- 🎯 目标：手机号注册、用户资料、头像管理、上传限制
-- 📅 日期：2026-02-04
-- ================================================================================================

-- 创建用户扩展信息表（用于手机号注册系统）
create table if not exists public.user_profiles (
  id uuid references auth.users on delete cascade primary key,

  -- 认证信息
  phone text unique not null,
  phone_verified boolean default false,

  -- 用户资料
  nickname text,
  avatar_url text,
  bio text,

  -- 上传限制
  upload_count int default 0,
  upload_limit int default 20,

  -- 时间戳
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 启用 RLS (Row Level Security)
alter table public.user_profiles enable row level security;

-- 创建策略：用户只能读取自己的资料
create policy "Users can read own profile"
  on public.user_profiles
  for select
  using (auth.uid() = id);

-- 创建策略：用户可以更新自己的资料
create policy "Users can update own profile"
  on public.user_profiles
  for update
  using (auth.uid() = id);

-- 创建策略：允许注册时插入
create policy "Allow insert during registration"
  on public.user_profiles
  for insert
  with check (true);

-- 创建索引
create index if not exists user_profiles_phone_idx on public.user_profiles(phone);
create index if not exists user_profiles_avatar_url_idx on public.user_profiles(avatar_url) where avatar_url is not null;

-- 字段注释
comment on table public.user_profiles is '用户扩展信息表 - 用于手机号注册系统（与 profiles 表互补）';
comment on column public.user_profiles.phone is '用户手机号（唯一标识）';
comment on column public.user_profiles.phone_verified is '手机号是否已验证（预留字段，后期接入短信验证）';
comment on column public.user_profiles.nickname is '用户昵称';
comment on column public.user_profiles.avatar_url is '用户头像URL（支持后续头像上传功能）';
comment on column public.user_profiles.bio is '用户个人简介';
comment on column public.user_profiles.upload_count is '已上传照片数量';
comment on column public.user_profiles.upload_limit is '上传限制（新用户默认20张）';

-- 创建更新时间触发器
create or replace function public.handle_user_profiles_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_user_profiles_updated_at
  before update on public.user_profiles
  for each row
  execute procedure public.handle_user_profiles_updated_at();

-- ================================================================================================
-- 完成
-- ================================================================================================

do $$
begin
  raise notice '✅ 用户认证扩展表创建完成！';
  raise notice '📊 已创建：user_profiles 表（手机号注册系统）';
  raise notice '🔒 RLS 策略已配置';
  raise notice '⚡ 触发器已设置';
  raise notice '💡 说明：此表与 profiles 表互补，profiles 用于 OAuth 登录，user_profiles 用于手机号注册';
end $$;
