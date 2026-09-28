-- ================================================================================================
-- 项目：拾光谣（photo）旧版微信小程序兼容修复
-- 日期：2026-04-03
-- 说明：
--   1. `17_database_cleanup.sql` 清理了若干历史兼容字段；
--   2. 旧版微信小程序与当前 CloudBase 通用查询元数据仍依赖以下字段：
--      - album_photos.url
--      - app_releases.storage_provider
--      - bookings.time_slot_start / bookings.time_slot_end
--      - profiles.payment_qr_code
--   3. 本迁移以最小、可重复执行的方式恢复这些兼容字段；
--   4. 其中 `album_photos.url` 除了补列和回填外，还会创建同步触发器，避免后续新数据再次失配。
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -----------------------------------------------------------------------------------------------
-- 0) 执行前结构探测
-- -----------------------------------------------------------------------------------------------

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

SET @has_app_releases := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'app_releases'
);

SET @has_app_releases_storage_provider := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_releases'
    AND column_name = 'storage_provider'
);

SET @has_bookings := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'bookings'
);

SET @has_booking_time_slot_start := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bookings'
    AND column_name = 'time_slot_start'
);

SET @has_booking_time_slot_end := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bookings'
    AND column_name = 'time_slot_end'
);

SET @has_profiles := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'profiles'
);

SET @has_profiles_payment_qr_code := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'profiles'
    AND column_name = 'payment_qr_code'
);

-- -----------------------------------------------------------------------------------------------
-- 1) 恢复 bookings.time_slot_start / bookings.time_slot_end
--    说明：当前通用查询元数据仍声明这两个字段；恢复后可避免旧查询直接命中 Unknown column。
-- -----------------------------------------------------------------------------------------------

SET @add_booking_time_slot_start_sql := IF(
  @has_bookings = 1 AND @has_booking_time_slot_start = 0,
  'ALTER TABLE `bookings` ADD COLUMN `time_slot_start` TIME NULL AFTER `booking_date`',
  'SELECT 1'
);
PREPARE stmt_add_booking_time_slot_start FROM @add_booking_time_slot_start_sql;
EXECUTE stmt_add_booking_time_slot_start;
DEALLOCATE PREPARE stmt_add_booking_time_slot_start;

SET @has_booking_time_slot_start := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'bookings'
    AND column_name = 'time_slot_start'
);

SET @add_booking_time_slot_end_sql := IF(
  @has_bookings = 1 AND @has_booking_time_slot_end = 0,
  'ALTER TABLE `bookings` ADD COLUMN `time_slot_end` TIME NULL AFTER `time_slot_start`',
  'SELECT 1'
);
PREPARE stmt_add_booking_time_slot_end FROM @add_booking_time_slot_end_sql;
EXECUTE stmt_add_booking_time_slot_end;
DEALLOCATE PREPARE stmt_add_booking_time_slot_end;

-- -----------------------------------------------------------------------------------------------
-- 2) 恢复 album_photos.url，并用现存多尺寸图片地址回填
--    说明：旧版照片墙管理 / 相册管理仍直接 select / insert 该字段。
-- -----------------------------------------------------------------------------------------------

SET @add_album_photos_url_sql := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 0,
  'ALTER TABLE `album_photos` ADD COLUMN `url` VARCHAR(1024) NULL AFTER `folder_id`',
  'SELECT 1'
);
PREPARE stmt_add_album_photos_url FROM @add_album_photos_url_sql;
EXECUTE stmt_add_album_photos_url;
DEALLOCATE PREPARE stmt_add_album_photos_url;

SET @has_album_photos_url := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'album_photos'
    AND column_name = 'url'
);

