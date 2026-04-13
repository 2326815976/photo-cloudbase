-- ================================================================================================
-- 项目：拾光谣（photo）访客恢复页接入页面中心
-- 日期：2026-04-13
-- 目标：补齐“忘记密码 / 重置密码”二级页注册项，并统一到页面中心显示与标题规则
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

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
  is_nav_candidate_web,
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
  NULL,
  NULL,
  seed.default_tab_text,
  seed.default_guest_tab_text,
  0,
  0,
  0,
  1,
  1,
  1
FROM (
  SELECT 'forgot-password' AS page_key, '忘记密码' AS page_name, '登录页访客找回密码说明' AS page_description, '/auth/forgot-password' AS route_path_web, 'pages/auth/forgot-password/index' AS route_path_miniprogram, '/auth/forgot-password?presentation=preview&page_key=forgot-password' AS preview_route_path_web, '/pages/auth/forgot-password/index?presentation=preview&page_key=forgot-password' AS preview_route_path_miniprogram, '忘记密码' AS default_tab_text, '忘记密码' AS default_guest_tab_text
  UNION ALL SELECT 'reset-password', '重置密码', '访客态密码重置说明页', '/auth/reset-password', 'pages/auth/reset-password/index', '/auth/reset-password?presentation=preview&page_key=reset-password', '/pages/auth/reset-password/index?presentation=preview&page_key=reset-password', '重置密码', '重置密码'
) AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM app_page_registry current_registry
  WHERE current_registry.page_key = seed.page_key
);

UPDATE app_page_registry
SET
  tab_key = NULL,
  icon_key = NULL,
  is_nav_candidate_web = 0,
  is_tab_candidate_miniprogram = 0,
  supports_beta = 0,
  supports_preview = 1,
  is_builtin = 1,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE page_key IN ('forgot-password', 'reset-password');

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.show_in_nav = 0,
  rules.nav_order = 99,
  rules.nav_text = COALESCE(NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.guest_nav_text = COALESCE(NULLIF(TRIM(rules.guest_nav_text), ''), NULLIF(TRIM(rules.nav_text), ''), registry.default_guest_tab_text, registry.page_name),
  rules.header_title = COALESCE(NULLIF(TRIM(rules.header_title), ''), NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key IN ('forgot-password', 'reset-password');

SELECT
  COUNT(*) AS guest_recovery_registry_count
FROM app_page_registry
WHERE page_key IN ('forgot-password', 'reset-password');
