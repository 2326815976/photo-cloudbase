-- ================================================================================================
-- 项目：拾光谣（photo）作者关于信息配置
-- 日期：2026-02-19
-- 目标：新增 about_settings 表，统一管理“关于”页面展示信息，并支持管理员后台编辑
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS about_settings (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  author_name VARCHAR(120) NULL,
  phone VARCHAR(32) NULL,
  wechat VARCHAR(64) NULL,
  email VARCHAR(255) NULL,
  donation_qr_code VARCHAR(1024) NULL,
  author_message TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_about_settings_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='关于页面作者信息配置';

INSERT INTO about_settings (
  author_name,
  phone,
  wechat,
  email,
  donation_qr_code,
  author_message
)
SELECT
  '作者',
  '',
  '',
  '',
  '',
  '感谢你的关注与支持，愿你在这里收获温柔与美好。'
WHERE NOT EXISTS (
  SELECT 1 FROM about_settings LIMIT 1
);
