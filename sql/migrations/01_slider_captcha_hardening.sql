-- ================================================================================================
-- 项目：拾光谣（photo）滑块验证码持久化增强（无 Redis）
-- 日期：2026-02-15
-- 目标：提供多实例可用的一次性滑块验证码挑战/凭证存储，并支持快速清理，避免数据累积。
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

CREATE TABLE IF NOT EXISTS slider_captcha_challenges (
  id CHAR(36) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  user_agent_hash CHAR(64) NOT NULL,
  max_attempts TINYINT UNSIGNED NOT NULL DEFAULT 5,
  failed_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  verified_at DATETIME NULL,
  verify_token_hash CHAR(64) NULL,
  verify_token_expires_at DATETIME NULL,
  consumed_at DATETIME NULL,
  last_error_code VARCHAR(64) NULL,
  PRIMARY KEY (id),
  KEY idx_slider_captcha_ip_created (ip_address, created_at DESC),
  KEY idx_slider_captcha_expires (expires_at),
  KEY idx_slider_captcha_verify_expires (verify_token_expires_at),
  KEY idx_slider_captcha_consumed (consumed_at),
  KEY idx_slider_captcha_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='滑块验证码挑战短生命周期表';

-- 首次上线时顺手清掉历史残留（若表已存在且已累积）。
DELETE FROM slider_captcha_challenges
WHERE created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)
   OR !(consumed_at <=> NULL)
   OR expires_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)
   OR (!(verify_token_expires_at <=> NULL) AND verify_token_expires_at < DATE_SUB(NOW(), INTERVAL 10 MINUTE));
