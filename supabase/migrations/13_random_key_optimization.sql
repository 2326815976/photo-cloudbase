-- ================================================================================================
-- 📂 项目：拾光谣 - 随机键索引优化
-- 📝 版本：v1.0
-- 🎯 目标：添加随机键字段和索引，优化随机查询性能
-- 📅 日期：2026-02-07
-- ⚠️  警告：此迁移会锁表，请在低峰期执行
-- ================================================================================================

-- ================================================================================================
-- 执行前必读
-- ================================================================================================
-- 1. 锁表风险：ALTER TABLE + 全表 UPDATE 会锁表
-- 2. 执行时间：数据量 < 10万条约 1-2 分钟，> 10万条可能需要 5-10 分钟
-- 3. 执行时机：必须在低峰期（凌晨/维护窗口）执行
-- 4. 回滚方案：见 13_random_key_optimization_rollback.sql
-- ================================================================================================

-- ================================================================================================
-- 1. 添加随机键字段
-- ================================================================================================

-- 添加 rand_key 字段（带默认值，避免全表更新）
ALTER TABLE poses ADD COLUMN IF NOT EXISTS rand_key FLOAT DEFAULT random();

COMMENT ON COLUMN poses.rand_key IS '随机键，用于高效随机查询（避免 ORDER BY random()）';

-- ================================================================================================
-- 2. 为现有数据生成随机键
-- ================================================================================================

-- ⚠️ 警告：这一步会锁表，请确保在低峰期执行
UPDATE poses SET rand_key = random() WHERE rand_key IS NULL;

-- ================================================================================================
-- 3. 创建索引
-- ================================================================================================

-- ⚠️ 警告：这一步也会锁表
CREATE INDEX IF NOT EXISTS idx_poses_rand_key ON poses(rand_key);

COMMENT ON INDEX idx_poses_rand_key IS '随机键索引 - 优化随机查询性能（O(log n)）';

-- ================================================================================================
-- 4. 创建触发器（新插入数据自动生成随机键）
-- ================================================================================================

CREATE OR REPLACE FUNCTION set_rand_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.rand_key IS NULL THEN
    NEW.rand_key := random();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_rand_key ON poses;
CREATE TRIGGER trigger_set_rand_key
  BEFORE INSERT ON poses
  FOR EACH ROW
  EXECUTE FUNCTION set_rand_key();

COMMENT ON FUNCTION set_rand_key IS '自动为新插入的摆姿生成随机键';

-- ================================================================================================
-- 5. 验证迁移结果
-- ================================================================================================

DO $$
DECLARE
  total_count INT;
  null_count INT;
  index_exists BOOLEAN;
BEGIN
  -- 检查总记录数
  SELECT COUNT(*) INTO total_count FROM poses;

  -- 检查 NULL 值数量
  SELECT COUNT(*) INTO null_count FROM poses WHERE rand_key IS NULL;

  -- 检查索引是否存在
  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'poses' AND indexname = 'idx_poses_rand_key'
  ) INTO index_exists;

  -- 输出验证结果
  RAISE NOTICE '✅ 随机键优化迁移完成！';
  RAISE NOTICE '📊 验证结果：';
  RAISE NOTICE '  - 总记录数: %', total_count;
  RAISE NOTICE '  - NULL 值数量: %', null_count;
  RAISE NOTICE '  - 索引已创建: %', index_exists;

  -- 如果有问题，发出警告
  IF null_count > 0 THEN
    RAISE WARNING '⚠️ 发现 % 条记录的 rand_key 为 NULL，请检查！', null_count;
  END IF;

  IF NOT index_exists THEN
    RAISE WARNING '⚠️ 索引 idx_poses_rand_key 未创建成功，请检查！';
  END IF;

  -- 性能提示
  RAISE NOTICE '⚡ 预期性能提升：';
  RAISE NOTICE '  - 无标签随机查询：O(n) → O(log n)';
  RAISE NOTICE '  - 有标签随机查询：显著提升';
  RAISE NOTICE '  - 查询时间：预计降低 5-20 倍';
END $$;

-- ================================================================================================
-- 完成
-- ================================================================================================
