-- 专属空间定格开关兼容迁移
-- 为 albums 表补充 enable_freeze 字段，默认开启

SET @has_albums := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
);

SET @has_enable_freeze := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'enable_freeze'
);

SET @add_enable_freeze_sql := IF(
  @has_albums = 1 AND @has_enable_freeze = 0,
  'ALTER TABLE `albums` ADD COLUMN `enable_freeze` TINYINT(1) NOT NULL DEFAULT 1 AFTER `enable_welcome_letter`',
  'SELECT 1'
);
PREPARE stmt_add_enable_freeze FROM @add_enable_freeze_sql;
EXECUTE stmt_add_enable_freeze;
DEALLOCATE PREPARE stmt_add_enable_freeze;

SET @has_enable_freeze := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'enable_freeze'
);

SET @normalize_enable_freeze_sql := IF(
  @has_albums = 1 AND @has_enable_freeze = 1,
  'UPDATE `albums` SET `enable_freeze` = 1 WHERE `enable_freeze` IS NULL',
  'SELECT 1'
);
PREPARE stmt_normalize_enable_freeze FROM @normalize_enable_freeze_sql;
EXECUTE stmt_normalize_enable_freeze;
DEALLOCATE PREPARE stmt_normalize_enable_freeze;
