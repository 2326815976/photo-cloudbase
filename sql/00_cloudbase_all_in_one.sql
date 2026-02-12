-- ================================================================================================
-- 项目：拾光谣（photo）CloudBase SQL 一体化迁移脚本（全量 + 收敛补丁）
-- 日期：2026-02-12
-- 说明：你尚未执行 sql 目录脚本时，直接执行本文件即可。
-- 执行方式：Navicat 连接 CloudBase SQL 后，整文件一次执行。
-- ================================================================================================
-- ================================================================================================
-- 项目：拾光谣（photo）CloudBase SQL 全量初始化脚本
-- 目标：将旧 PostgreSQL + RLS + Auth + RPC 架构重构为 CloudBase SQL(MySQL 8) + 应用层权限
-- 日期：2026-02-12
-- 执行建议：在空数据库中执行（Navicat 直接运行）。
-- ================================================================================================

-- 【迁移与裁剪决策】
-- 1. 保留并迁移：业务核心表 + 高频查询索引 + 关键唯一约束。
-- 2. 新增：users / user_sessions / password_reset_tokens（替代旧认证系统，email 可空以适配手机号体系）。
-- 3. 裁剪：PostgreSQL 专属对象（RLS、policy、pg_cron、materialized view、storage schema、plpgsql RPC）。
-- 4. 权限控制迁移：RLS 改为应用层（lib/cloudbase/permissions.ts）。
-- 5. 兼容字段保留：
--    - album_photos.url（老数据兼容）
--    - bookings.time_slot_start / time_slot_end（当前低频，但保留扩展位）
-- 6. 存储分层：
--    - 安装包、图片等所有资源统一走 CloudBase 云存储
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';
SET sql_mode = 'STRICT_TRANS_TABLES,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION';
SET FOREIGN_KEY_CHECKS = 0;

