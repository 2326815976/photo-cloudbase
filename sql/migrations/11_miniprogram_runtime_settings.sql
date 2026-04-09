-- ================================================================================================
-- 项目：拾光谣（photo）微信小程序运行时配置
-- 日期：2026-03-26
-- 目标：新增 miniprogram_runtime_settings 表，用于后台动态控制小程序首页、登录方式、我的页与底部菜单
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS miniprogram_runtime_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  config_key VARCHAR(64) NOT NULL,
  config_name VARCHAR(128) NOT NULL,
  scene_code VARCHAR(32) NOT NULL DEFAULT 'review',
  legacy_hide_audit TINYINT(1) NOT NULL DEFAULT 1,
  home_mode VARCHAR(32) NOT NULL DEFAULT 'gallery',
  guest_profile_mode VARCHAR(32) NOT NULL DEFAULT 'about',
  auth_mode VARCHAR(32) NOT NULL DEFAULT 'wechat_only',
  tab_bar_items_json LONGTEXT NOT NULL,
  feature_flags_json LONGTEXT NOT NULL,
  notes VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_miniprogram_runtime_settings_key (config_key),
  KEY idx_miniprogram_runtime_settings_active (is_active),
  KEY idx_miniprogram_runtime_settings_scene (scene_code),
  KEY idx_miniprogram_runtime_settings_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='微信小程序运行时配置';

INSERT INTO miniprogram_runtime_settings (
  config_key,
  config_name,
  scene_code,
  legacy_hide_audit,
  home_mode,
  guest_profile_mode,
  auth_mode,
  tab_bar_items_json,
  feature_flags_json,
  notes,
  is_active
)
SELECT
  'default',
  '审核版配置',
  'review',
  1,
  'gallery',
  'about',
  'wechat_only',
  '[{"key":"gallery","iconKey":"gallery","pagePath":"pages/gallery/index","text":"照片墙","guestText":"照片墙","enabled":true},{"key":"album","iconKey":"album","pagePath":"pages/album/index","text":"提取","guestText":"提取","enabled":true},{"key":"profile","iconKey":"profile","pagePath":"pages/profile/index","text":"我的","guestText":"关于","enabled":true}]',
  '{"showProfileEdit":false,"showProfileBookings":false,"showDonationQrCode":false,"allowPoseBetaBypass":true}',
  '初始迁移默认沿用审核版场景，可在后台切换为正式版或自定义配置。',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM miniprogram_runtime_settings WHERE config_key = 'default'
);

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'miniprogram_runtime_settings'
  ) AS has_miniprogram_runtime_settings,
  (
    SELECT COUNT(*)
    FROM miniprogram_runtime_settings
    WHERE config_key = 'default'
  ) AS default_runtime_config_count;
