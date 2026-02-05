-- ================================================================================================
-- 📂 项目：拾光谣 - 添加欢迎信显示控制
-- 📝 版本：v1.0
-- 🎯 目标：允许管理员控制用户访问相册时是否显示欢迎信
-- 📅 日期：2026-02-05
-- ================================================================================================

-- 添加 enable_welcome_letter 字段到 albums 表
ALTER TABLE public.albums
ADD COLUMN IF NOT EXISTS enable_welcome_letter boolean DEFAULT true;

-- 添加字段注释
COMMENT ON COLUMN public.albums.enable_welcome_letter IS '是否启用欢迎信显示（默认true）';

-- 更新现有记录，默认启用欢迎信
UPDATE public.albums
SET enable_welcome_letter = true
WHERE enable_welcome_letter IS NULL;

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ 欢迎信显示控制字段添加完成！';
  RAISE NOTICE '📋 已添加字段：';
  RAISE NOTICE '  - enable_welcome_letter (boolean, 默认 true)';
  RAISE NOTICE '💡 管理员可以在相册编辑界面控制是否显示欢迎信';
END $$;
