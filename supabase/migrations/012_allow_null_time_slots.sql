-- ================================================================================================
-- 📂 项目：拾光谣 - 修复预约系统时间字段
-- 📝 版本：v1.1 - Allow NULL for time slots
-- 🎯 目标：
--   1. 移除 time_slot_start 和 time_slot_end 的 NOT NULL 约束
--   2. 为将来可能的时间段功能保留字段
-- 📅 日期：2026-02-04
-- ================================================================================================

-- 修改 time_slot_start 字段，允许 NULL
ALTER TABLE public.bookings
ALTER COLUMN time_slot_start DROP NOT NULL;

-- 修改 time_slot_end 字段，允许 NULL
ALTER TABLE public.bookings
ALTER COLUMN time_slot_end DROP NOT NULL;

-- 添加注释说明
COMMENT ON COLUMN public.bookings.time_slot_start IS '约拍时间段开始（可选，预留字段）';
COMMENT ON COLUMN public.bookings.time_slot_end IS '约拍时间段结束（可选，预留字段）';

-- 完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ 时间字段约束已修改！';
  RAISE NOTICE '📋 time_slot_start 和 time_slot_end 现在允许 NULL 值';
END $$;
