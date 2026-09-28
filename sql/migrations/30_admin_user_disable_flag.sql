-- ================================================================================================
-- 项目：拾光谣（photo）后台用户禁用能力补充
-- 日期：2026-04-22
-- 目标：为 users 表补充后台禁用账号字段，并兼容重复执行
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_users := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
);

SET @has_users_is_disabled := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'is_disabled'
);

SET @has_users_disabled_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND column_name = 'disabled_at'
);

SET @has_idx_users_is_disabled := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'users'
    AND index_name = 'idx_users_is_disabled'
);

SET @add_users_is_disabled_sql := IF(
  @has_users = 1 AND @has_users_is_disabled = 0,
  'ALTER TABLE `users` ADD COLUMN `is_disabled` TINYINT(1) NOT NULL DEFAULT 0 AFTER `role`',
  'SELECT 1'
);
PREPARE stmt_add_users_is_disabled FROM @add_users_is_disabled_sql;
EXECUTE stmt_add_users_is_disabled;
DEALLOCATE PREPARE stmt_add_users_is_disabled;

SET @add_users_disabled_at_sql := IF(
  @has_users = 1 AND @has_users_disabled_at = 0,
  'ALTER TABLE `users` ADD COLUMN `disabled_at` DATETIME NULL AFTER `is_disabled`',
  'SELECT 1'
);
PREPARE stmt_add_users_disabled_at FROM @add_users_disabled_at_sql;
EXECUTE stmt_add_users_disabled_at;
DEALLOCATE PREPARE stmt_add_users_disabled_at;

SET @add_users_is_disabled_index_sql := IF(
  @has_users = 1 AND @has_idx_users_is_disabled = 0,
  'ALTER TABLE `users` ADD KEY `idx_users_is_disabled` (`is_disabled`)',
  'SELECT 1'
);
PREPARE stmt_add_users_is_disabled_index FROM @add_users_is_disabled_index_sql;
EXECUTE stmt_add_users_is_disabled_index;
DEALLOCATE PREPARE stmt_add_users_is_disabled_index;

SELECT
  COLUMN_NAME,
  COLUMN_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.columns
WHERE table_schema = DATABASE()
  AND table_name = 'users'
  AND column_name IN ('is_disabled', 'disabled_at')
ORDER BY ORDINAL_POSITION;
