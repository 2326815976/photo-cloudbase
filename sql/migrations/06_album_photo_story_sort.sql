-- ================================================================================================
-- 项目：拾光谣（photo）照片故事与排序增强
-- 日期：2026-03-01
-- 目标：为 album_photos 增加「关于此刻」文案、高亮标记与排序字段
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @db_name := DATABASE();
SET @has_album_photos := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db_name
    AND table_name = 'album_photos'
);

SET @has_story_text := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'album_photos'
    AND column_name = 'story_text'
);
SET @sql := IF(
  @has_album_photos = 1 AND @has_story_text = 0,
  'ALTER TABLE `album_photos` ADD COLUMN `story_text` TEXT NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_is_highlight := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'album_photos'
    AND column_name = 'is_highlight'
);
SET @sql := IF(
  @has_album_photos = 1 AND @has_is_highlight = 0,
  'ALTER TABLE `album_photos` ADD COLUMN `is_highlight` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @has_sort_order := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'album_photos'
    AND column_name = 'sort_order'
);
SET @sql := IF(
  @has_album_photos = 1 AND @has_sort_order = 0,
  'ALTER TABLE `album_photos` ADD COLUMN `sort_order` INT UNSIGNED NOT NULL DEFAULT 2147483647',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 已存在列也统一收敛为目标定义，避免历史库定义不一致。
SET @sql := IF(
  @has_album_photos = 1,
  'ALTER TABLE `album_photos` MODIFY COLUMN `is_highlight` TINYINT(1) NOT NULL DEFAULT 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_album_photos = 1,
  'ALTER TABLE `album_photos` MODIFY COLUMN `sort_order` INT UNSIGNED NOT NULL DEFAULT 2147483647',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_album_photos = 1,
  'UPDATE `album_photos` SET `is_highlight` = 0 WHERE `is_highlight` IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_album_photos = 1,
  'UPDATE `album_photos` SET `sort_order` = 2147483647 WHERE `sort_order` IS NULL OR `sort_order` <= 0',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @idx_album_photos_album_folder_sort_exists = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'album_photos'
    AND index_name = 'idx_album_photos_album_folder_sort'
);
SET @idx_album_photos_album_folder_sort_sql = IF(
  @has_album_photos = 1 AND @idx_album_photos_album_folder_sort_exists = 0,
  'CREATE INDEX idx_album_photos_album_folder_sort ON album_photos (album_id, folder_id, sort_order, created_at)',
  'SELECT 1'
);
PREPARE stmt_idx_album_photos_album_folder_sort FROM @idx_album_photos_album_folder_sort_sql;
EXECUTE stmt_idx_album_photos_album_folder_sort;
DEALLOCATE PREPARE stmt_idx_album_photos_album_folder_sort;

SELECT
  @db_name AS db_name,
  @has_album_photos AS has_album_photos,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'album_photos'
      AND column_name IN ('story_text', 'is_highlight', 'sort_order')
  ) AS matched_story_sort_columns;
