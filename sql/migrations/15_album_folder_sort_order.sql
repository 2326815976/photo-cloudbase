-- ================================================================================================
-- 项目：拾光谣（photo）相册文件夹排序
-- 日期：2026-03-30
-- 目标：为照片墙 / 专属空间文件夹补充 sort_order，支持后台自定义顺序
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_album_folders := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'album_folders'
);

SET @has_sort_order := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'album_folders'
    AND column_name = 'sort_order'
);

SET @alter_add_sort_order_sql := IF(
  @has_album_folders = 1 AND @has_sort_order = 0,
  'ALTER TABLE `album_folders` ADD COLUMN `sort_order` INT UNSIGNED NOT NULL DEFAULT 2147483647 AFTER `name`',
  'SELECT 1'
);
PREPARE stmt_add_sort_order FROM @alter_add_sort_order_sql;
EXECUTE stmt_add_sort_order;
DEALLOCATE PREPARE stmt_add_sort_order;

SET @alter_fix_sort_order_sql := IF(
  @has_album_folders = 1,
  'ALTER TABLE `album_folders` MODIFY COLUMN `sort_order` INT UNSIGNED NOT NULL DEFAULT 2147483647',
  'SELECT 1'
);
PREPARE stmt_fix_sort_order FROM @alter_fix_sort_order_sql;
EXECUTE stmt_fix_sort_order;
DEALLOCATE PREPARE stmt_fix_sort_order;

SET @fill_empty_sort_order_sql := IF(
  @has_album_folders = 1,
  'UPDATE `album_folders` SET `sort_order` = 2147483647 WHERE `sort_order` IS NULL OR `sort_order` <= 0',
  'SELECT 1'
);
PREPARE stmt_fill_sort_order FROM @fill_empty_sort_order_sql;
EXECUTE stmt_fill_sort_order;
DEALLOCATE PREPARE stmt_fill_sort_order;

SET @has_sort_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'album_folders'
    AND index_name = 'idx_album_folders_album_sort'
);

SET @add_sort_index_sql := IF(
  @has_album_folders = 1 AND @has_sort_index = 0,
  'CREATE INDEX idx_album_folders_album_sort ON album_folders (album_id, sort_order, created_at)',
  'SELECT 1'
);
PREPARE stmt_add_sort_index FROM @add_sort_index_sql;
EXECUTE stmt_add_sort_index;
DEALLOCATE PREPARE stmt_add_sort_index;

SET @rebuild_sort_order_sql := IF(
  @has_album_folders = 1,
  '
    UPDATE album_folders target
    JOIN (
      SELECT
        id,
        (ROW_NUMBER() OVER (PARTITION BY album_id ORDER BY sort_order ASC, created_at ASC, id ASC) * 10) AS next_sort_order
      FROM album_folders
    ) ranked ON ranked.id = target.id
    SET target.sort_order = ranked.next_sort_order
  ',
  'SELECT 1'
);
PREPARE stmt_rebuild_sort_order FROM @rebuild_sort_order_sql;
EXECUTE stmt_rebuild_sort_order;
DEALLOCATE PREPARE stmt_rebuild_sort_order;

