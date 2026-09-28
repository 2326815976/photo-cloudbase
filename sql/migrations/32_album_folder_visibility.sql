-- ================================================================================================
-- 项目：拾光谣（photo）相册文件夹隐藏能力
-- 日期：2026-04-25
-- 目标：为 album_folders 补充 is_hidden 字段，支持后台隐藏公开照片墙文件夹
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_album_folders := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'album_folders'
);

SET @has_is_hidden := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'album_folders'
    AND column_name = 'is_hidden'
);

SET @add_is_hidden_sql := IF(
  @has_album_folders = 1 AND @has_is_hidden = 0,
  'ALTER TABLE `album_folders` ADD COLUMN `is_hidden` TINYINT(1) NOT NULL DEFAULT 0 AFTER `name`',
  'SELECT 1'
);
PREPARE stmt_add_is_hidden FROM @add_is_hidden_sql;
EXECUTE stmt_add_is_hidden;
DEALLOCATE PREPARE stmt_add_is_hidden;

SET @has_is_hidden := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'album_folders'
    AND column_name = 'is_hidden'
);

SET @normalize_is_hidden_sql := IF(
  @has_album_folders = 1 AND @has_is_hidden = 1,
  'UPDATE `album_folders` SET `is_hidden` = 0 WHERE `is_hidden` IS NULL',
  'SELECT 1'
);
PREPARE stmt_normalize_is_hidden FROM @normalize_is_hidden_sql;
EXECUTE stmt_normalize_is_hidden;
DEALLOCATE PREPARE stmt_normalize_is_hidden;