-- ================================================================================================
-- 1) 认证与会话体系（替代旧认证体系）
-- ================================================================================================

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(32) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  deleted_at DATETIME NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_users_email (email),
  UNIQUE KEY uk_users_phone (phone),
  KEY idx_users_role (role),
  KEY idx_users_deleted_at (deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='应用层用户表（替代旧认证用户表）';

CREATE TABLE IF NOT EXISTS user_sessions (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_agent VARCHAR(512) NULL,
  ip_address VARCHAR(64) NULL,
  is_revoked TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_sessions_token_hash (token_hash),
  KEY idx_user_sessions_user_id (user_id),
  KEY idx_user_sessions_expires_at (expires_at),
  KEY idx_user_sessions_is_revoked (is_revoked),
  CONSTRAINT fk_user_sessions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='登录会话表';

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  token_hash VARCHAR(128) NOT NULL,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_password_reset_tokens_token_hash (token_hash),
  KEY idx_password_reset_tokens_user_id (user_id),
  KEY idx_password_reset_tokens_expires_at (expires_at),
  CONSTRAINT fk_password_reset_tokens_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='密码重置令牌表';

-- ================================================================================================
-- 2) 用户与统计
-- ================================================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id CHAR(36) NOT NULL,
  email VARCHAR(255) NULL,
  name VARCHAR(128) NULL,
  nickname VARCHAR(128) NULL,
  avatar VARCHAR(1024) NULL,
  role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
  phone VARCHAR(32) NULL,
  wechat VARCHAR(128) NULL,
  payment_qr_code VARCHAR(1024) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_active_at DATETIME NULL,
  PRIMARY KEY (id),
  KEY idx_profiles_phone (phone),
  KEY idx_profiles_wechat (wechat),
  KEY idx_profiles_role (role),
  CONSTRAINT fk_profiles_user
    FOREIGN KEY (id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户档案';

CREATE TABLE IF NOT EXISTS user_active_logs (
  user_id CHAR(36) NOT NULL,
  active_date DATE NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, active_date),
  KEY idx_user_active_logs_active_date (active_date),
  CONSTRAINT fk_user_active_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户活跃日志';

CREATE TABLE IF NOT EXISTS analytics_daily (
  date DATE NOT NULL,
  new_users_count INT NOT NULL DEFAULT 0,
  active_users_count INT NOT NULL DEFAULT 0,
  total_users_count INT NOT NULL DEFAULT 0,
  admin_users_count INT NOT NULL DEFAULT 0,
  total_albums_count INT NOT NULL DEFAULT 0,
  new_albums_count INT NOT NULL DEFAULT 0,
  expired_albums_count INT NOT NULL DEFAULT 0,
  tipping_enabled_albums_count INT NOT NULL DEFAULT 0,
  total_photos_count INT NOT NULL DEFAULT 0,
  new_photos_count INT NOT NULL DEFAULT 0,
  public_photos_count INT NOT NULL DEFAULT 0,
  private_photos_count INT NOT NULL DEFAULT 0,
  total_photo_views BIGINT NOT NULL DEFAULT 0,
  total_photo_likes BIGINT NOT NULL DEFAULT 0,
  total_photo_comments INT NOT NULL DEFAULT 0,
  total_bookings_count INT NOT NULL DEFAULT 0,
  new_bookings_count INT NOT NULL DEFAULT 0,
  pending_bookings_count INT NOT NULL DEFAULT 0,
  confirmed_bookings_count INT NOT NULL DEFAULT 0,
  finished_bookings_count INT NOT NULL DEFAULT 0,
  cancelled_bookings_count INT NOT NULL DEFAULT 0,
  total_poses_count INT NOT NULL DEFAULT 0,
  new_poses_count INT NOT NULL DEFAULT 0,
  total_pose_tags_count INT NOT NULL DEFAULT 0,
  total_pose_views BIGINT NOT NULL DEFAULT 0,
  PRIMARY KEY (date),
  KEY idx_analytics_daily_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='后台统计日快照';

-- ================================================================================================
-- 3) 摆姿系统
-- ================================================================================================

CREATE TABLE IF NOT EXISTS poses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  image_url VARCHAR(1024) NOT NULL,
  storage_path VARCHAR(1024) NULL,
  tags JSON NULL,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  rand_key DOUBLE NULL,
  PRIMARY KEY (id),
  KEY idx_poses_created_at (created_at),
  KEY idx_poses_rand_key (rand_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='摆姿资源表';

CREATE TABLE IF NOT EXISTS pose_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  usage_count INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_pose_tags_name (name),
  KEY idx_pose_tags_usage_count (usage_count),
  KEY idx_pose_tags_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='摆姿标签';

-- ================================================================================================
-- 4) 相册与照片
-- ================================================================================================

CREATE TABLE IF NOT EXISTS albums (
  id CHAR(36) NOT NULL,
  access_key VARCHAR(32) NOT NULL,
  title VARCHAR(255) NULL,
  cover_url VARCHAR(1024) NULL,
  welcome_letter TEXT NULL,
  recipient_name VARCHAR(128) NOT NULL DEFAULT '拾光者',
  enable_tipping TINYINT(1) NOT NULL DEFAULT 1,
  enable_welcome_letter TINYINT(1) NOT NULL DEFAULT 1,
  donation_qr_code_url VARCHAR(1024) NULL,
  expires_at DATETIME NULL,
  created_by CHAR(36) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_albums_access_key (access_key),
  KEY idx_albums_expires_at (expires_at),
  KEY idx_albums_created_at (created_at),
  KEY idx_albums_created_by (created_by),
  CONSTRAINT fk_albums_creator
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='相册';

CREATE TABLE IF NOT EXISTS album_folders (
  id CHAR(36) NOT NULL,
  album_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_album_folders_album_id (album_id),
  KEY idx_album_folders_created_at (created_at),
  CONSTRAINT fk_album_folders_album
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='相册文件夹';

CREATE TABLE IF NOT EXISTS album_photos (
  id CHAR(36) NOT NULL,
  album_id CHAR(36) NOT NULL,
  folder_id CHAR(36) NULL,
  url VARCHAR(1024) NULL,
  thumbnail_url VARCHAR(1024) NULL,
  preview_url VARCHAR(1024) NULL,
  original_url VARCHAR(1024) NULL,
  width INT NULL,
  height INT NULL,
  blurhash VARCHAR(255) NULL,
  is_public TINYINT(1) NOT NULL DEFAULT 0,
  view_count INT UNSIGNED NOT NULL DEFAULT 0,
  like_count INT UNSIGNED NOT NULL DEFAULT 0,
  rating INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_album_photos_album_id (album_id),
  KEY idx_album_photos_folder_id (folder_id),
  KEY idx_album_photos_public_created (is_public, created_at),
  KEY idx_album_photos_created_at (created_at),
  KEY idx_album_photos_public_likes (like_count, created_at),
  CONSTRAINT fk_album_photos_album
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE,
  CONSTRAINT fk_album_photos_folder
    FOREIGN KEY (folder_id) REFERENCES album_folders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='相册照片';

CREATE TABLE IF NOT EXISTS photo_comments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  photo_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  nickname VARCHAR(128) NOT NULL DEFAULT '访客',
  content TEXT NOT NULL,
  is_admin_reply TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_photo_comments_photo_id (photo_id),
  KEY idx_photo_comments_user_id (user_id),
  KEY idx_photo_comments_created_at (created_at),
  CONSTRAINT fk_photo_comments_photo
    FOREIGN KEY (photo_id) REFERENCES album_photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_comments_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='照片评论';

CREATE TABLE IF NOT EXISTS photo_likes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id CHAR(36) NOT NULL,
  photo_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_photo_likes_user_photo (user_id, photo_id),
  KEY idx_photo_likes_photo_id (photo_id),
  KEY idx_photo_likes_created_at (created_at),
  CONSTRAINT fk_photo_likes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_likes_photo
    FOREIGN KEY (photo_id) REFERENCES album_photos(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='照片点赞';

CREATE TABLE IF NOT EXISTS user_album_bindings (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  album_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_album_bindings_user_album (user_id, album_id),
  KEY idx_user_album_bindings_user_id (user_id),
  KEY idx_user_album_bindings_album_id (album_id),
  CONSTRAINT fk_user_album_bindings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_user_album_bindings_album
    FOREIGN KEY (album_id) REFERENCES albums(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户-相册绑定';

CREATE TABLE IF NOT EXISTS photo_views (
  id CHAR(36) NOT NULL,
  photo_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  session_id VARCHAR(128) NULL,
  viewed_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_photo_views_user (photo_id, user_id),
  UNIQUE KEY uk_photo_views_session (photo_id, session_id),
  KEY idx_photo_views_photo_id (photo_id),
  KEY idx_photo_views_user_id (user_id),
  KEY idx_photo_views_session_id (session_id),
  KEY idx_photo_views_viewed_at (viewed_at),
  CONSTRAINT fk_photo_views_photo
    FOREIGN KEY (photo_id) REFERENCES album_photos(id) ON DELETE CASCADE,
  CONSTRAINT fk_photo_views_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='照片浏览去重记录';

-- ================================================================================================
-- 5) 预约系统
-- ================================================================================================

CREATE TABLE IF NOT EXISTS booking_types (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(128) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_booking_types_name (name),
  KEY idx_booking_types_is_active (is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='约拍类型';

CREATE TABLE IF NOT EXISTS allowed_cities (
  id INT NOT NULL AUTO_INCREMENT,
  city_name VARCHAR(128) NOT NULL,
  province VARCHAR(128) NULL,
  city_code VARCHAR(32) NULL,
  latitude DECIMAL(10, 6) NULL,
  longitude DECIMAL(10, 6) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_allowed_cities_is_active (is_active),
  KEY idx_allowed_cities_city_name (city_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='允许预约城市';

CREATE TABLE IF NOT EXISTS bookings (
  id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  type_id INT NOT NULL,
  booking_date DATE NOT NULL,
  time_slot_start TIME NULL,
  time_slot_end TIME NULL,
  location VARCHAR(255) NOT NULL,
  latitude DECIMAL(10, 6) NULL,
  longitude DECIMAL(10, 6) NULL,
  city_name VARCHAR(128) NULL,
  phone VARCHAR(32) NOT NULL,
  wechat VARCHAR(128) NOT NULL,
  notes TEXT NULL,
  status ENUM('pending', 'confirmed', 'in_progress', 'finished', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  active_booking_date DATE
    GENERATED ALWAYS AS (
      CASE
        WHEN status IN ('pending', 'confirmed', 'in_progress') THEN booking_date
        ELSE NULL
      END
    ) STORED,
  active_booking_user_id CHAR(36)
    GENERATED ALWAYS AS (
      CASE
        WHEN status IN ('pending', 'confirmed', 'in_progress') THEN user_id
        ELSE NULL
      END
    ) STORED,
  PRIMARY KEY (id),
  UNIQUE KEY uk_bookings_active_date (active_booking_date),
  UNIQUE KEY uk_bookings_active_user (active_booking_user_id),
  KEY idx_bookings_user_id (user_id),
  KEY idx_bookings_type_id (type_id),
  KEY idx_bookings_status (status),
  KEY idx_bookings_booking_date (booking_date),
  KEY idx_bookings_status_date (status, booking_date),
  KEY idx_bookings_created_at (created_at),
  CONSTRAINT fk_bookings_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_bookings_type
    FOREIGN KEY (type_id) REFERENCES booking_types(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='预约主表';

CREATE TABLE IF NOT EXISTS booking_blackouts (
  id INT NOT NULL AUTO_INCREMENT,
  date DATE NOT NULL,
  reason VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_booking_blackouts_date (date),
  KEY idx_booking_blackouts_date (date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='档期锁定';

-- ================================================================================================
-- 6) 版本发布、安全限流
-- ================================================================================================

CREATE TABLE IF NOT EXISTS app_releases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  version VARCHAR(64) NOT NULL,
  platform VARCHAR(32) NOT NULL,
  download_url VARCHAR(1024) NOT NULL,
  storage_provider ENUM('cloudbase') NOT NULL DEFAULT 'cloudbase',
  storage_file_id VARCHAR(512) NULL,
  update_log TEXT NULL,
  force_update TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_app_releases_platform (platform),
  KEY idx_app_releases_storage_provider (storage_provider),
  KEY idx_app_releases_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='版本发布记录';

CREATE TABLE IF NOT EXISTS ip_registration_attempts (
  id CHAR(36) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  attempted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  success TINYINT(1) NOT NULL DEFAULT 0,
  user_agent VARCHAR(512) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ip_registration_attempts_ip (ip_address),
  KEY idx_ip_registration_attempts_attempted_at (attempted_at DESC),
  KEY idx_ip_registration_attempts_ip_time (ip_address, attempted_at DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='IP 注册尝试记录';

SET FOREIGN_KEY_CHECKS = 1;

-- ================================================================================================
-- 7) 初始化数据
-- ================================================================================================

INSERT INTO booking_types (name, description, is_active)
VALUES
  ('互勉', '互相勉励的约拍', 1),
  ('常规约拍', '普通的摄影约拍', 1),
  ('婚礼跟拍', '婚礼现场跟拍', 1),
  ('活动记录', '活动现场记录', 1)
ON DUPLICATE KEY UPDATE
  description = VALUES(description),
  is_active = VALUES(is_active);

INSERT INTO albums (
  id,
  access_key,
  title,
  cover_url,
  welcome_letter,
  recipient_name,
  enable_tipping,
  enable_welcome_letter,
  donation_qr_code_url,
  expires_at,
  created_by,
  created_at
)
SELECT
  '00000000-0000-0000-0000-000000000000',
  'WALL0000',
  '照片墙系统',
  NULL,
  NULL,
  '拾光者',
  0,
  0,
  NULL,
  NULL,
  NULL,
  CURRENT_TIMESTAMP
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1
  FROM albums
  WHERE id = '00000000-0000-0000-0000-000000000000'
);

-- ================================================================================================
-- 8) 触发器与维护过程（替代 PG trigger 行为）
-- ================================================================================================

DROP PROCEDURE IF EXISTS sp_rebuild_pose_tag_usage_counts;
DELIMITER $$
CREATE PROCEDURE sp_rebuild_pose_tag_usage_counts()
BEGIN
  UPDATE pose_tags t
  SET usage_count = (
    SELECT COUNT(*)
    FROM poses p
    WHERE p.tags IS NOT NULL
      AND JSON_SEARCH(p.tags, 'one', t.name) IS NOT NULL
  );
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_poses_set_rand_key;
DELIMITER $$
CREATE TRIGGER trg_poses_set_rand_key
BEFORE INSERT ON poses
FOR EACH ROW
BEGIN
  IF NEW.rand_key IS NULL THEN
    SET NEW.rand_key = RAND();
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_poses_after_insert;
DELIMITER $$
CREATE TRIGGER trg_poses_after_insert
AFTER INSERT ON poses
FOR EACH ROW
BEGIN
  CALL sp_rebuild_pose_tag_usage_counts();
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_poses_after_update;
DELIMITER $$
CREATE TRIGGER trg_poses_after_update
AFTER UPDATE ON poses
FOR EACH ROW
BEGIN
  CALL sp_rebuild_pose_tag_usage_counts();
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_poses_after_delete;
DELIMITER $$
CREATE TRIGGER trg_poses_after_delete
AFTER DELETE ON poses
FOR EACH ROW
BEGIN
  CALL sp_rebuild_pose_tag_usage_counts();
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pose_tags_before_update;
DELIMITER $$
CREATE TRIGGER trg_pose_tags_before_update
BEFORE UPDATE ON pose_tags
FOR EACH ROW
BEGIN
  IF NEW.name <> OLD.name THEN
    UPDATE poses
    SET tags = JSON_SET(tags, JSON_UNQUOTE(JSON_SEARCH(tags, 'one', OLD.name)), NEW.name)
    WHERE tags IS NOT NULL
      AND JSON_SEARCH(tags, 'one', OLD.name) IS NOT NULL;
  END IF;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pose_tags_before_delete;
DELIMITER $$
CREATE TRIGGER trg_pose_tags_before_delete
BEFORE DELETE ON pose_tags
FOR EACH ROW
BEGIN
  UPDATE poses
  SET tags = JSON_REMOVE(tags, JSON_UNQUOTE(JSON_SEARCH(tags, 'one', OLD.name)))
  WHERE tags IS NOT NULL
    AND JSON_SEARCH(tags, 'one', OLD.name) IS NOT NULL;
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pose_tags_after_insert;
DELIMITER $$
CREATE TRIGGER trg_pose_tags_after_insert
AFTER INSERT ON pose_tags
FOR EACH ROW
BEGIN
  CALL sp_rebuild_pose_tag_usage_counts();
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pose_tags_after_update;
DELIMITER $$
CREATE TRIGGER trg_pose_tags_after_update
AFTER UPDATE ON pose_tags
FOR EACH ROW
BEGIN
  CALL sp_rebuild_pose_tag_usage_counts();
END$$
DELIMITER ;

DROP TRIGGER IF EXISTS trg_pose_tags_after_delete;
DELIMITER $$
CREATE TRIGGER trg_pose_tags_after_delete
AFTER DELETE ON pose_tags
FOR EACH ROW
BEGIN
  CALL sp_rebuild_pose_tag_usage_counts();
END$$
DELIMITER ;

-- 初始化一次 usage_count，确保老数据一致。
CALL sp_rebuild_pose_tag_usage_counts();

-- ================================================================================================
-- 9) 备注（执行后）
-- ================================================================================================
-- 1. 本脚本仅创建表结构、索引、约束、默认数据，不创建数据库函数型 RPC（由应用层 rpc-engine.ts 承担）。
-- 2. 旧 RLS 已迁移为应用层权限，请勿绕过应用层 API 直接给前端暴露 SQL 凭据。
-- 3. 若需从旧库迁移数据，请按表顺序导入，并先完成 users/profiles 的主键映射。
-- ================================================================================================


-- ================================================================================================
-- 以下为收敛补丁（合并自 02_incremental_release_storage_patch.sql）
-- ================================================================================================

-- ================================================================================================
-- 项目：拾光谣（photo）CloudBase SQL 增量补丁（第三轮复盘）
-- 目标：将已执行旧版 SQL 的数据库升级为 CloudBase 存储全量模式
-- 适用：你已执行过早期脚本，且库里可能仍保留旧存储相关结构
-- 日期：2026-02-12
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

SET @db_name := DATABASE();

-- 1) 检查 app_releases 表是否存在
SET @table_exists := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db_name
    AND table_name = 'app_releases'
);

-- 2) 补齐 storage_provider 字段（CloudBase-only）
SET @has_storage_provider := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'app_releases'
    AND column_name = 'storage_provider'
);

SET @sql := IF(
  @table_exists = 1 AND @has_storage_provider = 0,
  'ALTER TABLE `app_releases` ADD COLUMN `storage_provider` ENUM(''cloudbase'') NOT NULL DEFAULT ''cloudbase'' AFTER `download_url`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3) 若已存在 storage_provider，强制收敛到 cloudbase
SET @sql := IF(
  @table_exists = 1 AND @has_storage_provider = 1,
  'UPDATE `app_releases` SET `storage_provider` = ''cloudbase'' WHERE `storage_provider` <> ''cloudbase'' OR `storage_provider` IS NULL',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @sql := IF(
  @table_exists = 1 AND @has_storage_provider = 1,
  'ALTER TABLE `app_releases` MODIFY COLUMN `storage_provider` ENUM(''cloudbase'') NOT NULL DEFAULT ''cloudbase''',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 4) 补齐 storage_file_id 字段
SET @has_storage_file_id := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = @db_name
    AND table_name = 'app_releases'
    AND column_name = 'storage_file_id'
);

SET @sql := IF(
  @table_exists = 1 AND @has_storage_file_id = 0,
  'ALTER TABLE `app_releases` ADD COLUMN `storage_file_id` VARCHAR(512) NULL AFTER `storage_provider`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5) 补齐索引 idx_app_releases_storage_provider
SET @has_storage_provider_idx := (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = @db_name
    AND table_name = 'app_releases'
    AND index_name = 'idx_app_releases_storage_provider'
);

SET @sql := IF(
  @table_exists = 1 AND @has_storage_provider_idx = 0,
  'CREATE INDEX `idx_app_releases_storage_provider` ON `app_releases` (`storage_provider`)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 6) 清理旧删除队列表（若存在）
SET @has_legacy_deletion_queue := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = @db_name
    AND table_name = 'cos_deletion_queue'
);

SET @sql := IF(
  @has_legacy_deletion_queue = 1,
  'DROP TABLE `cos_deletion_queue`',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 7) 输出补丁执行摘要
SELECT
  @table_exists AS table_exists,
  @has_storage_provider AS had_storage_provider_before_patch,
  @has_storage_file_id AS had_storage_file_id_before_patch,
  @has_storage_provider_idx AS had_storage_provider_index_before_patch,
  @has_legacy_deletion_queue AS had_legacy_deletion_queue_before_patch;

