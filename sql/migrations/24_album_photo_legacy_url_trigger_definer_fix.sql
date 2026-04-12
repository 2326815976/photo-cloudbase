-- ================================================================================================
-- 项目：拾光筑迹（photo）album_photos 旧兼容触发器 definer 清理补丁
-- 目标：重建 album_photos.url 兼容触发器，移除历史数据库里失效的 definer（如 lumos@inner-ip）
-- 症状：任意 UPDATE album_photos 时出现
--        The user specified as a definer ('lumos'@'inner-ip') does not exist
-- 日期：2026-04-12
-- 说明：该补丁为幂等 SQL，可重复执行
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_album_photos := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'album_photos'
);

SET @has_album_photos_url := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'album_photos'
    AND column_name = 'url'
);

DROP TRIGGER IF EXISTS `trg_album_photos_legacy_url_before_insert`;
DROP TRIGGER IF EXISTS `trg_album_photos_legacy_url_before_update`;

SET @create_album_photos_legacy_url_before_insert_sql := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  'CREATE TRIGGER `trg_album_photos_legacy_url_before_insert`
     BEFORE INSERT ON `album_photos`
     FOR EACH ROW
     SET NEW.`url` = COALESCE(
       NULLIF(TRIM(NEW.`url`), ''''),
       NULLIF(TRIM(NEW.`original_url`), ''''),
       NULLIF(TRIM(NEW.`preview_url`), ''''),
       NULLIF(TRIM(NEW.`thumbnail_url`), '''')
     )',
  'SELECT 1'
);
PREPARE stmt_create_album_photos_legacy_url_before_insert FROM @create_album_photos_legacy_url_before_insert_sql;
EXECUTE stmt_create_album_photos_legacy_url_before_insert;
DEALLOCATE PREPARE stmt_create_album_photos_legacy_url_before_insert;

SET @create_album_photos_legacy_url_before_update_sql := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  'CREATE TRIGGER `trg_album_photos_legacy_url_before_update`
     BEFORE UPDATE ON `album_photos`
     FOR EACH ROW
     SET NEW.`url` = COALESCE(
       NULLIF(TRIM(NEW.`url`), ''''),
       NULLIF(TRIM(NEW.`original_url`), ''''),
       NULLIF(TRIM(NEW.`preview_url`), ''''),
       NULLIF(TRIM(NEW.`thumbnail_url`), '''')
     )',
  'SELECT 1'
);
PREPARE stmt_create_album_photos_legacy_url_before_update FROM @create_album_photos_legacy_url_before_update_sql;
EXECUTE stmt_create_album_photos_legacy_url_before_update;
DEALLOCATE PREPARE stmt_create_album_photos_legacy_url_before_update;

SELECT
  @has_album_photos AS album_photos_table_exists,
  @has_album_photos_url AS album_photos_url_column_exists,
  (
    SELECT COUNT(*)
    FROM information_schema.triggers
    WHERE trigger_schema = DATABASE()
      AND trigger_name IN (
        'trg_album_photos_legacy_url_before_insert',
        'trg_album_photos_legacy_url_before_update'
      )
  ) AS rebuilt_album_photos_legacy_url_trigger_count;
