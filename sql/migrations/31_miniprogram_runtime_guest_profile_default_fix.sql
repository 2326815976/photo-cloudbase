SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE miniprogram_runtime_settings
  MODIFY COLUMN guest_profile_mode VARCHAR(32) NOT NULL DEFAULT 'login';

