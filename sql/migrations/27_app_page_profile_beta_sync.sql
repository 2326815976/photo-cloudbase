-- ================================================================================================
-- 项目：拾光谣（photo）内测功能接入页面中心
-- 日期：2026-04-13
-- 目标：补齐“我的 -> 内测功能”二级页注册项，并统一到页面中心显示与标题规则
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
  SELECT 'profile-beta' AS page_key, '内测功能' AS page_name, '我的页内测功能入口' AS page_description, '/profile/beta' AS route_path_web, 'pages/profile/beta/index' AS route_path_miniprogram, '/profile/beta?presentation=preview&page_key=profile-beta' AS preview_route_path_web, '/pages/profile/beta/index?presentation=preview&page_key=profile-beta' AS preview_route_path_miniprogram, '内测功能' AS default_tab_text, '内测功能' AS default_guest_tab_text
) AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM app_page_registry current_registry
  WHERE current_registry.page_key = seed.page_key
);

UPDATE app_page_registry
SET
  page_name = '内测功能',
  page_description = '我的页内测功能入口',
  default_tab_text = '内测功能',
  default_guest_tab_text = '内测功能',
  tab_key = NULL,
  icon_key = NULL,
  is_nav_candidate_web = 0,
  is_tab_candidate_miniprogram = 0,
  supports_beta = 0,
  supports_preview = 1,
  is_builtin = 1,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE page_key IN ('profile-beta');

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.show_in_nav = 0,
  rules.nav_order = 99,
  rules.nav_text = CASE
    WHEN TRIM(IFNULL(rules.nav_text, '')) IN ('', '页面内测中心') THEN '内测功能'
    ELSE rules.nav_text
  END,
  rules.guest_nav_text = CASE
    WHEN TRIM(IFNULL(rules.guest_nav_text, '')) IN ('', '页面内测中心') THEN '内测功能'
    ELSE rules.guest_nav_text
  END,
  rules.header_title = CASE
    WHEN TRIM(IFNULL(rules.header_title, '')) IN ('', '页面内测中心') THEN '内测功能'
    ELSE rules.header_title
  END,
  rules.header_subtitle = CASE
    WHEN TRIM(IFNULL(rules.header_subtitle, '')) = '绑定页面内测码后，可直接进入无底栏页面。' THEN ''
    ELSE IFNULL(rules.header_subtitle, '')
  END,
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key IN ('profile-beta');

SELECT
  COUNT(*) AS profile_beta_registry_count
FROM app_page_registry
WHERE page_key IN ('profile-beta');
