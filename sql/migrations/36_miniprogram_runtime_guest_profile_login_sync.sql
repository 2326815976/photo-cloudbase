-- ================================================================================================
-- 项目：拾光谣（photo）小程序访客态我的页配置收口
-- 日期：2026-05-24
-- 目标：将历史运行时配置中的 guest_profile_mode 统一收口为 login，与当前代码和后台行为保持一致
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

UPDATE miniprogram_runtime_settings
SET
  guest_profile_mode = 'login',
  updated_at = CURRENT_TIMESTAMP
WHERE IFNULL(NULLIF(TRIM(guest_profile_mode), ''), 'login') <> 'login';

SELECT
  id,
  config_key,
  scene_code,
  guest_profile_mode,
  auth_mode,
  is_active,
  updated_at
FROM miniprogram_runtime_settings
ORDER BY is_active DESC, updated_at DESC, id DESC;
