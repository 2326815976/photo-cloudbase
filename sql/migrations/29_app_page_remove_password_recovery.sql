-- ================================================================================================
-- 项目：拾光谣（photo）移除访客密码找回页面
-- 日期：2026-04-13
-- 目标：下线并隐藏“忘记密码 / 重置密码”二级页，避免继续出现在页面管理与运行时配置中
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.show_in_nav = 0,
  rules.publish_state = 'offline',
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key IN ('forgot-password', 'reset-password');

UPDATE app_page_registry
SET
  is_active = 0,
  updated_at = CURRENT_TIMESTAMP
WHERE page_key IN ('forgot-password', 'reset-password');

SELECT
  page_key,
  is_active
FROM app_page_registry
WHERE page_key IN ('forgot-password', 'reset-password');
