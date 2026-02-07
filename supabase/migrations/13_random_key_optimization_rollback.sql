-- ================================================================================================
-- 📂 项目：拾光谣 - 随机键索引优化回滚脚本
-- 📝 版本：v1.0
-- 🎯 目标：回滚随机键优化迁移
-- 📅 日期：2026-02-07
-- ⚠️  警告：仅在需要回滚时执行
-- ================================================================================================

-- ================================================================================================
-- 回滚步骤
-- ================================================================================================

-- 1. 删除触发器
DROP TRIGGER IF EXISTS trigger_set_rand_key ON poses;

-- 2. 删除触发器函数
DROP FUNCTION IF EXISTS set_rand_key();

-- 3. 删除索引
DROP INDEX IF EXISTS idx_poses_rand_key;

-- 4. 删除字段
ALTER TABLE poses DROP COLUMN IF EXISTS rand_key;

-- ================================================================================================
-- 验证回滚结果
-- ================================================================================================

DO $$
DECLARE
  column_exists BOOLEAN;
  index_exists BOOLEAN;
  trigger_exists BOOLEAN;
BEGIN
  -- 检查字段是否已删除
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'poses' AND column_name = 'rand_key'
  ) INTO column_exists;

  -- 检查索引是否已删除
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'poses' AND indexname = 'idx_poses_rand_key'
  ) INTO index_exists;

  -- 检查触发器是否已删除
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trigger_set_rand_key'
  ) INTO trigger_exists;

  -- 输出验证结果
  RAISE NOTICE '✅ 随机键优化回滚完成！';
  RAISE NOTICE '📊 验证结果：';
  RAISE NOTICE '  - rand_key 字段已删除: %', NOT column_exists;
  RAISE NOTICE '  - 索引已删除: %', NOT index_exists;
  RAISE NOTICE '  - 触发器已删除: %', NOT trigger_exists;

  -- 如果有问题，发出警告
  IF column_exists THEN
    RAISE WARNING '⚠️ rand_key 字段未删除成功，请手动检查！';
  END IF;

  IF index_exists THEN
    RAISE WARNING '⚠️ 索引未删除成功，请手动检查！';
  END IF;

  IF trigger_exists THEN
    RAISE WARNING '⚠️ 触发器未删除成功，请手动检查！';
  END IF;
END $$;

-- ================================================================================================
-- 完成
-- ================================================================================================
