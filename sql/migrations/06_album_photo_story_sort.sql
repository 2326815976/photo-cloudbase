-- ================================================================================================
-- 项目：拾光谣（photo）照片故事与排序增强
-- 日期：2026-03-01
-- 目标：为 album_photos 增加「关于此刻」文案、高亮标记与排序字段
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE album_photos
  ADD COLUMN IF NOT EXISTS story_text TEXT NULL AFTER original_url,
  ADD COLUMN IF NOT EXISTS is_highlight TINYINT(1) NOT NULL DEFAULT 0 AFTER story_text,
  ADD COLUMN IF NOT EXISTS sort_order INT UNSIGNED NOT NULL DEFAULT 2147483647 AFTER is_highlight;

SET @idx_album_photos_album_folder_sort_exists = (
  SELECT COUNT(1)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'album_photos'
    AND index_name = 'idx_album_photos_album_folder_sort'
);
SET @idx_album_photos_album_folder_sort_sql = IF(
  @idx_album_photos_album_folder_sort_exists = 0,
  'CREATE INDEX idx_album_photos_album_folder_sort ON album_photos (album_id, folder_id, sort_order, created_at)',
  'SELECT 1'
);
PREPARE stmt_idx_album_photos_album_folder_sort FROM @idx_album_photos_album_folder_sort_sql;
EXECUTE stmt_idx_album_photos_album_folder_sort;
DEALLOCATE PREPARE stmt_idx_album_photos_album_folder_sort;
