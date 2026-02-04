-- ================================================================================================
-- 📂 项目：拾光谣 - 修复 bookings 表缺少 updated_at 字段的问题
-- 📝 版本：v1.0
-- 🎯 目标：添加 updated_at 字段到 bookings 表
-- 📅 日期：2026-02-04
-- ================================================================================================

-- ================================================================================================
-- 问题说明
-- ================================================================================================
-- 问题：管理员确认预约时失败，错误信息 "record 'new' has no field 'updated_at'"
-- 原因：bookings 表缺少 updated_at 字段，但触发器尝试更新这个字段
-- 解决：添加 updated_at 字段到 bookings 表
-- ================================================================================================

-- 添加 updated_at 字段（如果不存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'bookings'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.bookings
    ADD COLUMN updated_at timestamptz DEFAULT now();

    RAISE NOTICE '✅ 已添加 updated_at 字段到 bookings 表';
  ELSE
    RAISE NOTICE 'ℹ️  updated_at 字段已存在';
  END IF;
END $$;

-- 验证字段是否存在
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'bookings'
    AND column_name = 'updated_at'
  ) THEN
    RAISE NOTICE '✅ 验证成功：updated_at 字段存在于 bookings 表';
  ELSE
    RAISE EXCEPTION '❌ 验证失败：updated_at 字段不存在于 bookings 表';
  END IF;
END $$;

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 修复完成！';
  RAISE NOTICE '📋 已执行操作：';
  RAISE NOTICE '   - 检查并添加 updated_at 字段到 bookings 表';
  RAISE NOTICE '   - 验证字段是否正确添加';
  RAISE NOTICE '💡 建议：';
  RAISE NOTICE '   - 在 Supabase SQL Editor 中执行此迁移文件';
  RAISE NOTICE '   - 刷新管理员端预约管理界面';
  RAISE NOTICE '   - 重新尝试确认预约';
END $$;
