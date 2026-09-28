-- ================================================================================================
-- 项目：拾光谣（photo）访客认证页接入页面中心
-- 日期：2026-04-13
-- 目标：补齐“我的”下登录/注册二级页注册项，并统一到页面中心的显示与标题规则
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
  SELECT 'login' AS page_key, '登录' AS page_name, '我的页访客登录入口' AS page_description, '/login' AS route_path_web, 'pages/login/index' AS route_path_miniprogram, '/login?presentation=preview&page_key=login' AS preview_route_path_web, '/pages/login/index?presentation=preview&page_key=login' AS preview_route_path_miniprogram, '登录' AS default_tab_text, '登录' AS default_guest_tab_text
  UNION ALL SELECT 'register', '注册', '我的页访客注册入口', '/register', 'pages/register/index', '/register?presentation=preview&page_key=register', '/pages/register/index?presentation=preview&page_key=register', '注册', '注册'
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
WHERE page_key IN ('login', 'register');

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.show_in_nav = 0,
  rules.nav_order = 99,
  rules.nav_text = COALESCE(NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.guest_nav_text = COALESCE(NULLIF(TRIM(rules.guest_nav_text), ''), NULLIF(TRIM(rules.nav_text), ''), registry.default_guest_tab_text, registry.page_name),
  rules.header_title = COALESCE(NULLIF(TRIM(rules.header_title), ''), NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key IN ('login', 'register');

SELECT
  COUNT(*) AS auth_secondary_registry_count
FROM app_page_registry
WHERE page_key IN ('login', 'register');
