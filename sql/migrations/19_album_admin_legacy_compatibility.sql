-- ================================================================================================
-- 项目：拾光谣（photo）专属空间管理旧库兼容迁移
-- 日期：2026-04-03
-- 说明：
--   1. 兼容 Web 管理端 / 现版微信小程序 / 旧版微信小程序共用的专属空间后台链路；
--   2. 恢复旧库中可能缺失的专属空间扩展字段，避免列表 / 创建 / 编辑 / 上传赞赏码直接命中 Unknown column；
--   3. 保持幂等，可重复执行；
--   4. 仅补齐结构与默认值，不删除任何历史数据。
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_albums := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
);

SET @has_welcome_letter := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'welcome_letter'
);

SET @has_recipient_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'recipient_name'
);

SET @has_enable_welcome_letter := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'enable_welcome_letter'
);

SET @has_donation_qr_code_url := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'donation_qr_code_url'
);

SET @has_expires_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'expires_at'
);

SET @add_welcome_letter_sql := IF(
  @has_albums = 1 AND @has_welcome_letter = 0,
  'ALTER TABLE `albums` ADD COLUMN `welcome_letter` TEXT NULL AFTER `cover_url`',
  'SELECT 1'
);
PREPARE stmt_add_welcome_letter FROM @add_welcome_letter_sql;
EXECUTE stmt_add_welcome_letter;
DEALLOCATE PREPARE stmt_add_welcome_letter;

SET @add_recipient_name_sql := IF(
  @has_albums = 1 AND @has_recipient_name = 0,
  'ALTER TABLE `albums` ADD COLUMN `recipient_name` VARCHAR(128) NOT NULL DEFAULT ''拾光者'' AFTER `welcome_letter`',
  'SELECT 1'
);
PREPARE stmt_add_recipient_name FROM @add_recipient_name_sql;
EXECUTE stmt_add_recipient_name;
DEALLOCATE PREPARE stmt_add_recipient_name;

SET @add_enable_welcome_letter_sql := IF(
  @has_albums = 1 AND @has_enable_welcome_letter = 0,
  'ALTER TABLE `albums` ADD COLUMN `enable_welcome_letter` TINYINT(1) NOT NULL DEFAULT 1 AFTER `enable_tipping`',
  'SELECT 1'
);
PREPARE stmt_add_enable_welcome_letter FROM @add_enable_welcome_letter_sql;
EXECUTE stmt_add_enable_welcome_letter;
DEALLOCATE PREPARE stmt_add_enable_welcome_letter;

SET @add_donation_qr_code_url_sql := IF(
  @has_albums = 1 AND @has_donation_qr_code_url = 0,
  'ALTER TABLE `albums` ADD COLUMN `donation_qr_code_url` VARCHAR(1024) NULL AFTER `enable_welcome_letter`',
  'SELECT 1'
);
PREPARE stmt_add_donation_qr_code_url FROM @add_donation_qr_code_url_sql;
EXECUTE stmt_add_donation_qr_code_url;
DEALLOCATE PREPARE stmt_add_donation_qr_code_url;

SET @add_expires_at_sql := IF(
  @has_albums = 1 AND @has_expires_at = 0,
  'ALTER TABLE `albums` ADD COLUMN `expires_at` DATETIME NULL AFTER `donation_qr_code_url`',
  'SELECT 1'
);
PREPARE stmt_add_expires_at FROM @add_expires_at_sql;
EXECUTE stmt_add_expires_at;
DEALLOCATE PREPARE stmt_add_expires_at;

SET @has_recipient_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'recipient_name'
);

SET @normalize_recipient_name_sql := IF(
  @has_albums = 1 AND @has_recipient_name = 1,
  'UPDATE `albums`
      SET `recipient_name` = ''拾光者''
    WHERE `recipient_name` <=> NULL
       OR TRIM(`recipient_name`) = ''''',
  'SELECT 1'
);
PREPARE stmt_normalize_recipient_name FROM @normalize_recipient_name_sql;
EXECUTE stmt_normalize_recipient_name;
DEALLOCATE PREPARE stmt_normalize_recipient_name;

SET @has_enable_welcome_letter := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'enable_welcome_letter'
);

SET @normalize_enable_welcome_letter_sql := IF(
  @has_albums = 1 AND @has_enable_welcome_letter = 1,
  'UPDATE `albums`
      SET `enable_welcome_letter` = 1
    WHERE `enable_welcome_letter` <=> NULL',
  'SELECT 1'
);
PREPARE stmt_normalize_enable_welcome_letter FROM @normalize_enable_welcome_letter_sql;
EXECUTE stmt_normalize_enable_welcome_letter;
DEALLOCATE PREPARE stmt_normalize_enable_welcome_letter;

SET @modify_enable_welcome_letter_sql := IF(
  @has_albums = 1 AND @has_enable_welcome_letter = 1,
  'ALTER TABLE `albums` MODIFY COLUMN `enable_welcome_letter` TINYINT(1) NOT NULL DEFAULT 1',
  'SELECT 1'
);
PREPARE stmt_modify_enable_welcome_letter FROM @modify_enable_welcome_letter_sql;
EXECUTE stmt_modify_enable_welcome_letter;
DEALLOCATE PREPARE stmt_modify_enable_welcome_letter;

SET @has_idx_albums_expires_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND index_name = 'idx_albums_expires_at'
);

SET @add_idx_albums_expires_at_sql := IF(
  @has_albums = 1 AND @has_expires_at = 1 AND @has_idx_albums_expires_at = 0,
  'CREATE INDEX `idx_albums_expires_at` ON `albums` (`expires_at`)',
  'SELECT 1'
);
PREPARE stmt_add_idx_albums_expires_at FROM @add_idx_albums_expires_at_sql;
EXECUTE stmt_add_idx_albums_expires_at;
DEALLOCATE PREPARE stmt_add_idx_albums_expires_at;

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'albums'
      AND column_name = 'welcome_letter'
  ) AS has_welcome_letter,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'albums'
      AND column_name = 'recipient_name'
  ) AS has_recipient_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'albums'
      AND column_name = 'enable_welcome_letter'
  ) AS has_enable_welcome_letter,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'albums'
      AND column_name = 'donation_qr_code_url'
  ) AS has_donation_qr_code_url,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'albums'
      AND column_name = 'expires_at'
  ) AS has_expires_at,
  (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'albums'
      AND index_name = 'idx_albums_expires_at'
  ) AS has_expires_at_index;
