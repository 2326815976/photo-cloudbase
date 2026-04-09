-- ================================================================================================
-- 项目：拾光谣（photo）数据库清洗
-- 日期：2026-04-02
-- 说明：基于 00~16 号迁移定义 + 当前 Web / 小程序 / 后端代码引用交叉检查，
--      本次仅清理高置信度冗余对象，避免误删仍在使用的业务结构。
-- 清洗范围：
--   1. 删除外来遗留表：relation_data_depart / sys_department / sys_user / cos_deletion_queue
--   2. 删除 bookings 未使用兼容字段：time_slot_start / time_slot_end
--   3. 删除 album_photos 历史兼容字段：url（迁移前先回填到 thumbnail_url / preview_url / original_url）
--   4. 删除 app_releases 冗余字段：storage_provider 及其索引（当前已固定为 CloudBase，无读取方）
--   5. 删除 profiles 历史遗留字段：payment_qr_code（已由 about_settings.donation_qr_code 替代）
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- -----------------------------------------------------------------------------------------------
-- 0) 清洗前快照
--    说明：仅记录高风险字段的占用情况，便于执行后复核。
-- -----------------------------------------------------------------------------------------------

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

SET @bookings_time_slot_start_rows_before_drop := IF(
  @has_bookings = 1 AND @has_booking_time_slot_start = 1,
  (SELECT COUNT(*) FROM `bookings` WHERE `time_slot_start` IS NOT NULL),
  0
);

SET @bookings_time_slot_end_rows_before_drop := IF(
  @has_bookings = 1 AND @has_booking_time_slot_end = 1,
  (SELECT COUNT(*) FROM `bookings` WHERE `time_slot_end` IS NOT NULL),
  0
);

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

SET @album_photos_url_rows_before_drop := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  (SELECT COUNT(*) FROM `album_photos` WHERE NULLIF(TRIM(`url`), '') IS NOT NULL),
  0
);

SET @album_photos_url_rows_needing_backfill_before_drop := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  (
    SELECT COUNT(*)
    FROM `album_photos`
    WHERE NULLIF(TRIM(`url`), '') IS NOT NULL
      AND (
        NULLIF(TRIM(`thumbnail_url`), '') IS NULL
        OR NULLIF(TRIM(`preview_url`), '') IS NULL
        OR NULLIF(TRIM(`original_url`), '') IS NULL
      )
  ),
  0
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

SET @app_releases_storage_provider_rows_before_drop := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider = 1,
  (SELECT COUNT(*) FROM `app_releases` WHERE NULLIF(TRIM(CAST(`storage_provider` AS CHAR)), '') IS NOT NULL),
  0
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

SET @profiles_payment_qr_code_rows_before_drop := IF(
  @has_profiles = 1 AND @has_profiles_payment_qr_code = 1,
  (SELECT COUNT(*) FROM `profiles` WHERE NULLIF(TRIM(`payment_qr_code`), '') IS NOT NULL),
  0
);

-- -----------------------------------------------------------------------------------------------
-- 1) 删除不在 photo 迁移基线中的遗留表
--    说明：这 4 张表不在 00~16 号迁移范围内，且当前代码无任何读写引用。
-- -----------------------------------------------------------------------------------------------

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `relation_data_depart`;
DROP TABLE IF EXISTS `sys_user`;
DROP TABLE IF EXISTS `sys_department`;
DROP TABLE IF EXISTS `cos_deletion_queue`;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------------------------
-- 2) 删除 bookings 未使用兼容字段
--    说明：time_slot_start / time_slot_end 为旧扩展位，当前 Web / 小程序 / 后端均无读写引用。
-- -----------------------------------------------------------------------------------------------

SET @drop_booking_time_slot_start_sql := IF(
  @has_bookings = 1 AND @has_booking_time_slot_start = 1,
  'ALTER TABLE `bookings` DROP COLUMN `time_slot_start`',
  'SELECT 1'
);
PREPARE stmt_drop_booking_time_slot_start FROM @drop_booking_time_slot_start_sql;
EXECUTE stmt_drop_booking_time_slot_start;
DEALLOCATE PREPARE stmt_drop_booking_time_slot_start;

SET @drop_booking_time_slot_end_sql := IF(
  @has_bookings = 1 AND @has_booking_time_slot_end = 1,
  'ALTER TABLE `bookings` DROP COLUMN `time_slot_end`',
  'SELECT 1'
);
PREPARE stmt_drop_booking_time_slot_end FROM @drop_booking_time_slot_end_sql;
EXECUTE stmt_drop_booking_time_slot_end;
DEALLOCATE PREPARE stmt_drop_booking_time_slot_end;

-- -----------------------------------------------------------------------------------------------
-- 3) 删除 album_photos 历史兼容字段
--    说明：url 为早期兼容列，当前主流程已统一使用 thumbnail_url / preview_url / original_url。
--    清洗前先尽可能回填，避免旧数据丢失访问地址。
-- -----------------------------------------------------------------------------------------------

