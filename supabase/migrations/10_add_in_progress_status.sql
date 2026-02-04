-- ================================================================================================
-- 📂 项目：拾光谣 - 添加"进行中"状态到预约系统
-- 📝 版本：v1.0
-- 🎯 目标：支持约拍当天的"进行中"状态
-- 📅 日期：2026-02-04
-- ================================================================================================

-- ================================================================================================
-- 问题说明
-- ================================================================================================
-- 需求：添加"进行中"状态，用于约拍当天的订单
-- 状态流转：pending -> confirmed -> in_progress -> finished
--          pending/confirmed -> cancelled
-- ================================================================================================

-- 修改 bookings 表的状态约束，添加 in_progress 状态
DO $$
BEGIN
  -- 删除旧的状态约束
  ALTER TABLE public.bookings DROP CONSTRAINT IF EXISTS bookings_status_check;

  -- 添加新的状态约束，包含 in_progress
  ALTER TABLE public.bookings ADD CONSTRAINT bookings_status_check
    CHECK (status IN ('pending', 'confirmed', 'in_progress', 'finished', 'cancelled'));

  RAISE NOTICE '✅ 已添加 in_progress 状态到 bookings 表';
END $$;

-- 验证约束是否正确
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
    AND table_name = 'bookings'
    AND constraint_name = 'bookings_status_check'
  ) THEN
    RAISE NOTICE '✅ 验证成功：状态约束已更新';
  ELSE
    RAISE EXCEPTION '❌ 验证失败：状态约束未正确添加';
  END IF;
END $$;

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 迁移完成！';
  RAISE NOTICE '📋 已执行操作：';
  RAISE NOTICE '   - 更新 bookings 表状态约束，添加 in_progress 状态';
  RAISE NOTICE '   - 验证约束是否正确添加';
  RAISE NOTICE '💡 新的状态流转：';
  RAISE NOTICE '   - pending（待确认）-> confirmed（已确认）-> in_progress（进行中）-> finished（已完成）';
  RAISE NOTICE '   - pending/confirmed -> cancelled（已取消）';
END $$;
