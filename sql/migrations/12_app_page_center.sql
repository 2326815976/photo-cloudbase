-- ================================================================================================
-- 项目：拾光谣（photo）页面发布中心
-- 日期：2026-03-27
-- 目标：新增页面注册、发布规则、内测码与用户绑定表，统一控制 Web 与微信小程序端展示
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS app_page_registry (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  page_key VARCHAR(64) NOT NULL,
  page_name VARCHAR(128) NOT NULL,
  page_description VARCHAR(255) NULL,
  route_path_web VARCHAR(255) NOT NULL,
  route_path_miniprogram VARCHAR(255) NOT NULL,
  preview_route_path_web VARCHAR(255) NOT NULL,
  preview_route_path_miniprogram VARCHAR(255) NOT NULL,
  tab_key VARCHAR(32) NULL,
  icon_key VARCHAR(32) NULL,
  default_tab_text VARCHAR(32) NOT NULL,
  default_guest_tab_text VARCHAR(32) NOT NULL,
  is_tab_candidate_miniprogram TINYINT(1) NOT NULL DEFAULT 0,
  supports_beta TINYINT(1) NOT NULL DEFAULT 1,
  supports_preview TINYINT(1) NOT NULL DEFAULT 1,
  is_builtin TINYINT(1) NOT NULL DEFAULT 1,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_page_registry_key (page_key),
  KEY idx_app_page_registry_active (is_active),
  KEY idx_app_page_registry_builtin (is_builtin)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='页面注册表';

CREATE TABLE IF NOT EXISTS app_page_publish_rules (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  page_id INT UNSIGNED NOT NULL,
  channel VARCHAR(32) NOT NULL,
  publish_state VARCHAR(32) NOT NULL DEFAULT 'offline',
  show_in_nav TINYINT(1) NOT NULL DEFAULT 0,
  nav_order INT NOT NULL DEFAULT 99,
  nav_text VARCHAR(32) NULL,
  guest_nav_text VARCHAR(32) NULL,
  is_home_entry TINYINT(1) NOT NULL DEFAULT 0,
  notes VARCHAR(255) NULL,
  updated_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_page_publish_rules_page_channel (page_id, channel),
  KEY idx_app_page_publish_rules_channel_state (channel, publish_state),
  KEY idx_app_page_publish_rules_nav (channel, show_in_nav, nav_order),
  CONSTRAINT fk_app_page_publish_rules_page
    FOREIGN KEY (page_id) REFERENCES app_page_registry(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_page_publish_rules_user
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='页面发布规则';

CREATE TABLE IF NOT EXISTS app_page_beta_codes (
  id CHAR(36) NOT NULL,
  page_id INT UNSIGNED NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'shared',
  beta_name VARCHAR(128) NOT NULL,
  beta_code VARCHAR(8) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_app_page_beta_codes_code (beta_code),
  KEY idx_app_page_beta_codes_page (page_id),
  KEY idx_app_page_beta_codes_active (is_active),
  KEY idx_app_page_beta_codes_channel (channel),
  CONSTRAINT fk_app_page_beta_codes_page
    FOREIGN KEY (page_id) REFERENCES app_page_registry(id) ON DELETE CASCADE,
  CONSTRAINT fk_app_page_beta_codes_user
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='页面内测码';

CREATE TABLE IF NOT EXISTS user_page_beta_bindings (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  page_id INT UNSIGNED NOT NULL,
  beta_code_id CHAR(36) NOT NULL,
  channel VARCHAR(32) NOT NULL DEFAULT 'shared',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_page_beta_bindings_user_page_channel (user_id, page_id, channel),
  KEY idx_user_page_beta_bindings_code (beta_code_id),
  KEY idx_user_page_beta_bindings_user (user_id),
  CONSTRAINT fk_user_page_beta_bindings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_page_beta_bindings_page
    FOREIGN KEY (page_id) REFERENCES app_page_registry(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_page_beta_bindings_code
    FOREIGN KEY (beta_code_id) REFERENCES app_page_beta_codes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户页面内测绑定';

INSERT INTO app_page_registry (
  page_key,
  page_name,
  page_description,
  route_path_web,
  route_path_miniprogram,
  preview_route_path_web,
  preview_route_path_miniprogram,
  tab_key,
  icon_key,
  default_tab_text,
  default_guest_tab_text,
  is_tab_candidate_miniprogram,
  supports_beta,
  supports_preview,
  is_builtin,
  is_active
)
SELECT
  seed.page_key,
  seed.page_name,
  seed.page_description,
  seed.route_path_web,
  seed.route_path_miniprogram,
  seed.preview_route_path_web,
  seed.preview_route_path_miniprogram,
  seed.tab_key,
  seed.icon_key,
  seed.default_tab_text,
  seed.default_guest_tab_text,
  seed.is_tab_candidate_miniprogram,
  1,
  1,
  1,
  1
FROM (
  SELECT 'pose' AS page_key, '摆姿推荐' AS page_name, '首页摆姿内容' AS page_description, '/' AS route_path_web, 'pages/index/index' AS route_path_miniprogram, '/?presentation=preview&page_key=pose' AS preview_route_path_web, '/pages/profile/beta/pose/index' AS preview_route_path_miniprogram, 'home' AS tab_key, 'home' AS icon_key, '首页' AS default_tab_text, '首页' AS default_guest_tab_text, 1 AS is_tab_candidate_miniprogram
  UNION ALL SELECT 'album', '提取', '返图与相册入口', '/album', 'pages/album/index', '/album?presentation=preview&page_key=album', '/pages/album/index', 'album', 'album', '提取', '提取', 1
  UNION ALL SELECT 'gallery', '照片墙', '公开照片墙', '/gallery', 'pages/gallery/index', '/gallery?presentation=preview&page_key=gallery', '/pages/gallery/index', 'gallery', 'gallery', '照片墙', '照片墙', 1
  UNION ALL SELECT 'booking', '约拍', '预约入口', '/booking', 'pages/booking/index', '/booking?presentation=preview&page_key=booking', '/pages/booking/index', 'booking', 'booking', '约拍', '约拍', 1
  UNION ALL SELECT 'profile', '我的', '个人中心', '/profile', 'pages/profile/index', '/profile?presentation=preview&page_key=profile', '/pages/profile/index', 'profile', 'profile', '我的', '我的', 1
  UNION ALL SELECT 'about', '关于', '关于页面', '/profile/about', 'pages/profile/about/index', '/profile/about?presentation=preview&page_key=about', '/pages/profile/about/index', NULL, NULL, '关于', '关于', 0
) AS seed
WHERE NOT EXISTS (
  SELECT 1 FROM app_page_registry current_registry WHERE current_registry.page_key = seed.page_key
);

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_registry'
  ) AS has_app_page_registry,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_publish_rules'
  ) AS has_app_page_publish_rules,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_beta_codes'
  ) AS has_app_page_beta_codes,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'user_page_beta_bindings'
  ) AS has_user_page_beta_bindings;