SET @backfill_album_photos_url_sql := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  'UPDATE `album_photos`
     SET `url` = COALESCE(
       NULLIF(TRIM(`url`), ''''),
       NULLIF(TRIM(`original_url`), ''''),
       NULLIF(TRIM(`preview_url`), ''''),
       NULLIF(TRIM(`thumbnail_url`), '''')
     )
   WHERE NULLIF(TRIM(COALESCE(`url`, '''')), '''') IS NULL
     AND (
       NULLIF(TRIM(COALESCE(`original_url`, '''')), '''') IS NOT NULL
       OR NULLIF(TRIM(COALESCE(`preview_url`, '''')), '''') IS NOT NULL
       OR NULLIF(TRIM(COALESCE(`thumbnail_url`, '''')), '''') IS NOT NULL
     )',
  'SELECT 1'
);
PREPARE stmt_backfill_album_photos_url FROM @backfill_album_photos_url_sql;
EXECUTE stmt_backfill_album_photos_url;
DEALLOCATE PREPARE stmt_backfill_album_photos_url;

-- 2.1) 为 album_photos.url 补齐持续同步触发器
--      说明：恢复 url 只修复存量数据还不够；若后续新代码只写入 original/preview/thumbnail，
--            旧版小程序再次 select `url` 时仍会失效，因此这里补充单语句触发器保证兼容列持续可用。

DROP TRIGGER IF EXISTS `trg_album_photos_legacy_url_before_insert`;
DROP TRIGGER IF EXISTS `trg_album_photos_legacy_url_before_update`;

CREATE TRIGGER `trg_album_photos_legacy_url_before_insert`
  BEFORE INSERT ON `album_photos`
  FOR EACH ROW
  SET NEW.`url` = COALESCE(
    NULLIF(TRIM(NEW.`url`), ''),
    NULLIF(TRIM(NEW.`original_url`), ''),
    NULLIF(TRIM(NEW.`preview_url`), ''),
    NULLIF(TRIM(NEW.`thumbnail_url`), '')
  );

CREATE TRIGGER `trg_album_photos_legacy_url_before_update`
  BEFORE UPDATE ON `album_photos`
  FOR EACH ROW
  SET NEW.`url` = COALESCE(
    NULLIF(TRIM(NEW.`url`), ''),
    NULLIF(TRIM(NEW.`original_url`), ''),
    NULLIF(TRIM(NEW.`preview_url`), ''),
    NULLIF(TRIM(NEW.`thumbnail_url`), '')
  );

-- -----------------------------------------------------------------------------------------------
-- 3) 恢复 app_releases.storage_provider 与索引
--    说明：旧版发布管理写入时仍会显式传 storage_provider = cloudbase。
-- -----------------------------------------------------------------------------------------------

SET @add_app_releases_storage_provider_sql := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider = 0,
  'ALTER TABLE `app_releases` ADD COLUMN `storage_provider` ENUM(''cloudbase'') NOT NULL DEFAULT ''cloudbase'' AFTER `download_url`',
  'SELECT 1'
);
PREPARE stmt_add_app_releases_storage_provider FROM @add_app_releases_storage_provider_sql;
EXECUTE stmt_add_app_releases_storage_provider;
DEALLOCATE PREPARE stmt_add_app_releases_storage_provider;

SET @has_app_releases_storage_provider := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_releases'
    AND column_name = 'storage_provider'
);

SET @normalize_app_releases_storage_provider_sql := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider = 1,
  'UPDATE `app_releases`
      SET `storage_provider` = ''cloudbase''
    WHERE `storage_provider` <> ''cloudbase''
       OR (`storage_provider` <=> NULL)',
  'SELECT 1'
);
PREPARE stmt_normalize_app_releases_storage_provider FROM @normalize_app_releases_storage_provider_sql;
EXECUTE stmt_normalize_app_releases_storage_provider;
DEALLOCATE PREPARE stmt_normalize_app_releases_storage_provider;

SET @modify_app_releases_storage_provider_sql := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider = 1,
  'ALTER TABLE `app_releases` MODIFY COLUMN `storage_provider` ENUM(''cloudbase'') NOT NULL DEFAULT ''cloudbase''',
  'SELECT 1'
);
PREPARE stmt_modify_app_releases_storage_provider FROM @modify_app_releases_storage_provider_sql;
EXECUTE stmt_modify_app_releases_storage_provider;
DEALLOCATE PREPARE stmt_modify_app_releases_storage_provider;

SET @has_app_releases_storage_provider_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_releases'
    AND index_name = 'idx_app_releases_storage_provider'
);

SET @add_app_releases_storage_provider_index_sql := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider = 1 AND @has_app_releases_storage_provider_index = 0,
  'CREATE INDEX `idx_app_releases_storage_provider` ON `app_releases` (`storage_provider`)',
  'SELECT 1'
);
PREPARE stmt_add_app_releases_storage_provider_index FROM @add_app_releases_storage_provider_index_sql;
EXECUTE stmt_add_app_releases_storage_provider_index;
DEALLOCATE PREPARE stmt_add_app_releases_storage_provider_index;

-- -----------------------------------------------------------------------------------------------
-- 4) 恢复 profiles.payment_qr_code
--    说明：当前 CloudBase 通用查询元数据仍保留该字段；恢复后避免结构与元数据失配。
-- -----------------------------------------------------------------------------------------------

SET @add_profiles_payment_qr_code_sql := IF(
  @has_profiles = 1 AND @has_profiles_payment_qr_code = 0,
  'ALTER TABLE `profiles` ADD COLUMN `payment_qr_code` VARCHAR(1024) NULL AFTER `wechat`',
  'SELECT 1'
);
PREPARE stmt_add_profiles_payment_qr_code FROM @add_profiles_payment_qr_code_sql;
EXECUTE stmt_add_profiles_payment_qr_code;
DEALLOCATE PREPARE stmt_add_profiles_payment_qr_code;

-- -----------------------------------------------------------------------------------------------
-- 5) 输出修复结果快照
-- -----------------------------------------------------------------------------------------------

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'bookings'
      AND column_name IN ('time_slot_start', 'time_slot_end')
  ) AS restored_booking_time_slot_columns,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'album_photos'
      AND column_name = 'url'
  ) AS restored_album_photos_url_column,
  (
    SELECT COUNT(*)
    FROM information_schema.triggers
    WHERE trigger_schema = DATABASE()
      AND trigger_name IN (
        'trg_album_photos_legacy_url_before_insert',
        'trg_album_photos_legacy_url_before_update'
      )
  ) AS restored_album_photos_url_sync_triggers,
  IF(
    @has_album_photos = 1,
    (
      SELECT COUNT(*)
      FROM `album_photos`
      WHERE (
        NULLIF(TRIM(COALESCE(`original_url`, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(`preview_url`, '')), '') IS NOT NULL
        OR NULLIF(TRIM(COALESCE(`thumbnail_url`, '')), '') IS NOT NULL
      )
        AND NULLIF(TRIM(COALESCE(`url`, '')), '') IS NULL
    ),
    0
  ) AS album_photos_rows_missing_legacy_url_after_restore,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_releases'
      AND column_name = 'storage_provider'
  ) AS restored_app_releases_storage_provider_column,
  (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'app_releases'
      AND index_name = 'idx_app_releases_storage_provider'
  ) AS restored_app_releases_storage_provider_index,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'profiles'
      AND column_name = 'payment_qr_code'
  ) AS restored_profiles_payment_qr_code_column;
