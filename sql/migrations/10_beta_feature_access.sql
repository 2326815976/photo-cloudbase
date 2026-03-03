-- ================================================================================================
-- 项目：拾光谣（photo）功能内测系统
-- 日期：2026-03-03
-- 目标：新增内测路由、内测版本（密钥）与用户绑定关系
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS feature_beta_routes (
  id INT NOT NULL AUTO_INCREMENT,
  route_path VARCHAR(255) NOT NULL,
  route_title VARCHAR(128) NOT NULL,
  route_description VARCHAR(255) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_feature_beta_routes_path (route_path),
  KEY idx_feature_beta_routes_active (is_active),
  KEY idx_feature_beta_routes_title (route_title)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内测功能路由定义';

CREATE TABLE IF NOT EXISTS feature_beta_versions (
  id CHAR(36) NOT NULL,
  feature_name VARCHAR(128) NOT NULL,
  feature_description VARCHAR(255) NULL,
  feature_code VARCHAR(64) NOT NULL,
  route_id INT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  expires_at DATETIME NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_feature_beta_versions_code (feature_code),
  KEY idx_feature_beta_versions_route_id (route_id),
  KEY idx_feature_beta_versions_active (is_active),
  KEY idx_feature_beta_versions_expires_at (expires_at),
  CONSTRAINT fk_feature_beta_versions_route
    FOREIGN KEY (route_id) REFERENCES feature_beta_routes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_feature_beta_versions_creator
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='内测功能版本（密钥）';

CREATE TABLE IF NOT EXISTS user_beta_feature_bindings (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  feature_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_beta_feature_bindings_user_feature (user_id, feature_id),
  KEY idx_user_beta_feature_bindings_user_id (user_id),
  KEY idx_user_beta_feature_bindings_feature_id (feature_id),
  CONSTRAINT fk_user_beta_feature_bindings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_beta_feature_bindings_feature
    FOREIGN KEY (feature_id) REFERENCES feature_beta_versions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户绑定的内测功能';

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'feature_beta_routes'
  ) AS has_feature_beta_routes,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'feature_beta_versions'
  ) AS has_feature_beta_versions,
  (
    SELECT COUNT(*)
    FROM information_schema.tables
    WHERE table_schema = DATABASE()
      AND table_name = 'user_beta_feature_bindings'
  ) AS has_user_beta_feature_bindings;
