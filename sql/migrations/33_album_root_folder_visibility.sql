-- ================================================================================================
-- 项目：拾光谣（photo）相册根目录隐藏能力
-- 日期：2026-04-25
-- 目标：为 albums 补充 hide_root_folder 字段，支持后台隐藏公开照片墙根目录
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_albums := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
);

SET @has_hide_root_folder := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'hide_root_folder'
);

SET @add_hide_root_folder_sql := IF(
  @has_albums = 1 AND @has_hide_root_folder = 0,
  'ALTER TABLE `albums` ADD COLUMN `hide_root_folder` TINYINT(1) NOT NULL DEFAULT 0 AFTER `enable_freeze`',
  'SELECT 1'
);
PREPARE stmt_add_hide_root_folder FROM @add_hide_root_folder_sql;
EXECUTE stmt_add_hide_root_folder;
DEALLOCATE PREPARE stmt_add_hide_root_folder;

SET @has_hide_root_folder := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'hide_root_folder'
);

SET @normalize_hide_root_folder_sql := IF(
  @has_albums = 1 AND @has_hide_root_folder = 1,
  'UPDATE `albums` SET `hide_root_folder` = 0 WHERE `hide_root_folder` IS NULL',
  'SELECT 1'
);
PREPARE stmt_normalize_hide_root_folder FROM @normalize_hide_root_folder_sql;
EXECUTE stmt_normalize_hide_root_folder;
DEALLOCATE PREPARE stmt_normalize_hide_root_folder;
