-- ================================================================================================
-- 项目：拾光谣（photo）移除微信小程序 legacy_hide_audit 遗留字段
-- 日期：2026-05-09
-- 目标：HIDE_AUDIT 与 legacy_hide_audit 已由页面管理体系替代，清理数据库残余兼容列
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @has_miniprogram_runtime_settings := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'miniprogram_runtime_settings'
);

SET @has_legacy_hide_audit := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'miniprogram_runtime_settings'
    AND column_name = 'legacy_hide_audit'
);

SET @drop_legacy_hide_audit_sql := IF(
  @has_miniprogram_runtime_settings = 1 AND @has_legacy_hide_audit = 1,
  'ALTER TABLE `miniprogram_runtime_settings` DROP COLUMN `legacy_hide_audit`',
  'SELECT 1'
);

PREPARE stmt_drop_legacy_hide_audit FROM @drop_legacy_hide_audit_sql;
EXECUTE stmt_drop_legacy_hide_audit;
DEALLOCATE PREPARE stmt_drop_legacy_hide_audit;

SELECT
  DATABASE() AS db_name,
  @has_miniprogram_runtime_settings AS has_miniprogram_runtime_settings,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'miniprogram_runtime_settings'
      AND column_name = 'legacy_hide_audit'
  ) AS remaining_legacy_hide_audit_columns;
