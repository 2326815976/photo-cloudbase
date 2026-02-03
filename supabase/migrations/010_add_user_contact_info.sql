-- ================================================================================================
-- 📂 项目：拾光谣 - 用户联系信息扩展
-- 📝 版本：v1.0 - User Contact Info
-- 🎯 目标：
--   1. 给 profiles 表添加 phone 和 wechat 字段
--   2. 支持用户在个人资料中保存联系方式
--   3. 预约表单可自动加载用户已保存的联系方式
-- 📅 日期：2026-02-03
-- ================================================================================================

-- 给 profiles 表添加联系方式字段
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS wechat text;

-- 添加注释
COMMENT ON COLUMN public.profiles.phone IS '用户手机号';
COMMENT ON COLUMN public.profiles.wechat IS '用户微信号';

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_wechat ON public.profiles(wechat) WHERE wechat IS NOT NULL;

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ 用户联系信息字段添加完成！';
  RAISE NOTICE '📋 已添加字段：';
  RAISE NOTICE '  - phone（手机号）';
  RAISE NOTICE '  - wechat（微信号）';
END $$;
