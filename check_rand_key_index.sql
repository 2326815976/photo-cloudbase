-- ================================================================================================
-- 快速检查 rand_key 索引是否存在
-- ================================================================================================

-- 1. 检查 poses 表的所有索引（重点查看 idx_poses_rand_key）
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'poses'
ORDER BY indexname;

-- 2. 检查 rand_key 字段是否存在
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'poses'
  AND column_name = 'rand_key';

-- 3. 检查触发器是否存在
SELECT
  trigger_name,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'poses'
  AND trigger_name = 'trigger_set_rand_key';

-- 4. 测试随机查询性能（使用 rand_key）
EXPLAIN ANALYZE
SELECT id, image_url, tags, view_count, rand_key
FROM poses
WHERE rand_key >= 0.5
ORDER BY rand_key
LIMIT 1;
