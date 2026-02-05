-- ================================================================================================
-- 修复 booking_types 表的 updated_at 字段问题
-- 问题：触发器报错 "record 'new' has no field 'updated_at'"
-- 原因：表可能缺少 updated_at 字段或触发器配置有误
-- 日期：2026-02-05
-- ================================================================================================

-- 1. 检查并添加 updated_at 字段（如果不存在）
DO $$
BEGIN
  -- 检查 booking_types 表是否有 updated_at 字段
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'booking_types'
    AND column_name = 'updated_at'
  ) THEN
    -- 添加 updated_at 字段
    ALTER TABLE public.booking_types
    ADD COLUMN updated_at timestamptz DEFAULT now();

    RAISE NOTICE '✅ 已添加 booking_types.updated_at 字段';
  ELSE
    RAISE NOTICE '✓ booking_types.updated_at 字段已存在';
  END IF;
END $$;

-- 2. 确保触发器函数存在
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 3. 重新创建触发器
DROP TRIGGER IF EXISTS update_booking_types_updated_at ON public.booking_types;
CREATE TRIGGER update_booking_types_updated_at
  BEFORE UPDATE ON public.booking_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. 同样检查 allowed_cities 表
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'allowed_cities'
    AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.allowed_cities
    ADD COLUMN updated_at timestamptz DEFAULT now();

    RAISE NOTICE '✅ 已添加 allowed_cities.updated_at 字段';
  ELSE
    RAISE NOTICE '✓ allowed_cities.updated_at 字段已存在';
  END IF;
END $$;

-- 5. 重新创建 allowed_cities 触发器
DROP TRIGGER IF EXISTS update_allowed_cities_updated_at ON public.allowed_cities;
CREATE TRIGGER update_allowed_cities_updated_at
  BEFORE UPDATE ON public.allowed_cities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. 验证修复
DO $$
DECLARE
  booking_types_has_field boolean;
  allowed_cities_has_field boolean;
BEGIN
  -- 检查 booking_types
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'booking_types'
    AND column_name = 'updated_at'
  ) INTO booking_types_has_field;

  -- 检查 allowed_cities
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'allowed_cities'
    AND column_name = 'updated_at'
  ) INTO allowed_cities_has_field;

  IF booking_types_has_field AND allowed_cities_has_field THEN
    RAISE NOTICE '✅ 修复完成！所有表都有 updated_at 字段，触发器已重新创建';
  ELSE
    RAISE WARNING '⚠️ 修复可能未完全成功，请手动检查';
  END IF;
END $$;
