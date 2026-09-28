-- ================================================================================================
-- Project: photo page center legacy compatibility repair
-- Date: 2026-04-04
-- Goal: restore page-center columns required by current Web / MiniProgram runtime and admin flows
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_app_page_registry := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'app_page_registry'
);

SET @has_registry_web_nav_candidate := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_page_registry'
    AND column_name = 'is_nav_candidate_web'
);

SET @add_registry_web_nav_candidate_sql := IF(
  @has_app_page_registry = 1 AND @has_registry_web_nav_candidate = 0,
  'ALTER TABLE `app_page_registry` ADD COLUMN `is_nav_candidate_web` TINYINT(1) NOT NULL DEFAULT 0 AFTER `default_guest_tab_text`',
  'SELECT 1'
);
PREPARE stmt_add_registry_web_nav_candidate FROM @add_registry_web_nav_candidate_sql;
EXECUTE stmt_add_registry_web_nav_candidate;
DEALLOCATE PREPARE stmt_add_registry_web_nav_candidate;

SET @sync_registry_web_nav_candidate_sql := IF(
  @has_app_page_registry = 1,
  'UPDATE `app_page_registry`
      SET `is_nav_candidate_web` = CASE
        WHEN NULLIF(TRIM(COALESCE(`icon_key`, '''')), '''') IS NOT NULL THEN 1
        ELSE 0
      END
    WHERE IFNULL(`is_nav_candidate_web`, 0) = 0',
  'SELECT 1'
);
PREPARE stmt_sync_registry_web_nav_candidate FROM @sync_registry_web_nav_candidate_sql;
EXECUTE stmt_sync_registry_web_nav_candidate;
DEALLOCATE PREPARE stmt_sync_registry_web_nav_candidate;

SET @repair_about_page_sql := IF(
  @has_app_page_registry = 1,
  'UPDATE `app_page_registry`
      SET `tab_key` = ''about'',
          `icon_key` = ''about'',
          `default_tab_text` = COALESCE(NULLIF(TRIM(`default_tab_text`), ''''), NULLIF(TRIM(`page_name`), ''''), ''about''),
          `default_guest_tab_text` = COALESCE(NULLIF(TRIM(`default_guest_tab_text`), ''''), NULLIF(TRIM(`page_name`), ''''), ''about''),
          `is_nav_candidate_web` = 1,
          `is_tab_candidate_miniprogram` = 1,
          `updated_at` = CURRENT_TIMESTAMP
    WHERE `page_key` = ''about''',
  'SELECT 1'
);
PREPARE stmt_repair_about_page FROM @repair_about_page_sql;
EXECUTE stmt_repair_about_page;
DEALLOCATE PREPARE stmt_repair_about_page;

SET @has_app_page_publish_rules := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'app_page_publish_rules'
);

SET @has_publish_rule_header_title := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_page_publish_rules'
    AND column_name = 'header_title'
);

SET @has_publish_rule_header_subtitle := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_page_publish_rules'
    AND column_name = 'header_subtitle'
);

SET @add_publish_rule_header_title_sql := IF(
  @has_app_page_publish_rules = 1 AND @has_publish_rule_header_title = 0,
  'ALTER TABLE `app_page_publish_rules` ADD COLUMN `header_title` VARCHAR(64) NULL AFTER `guest_nav_text`',
  'SELECT 1'
);
PREPARE stmt_add_publish_rule_header_title FROM @add_publish_rule_header_title_sql;
EXECUTE stmt_add_publish_rule_header_title;
DEALLOCATE PREPARE stmt_add_publish_rule_header_title;

SET @add_publish_rule_header_subtitle_sql := IF(
  @has_app_page_publish_rules = 1 AND @has_publish_rule_header_subtitle = 0,
  'ALTER TABLE `app_page_publish_rules` ADD COLUMN `header_subtitle` VARCHAR(64) NULL AFTER `header_title`',
  'SELECT 1'
);
PREPARE stmt_add_publish_rule_header_subtitle FROM @add_publish_rule_header_subtitle_sql;
EXECUTE stmt_add_publish_rule_header_subtitle;
DEALLOCATE PREPARE stmt_add_publish_rule_header_subtitle;

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_registry'
      AND column_name = 'is_nav_candidate_web'
  ) AS has_registry_web_nav_candidate,
  (
    SELECT COUNT(*)
    FROM app_page_registry
    WHERE page_key = 'about'
      AND tab_key = 'about'
      AND icon_key = 'about'
      AND IFNULL(is_nav_candidate_web, 0) = 1
      AND IFNULL(is_tab_candidate_miniprogram, 0) = 1
  ) AS about_page_nav_ready,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_publish_rules'
      AND column_name = 'header_title'
  ) AS has_publish_rule_header_title,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_publish_rules'
      AND column_name = 'header_subtitle'
  ) AS has_publish_rule_header_subtitle;
