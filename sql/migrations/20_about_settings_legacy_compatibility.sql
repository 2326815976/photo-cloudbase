-- ================================================================================================
-- 项目：拾光谣（photo）关于设置旧库兼容迁移
-- 日期：2026-04-03
-- 说明：
--   1. 兼容 Web 后台“关于设置”、Web 前台“关于”、现版/旧版微信小程序“关于”页；
--   2. 兜底旧库未执行 `05_about_settings.sql` 或表结构残缺的场景；
--   3. 保证 `about_settings` 表、核心字段、`updated_at` 与索引存在；
--   4. 幂等执行，不删除现有数据。
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS `about_settings` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `author_name` VARCHAR(120) NULL,
  `phone` VARCHAR(32) NULL,
  `wechat` VARCHAR(64) NULL,
  `email` VARCHAR(255) NULL,
  `donation_qr_code` VARCHAR(1024) NULL,
  `author_message` TEXT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_about_settings_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='关于页面作者信息配置';

SET @has_author_name := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'author_name'
);

SET @has_phone := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'phone'
);

SET @has_wechat := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'wechat'
);

SET @has_email := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'email'
);

SET @has_donation_qr_code := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'donation_qr_code'
);

SET @has_author_message := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'author_message'
);

SET @has_created_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'created_at'
);

SET @has_updated_at := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND column_name = 'updated_at'
);

SET @add_author_name_sql := IF(
  @has_author_name = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `author_name` VARCHAR(120) NULL AFTER `id`',
  'SELECT 1'
);
PREPARE stmt_add_author_name FROM @add_author_name_sql;
EXECUTE stmt_add_author_name;
DEALLOCATE PREPARE stmt_add_author_name;

SET @add_phone_sql := IF(
  @has_phone = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `phone` VARCHAR(32) NULL AFTER `author_name`',
  'SELECT 1'
);
PREPARE stmt_add_phone FROM @add_phone_sql;
EXECUTE stmt_add_phone;
DEALLOCATE PREPARE stmt_add_phone;

SET @add_wechat_sql := IF(
  @has_wechat = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `wechat` VARCHAR(64) NULL AFTER `phone`',
  'SELECT 1'
);
PREPARE stmt_add_wechat FROM @add_wechat_sql;
EXECUTE stmt_add_wechat;
DEALLOCATE PREPARE stmt_add_wechat;

SET @add_email_sql := IF(
  @has_email = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `email` VARCHAR(255) NULL AFTER `wechat`',
  'SELECT 1'
);
PREPARE stmt_add_email FROM @add_email_sql;
EXECUTE stmt_add_email;
DEALLOCATE PREPARE stmt_add_email;

SET @add_donation_qr_code_sql := IF(
  @has_donation_qr_code = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `donation_qr_code` VARCHAR(1024) NULL AFTER `email`',
  'SELECT 1'
);
PREPARE stmt_add_donation_qr_code FROM @add_donation_qr_code_sql;
EXECUTE stmt_add_donation_qr_code;
DEALLOCATE PREPARE stmt_add_donation_qr_code;

SET @add_author_message_sql := IF(
  @has_author_message = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `author_message` TEXT NULL AFTER `donation_qr_code`',
  'SELECT 1'
);
PREPARE stmt_add_author_message FROM @add_author_message_sql;
EXECUTE stmt_add_author_message;
DEALLOCATE PREPARE stmt_add_author_message;

SET @add_created_at_sql := IF(
  @has_created_at = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP AFTER `author_message`',
  'SELECT 1'
);
PREPARE stmt_add_created_at FROM @add_created_at_sql;
EXECUTE stmt_add_created_at;
DEALLOCATE PREPARE stmt_add_created_at;

SET @add_updated_at_sql := IF(
  @has_updated_at = 0,
  'ALTER TABLE `about_settings` ADD COLUMN `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER `created_at`',
  'SELECT 1'
);
PREPARE stmt_add_updated_at FROM @add_updated_at_sql;
EXECUTE stmt_add_updated_at;
DEALLOCATE PREPARE stmt_add_updated_at;

SET @has_idx_about_settings_updated_at := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'about_settings'
    AND index_name = 'idx_about_settings_updated_at'
);

SET @add_idx_about_settings_updated_at_sql := IF(
  @has_idx_about_settings_updated_at = 0,
  'CREATE INDEX `idx_about_settings_updated_at` ON `about_settings` (`updated_at`)',
  'SELECT 1'
);
PREPARE stmt_add_idx_about_settings_updated_at FROM @add_idx_about_settings_updated_at_sql;
EXECUTE stmt_add_idx_about_settings_updated_at;
DEALLOCATE PREPARE stmt_add_idx_about_settings_updated_at;

INSERT INTO `about_settings` (
  `author_name`,
  `phone`,
  `wechat`,
  `email`,
  `donation_qr_code`,
  `author_message`
)
SELECT
  '作者',
  '',
  '',
  '',
  '',
  '感谢你的关注与支持，愿你在这里收获温柔与美好。'
WHERE NOT EXISTS (
  SELECT 1 FROM `about_settings` LIMIT 1
);

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'about_settings'
      AND column_name IN (
        'author_name',
        'phone',
        'wechat',
        'email',
        'donation_qr_code',
        'author_message',
        'created_at',
        'updated_at'
      )
  ) AS compatible_columns_count,
  (
    SELECT COUNT(*)
    FROM information_schema.statistics
    WHERE table_schema = DATABASE()
      AND table_name = 'about_settings'
      AND index_name = 'idx_about_settings_updated_at'
  ) AS has_updated_at_index,
  (
    SELECT COUNT(*)
    FROM `about_settings`
  ) AS settings_row_count;
