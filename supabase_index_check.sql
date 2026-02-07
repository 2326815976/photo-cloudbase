-- ================================================================================================
-- Supabase 配置和索引检查脚本
-- ================================================================================================

-- ================================================================================================
-- 1. 检查所有现有索引
-- ================================================================================================

SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('poses', 'pose_tags')
ORDER BY tablename, indexname;

-- ================================================================================================
-- 2. 检查 pose_tags.usage_count 索引是否存在
-- ================================================================================================

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'pose_tags'
  AND indexname = 'pose_tags_usage_count_idx';

-- ================================================================================================
-- 3. 检查 poses 表的 GIN 索引
-- ================================================================================================

SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'poses'
  AND (indexname LIKE '%tags%' OR indexname LIKE '%gin%');

-- ================================================================================================
-- 4. 检查索引使用情况
-- ================================================================================================

SELECT
  schemaname,
  relname as tablename,
  indexrelname as indexname,
  idx_scan as index_scans,
  idx_tup_read as tuples_read,
  idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE relname IN ('poses', 'pose_tags')
ORDER BY relname, idx_scan DESC;

-- ================================================================================================
-- 5. 分析首屏标签查询的执行计划
-- ================================================================================================

EXPLAIN ANALYZE
SELECT id, name, usage_count
FROM pose_tags
ORDER BY usage_count DESC
LIMIT 20;

-- ================================================================================================
-- 6. 分析无标签随机查询的执行计划（当前方式）
-- ================================================================================================

EXPLAIN ANALYZE
SELECT id, image_url, tags, view_count
FROM poses
LIMIT 50;

-- ================================================================================================
-- 7. 分析有标签查询的执行计划
-- ================================================================================================

EXPLAIN ANALYZE
SELECT id, image_url, tags, view_count
FROM poses
WHERE tags && ARRAY['俏皮']
LIMIT 50;

-- ================================================================================================
-- 8. 检查表统计信息
-- ================================================================================================

SELECT
  schemaname,
  relname as tablename,
  n_live_tup as row_count,
  n_dead_tup as dead_rows,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE relname IN ('poses', 'pose_tags');

-- ================================================================================================
-- 9. 检查表大小
-- ================================================================================================

SELECT
  schemaname || '.' || tablename as table_name,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as indexes_size
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('poses', 'pose_tags')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ================================================================================================
-- 10. 检查慢查询（如果启用了 pg_stat_statements）
-- ================================================================================================

SELECT
  query,
  calls,
  mean_exec_time,
  max_exec_time,
  stddev_exec_time
FROM pg_stat_statements
WHERE query LIKE '%poses%' OR query LIKE '%pose_tags%'
ORDER BY mean_exec_time DESC
LIMIT 10;
