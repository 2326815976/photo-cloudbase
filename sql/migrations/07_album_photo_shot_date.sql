-- ================================================================================================
-- 项目：拾光谣（photo）照片拍摄日期字段
-- 日期：2026-03-01
-- 目标：为 album_photos 增加 shot_date（拍摄日期）并回填历史数据
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

SET @has_shot_date := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'album_photos'
    AND column_name = 'shot_date'
);
SET @sql := IF(
  @has_album_photos = 1 AND @has_shot_date = 0,
  'ALTER TABLE `album_photos` ADD COLUMN `shot_date` DATE NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_album_photos = 1,
  'ALTER TABLE `album_photos` MODIFY COLUMN `shot_date` DATE NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @has_album_photos = 1,
  'UPDATE `album_photos` SET `shot_date` = DATE(`created_at`) WHERE `shot_date` IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT
  @db_name AS db_name,
  @has_album_photos AS has_album_photos,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = @db_name
      AND table_name = 'album_photos'
      AND column_name = 'shot_date'
  ) AS matched_shot_date_columns;