SET @backfill_album_photos_urls_sql := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  '
    UPDATE `album_photos`
    SET
      `thumbnail_url` = COALESCE(NULLIF(TRIM(`thumbnail_url`), ''''), NULLIF(TRIM(`preview_url`), ''''), NULLIF(TRIM(`original_url`), ''''), NULLIF(TRIM(`url`), '''')),
      `preview_url` = COALESCE(NULLIF(TRIM(`preview_url`), ''''), NULLIF(TRIM(`original_url`), ''''), NULLIF(TRIM(`thumbnail_url`), ''''), NULLIF(TRIM(`url`), '''')),
      `original_url` = COALESCE(NULLIF(TRIM(`original_url`), ''''), NULLIF(TRIM(`preview_url`), ''''), NULLIF(TRIM(`thumbnail_url`), ''''), NULLIF(TRIM(`url`), ''''))
  ',
  'SELECT 1'
);
PREPARE stmt_backfill_album_photos_urls FROM @backfill_album_photos_urls_sql;
EXECUTE stmt_backfill_album_photos_urls;
DEALLOCATE PREPARE stmt_backfill_album_photos_urls;

SET @drop_album_photos_url_sql := IF(
  @has_album_photos = 1 AND @has_album_photos_url = 1,
  'ALTER TABLE `album_photos` DROP COLUMN `url`',
  'SELECT 1'
);
PREPARE stmt_drop_album_photos_url FROM @drop_album_photos_url_sql;
EXECUTE stmt_drop_album_photos_url;
DEALLOCATE PREPARE stmt_drop_album_photos_url;

-- -----------------------------------------------------------------------------------------------
-- 4) 删除 app_releases 冗余字段与关联索引
--    说明：storage_provider 当前仅允许 cloudbase，且业务侧不读取，属于 YAGNI 冗余字段。
-- -----------------------------------------------------------------------------------------------

SET @has_app_releases_storage_provider_index := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'app_releases'
    AND index_name = 'idx_app_releases_storage_provider'
);

SET @drop_app_releases_storage_provider_index_sql := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider_index = 1,
  'ALTER TABLE `app_releases` DROP INDEX `idx_app_releases_storage_provider`',
  'SELECT 1'
);
PREPARE stmt_drop_app_releases_storage_provider_index FROM @drop_app_releases_storage_provider_index_sql;
EXECUTE stmt_drop_app_releases_storage_provider_index;
DEALLOCATE PREPARE stmt_drop_app_releases_storage_provider_index;

SET @drop_app_releases_storage_provider_sql := IF(
  @has_app_releases = 1 AND @has_app_releases_storage_provider = 1,
  'ALTER TABLE `app_releases` DROP COLUMN `storage_provider`',
  'SELECT 1'
);
PREPARE stmt_drop_app_releases_storage_provider FROM @drop_app_releases_storage_provider_sql;
EXECUTE stmt_drop_app_releases_storage_provider;
DEALLOCATE PREPARE stmt_drop_app_releases_storage_provider;

-- -----------------------------------------------------------------------------------------------
-- 5) 删除 profiles 历史遗留字段
--    说明：payment_qr_code 已被 about_settings.donation_qr_code 取代，当前 Web / 小程序 / 后端均无读取方。
-- -----------------------------------------------------------------------------------------------

SET @drop_profiles_payment_qr_code_sql := IF(
  @has_profiles = 1 AND @has_profiles_payment_qr_code = 1,
  'ALTER TABLE `profiles` DROP COLUMN `payment_qr_code`',
  'SELECT 1'
);
PREPARE stmt_drop_profiles_payment_qr_code FROM @drop_profiles_payment_qr_code_sql;
EXECUTE stmt_drop_profiles_payment_qr_code;
DEALLOCATE PREPARE stmt_drop_profiles_payment_qr_code;

-- -----------------------------------------------------------------------------------------------
-- 6) 输出清洗结果快照
-- -----------------------------------------------------------------------------------------------

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name IN ('relation_data_depart', 'sys_user', 'sys_department', 'cos_deletion_queue')
  ) AS remaining_legacy_tables,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'bookings'
      AND column_name IN ('time_slot_start', 'time_slot_end')
  ) AS remaining_booking_time_slot_columns,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'album_photos'
      AND column_name = 'url'
  ) AS remaining_album_photo_url_column,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_releases'
      AND column_name = 'storage_provider'
  ) AS remaining_release_storage_provider_column,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'profiles'
      AND column_name = 'payment_qr_code'
  ) AS remaining_profile_payment_qr_code_column,
  @bookings_time_slot_start_rows_before_drop AS bookings_time_slot_start_rows_before_drop,
  @bookings_time_slot_end_rows_before_drop AS bookings_time_slot_end_rows_before_drop,
  @album_photos_url_rows_before_drop AS album_photos_url_rows_before_drop,
  @album_photos_url_rows_needing_backfill_before_drop AS album_photos_url_rows_needing_backfill_before_drop,
  @app_releases_storage_provider_rows_before_drop AS app_releases_storage_provider_rows_before_drop,
  @profiles_payment_qr_code_rows_before_drop AS profiles_payment_qr_code_rows_before_drop;
