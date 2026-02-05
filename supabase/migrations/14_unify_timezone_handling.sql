-- ================================================================================================
-- 📂 项目：拾光谣 (Time Ballad) - 统一时区处理
-- 📝 版本：v1.0
-- 🎯 目标：将数据库时区从上海时区改为UTC，与应用层保持一致
-- 📅 日期：2026-02-05
-- ================================================================================================

-- 修改数据库时区为UTC，与应用层的UTC时间处理保持一致
-- 这样可以避免跨时区操作时的日期偏差问题
ALTER DATABASE postgres SET timezone TO 'UTC';

-- 注意：此迁移不会影响现有数据，因为：
-- 1. 所有日期字段都是DATE类型（无时区信息）或带时区的TIMESTAMPTZ类型
-- 2. DATE类型存储的是纯日期，不受时区影响
-- 3. TIMESTAMPTZ类型会自动转换为新时区显示，实际存储的UTC时间戳不变

-- 验证关键表的日期字段类型
DO $$
BEGIN
  -- 检查bookings表的booking_date字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bookings'
    AND column_name = 'booking_date'
    AND data_type = 'date'
  ) THEN
    RAISE EXCEPTION 'bookings.booking_date 字段类型不是DATE，时区迁移可能影响数据';
  END IF;

  -- 检查booking_blackouts表的date字段
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'booking_blackouts'
    AND column_name = 'date'
    AND data_type = 'date'
  ) THEN
    RAISE EXCEPTION 'booking_blackouts.date 字段类型不是DATE，时区迁移可能影响数据';
  END IF;

  RAISE NOTICE '时区迁移验证通过：所有日期字段类型正确';
END $$;
