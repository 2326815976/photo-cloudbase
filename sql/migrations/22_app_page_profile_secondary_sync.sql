-- ================================================================================================
-- 项目：拾光谣（photo）页面中心二级页同步修复
-- 日期：2026-04-12
-- 目标：补齐“我的”二级页注册项，并统一修正二级页不进入底部菜单、标题与入口名称一致的规则
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
  SELECT 'about' AS page_key, '关于' AS page_name, '我的页关于入口' AS page_description, '/profile/about' AS route_path_web, 'pages/profile/about/index' AS route_path_miniprogram, '/profile/about?presentation=preview&page_key=about' AS preview_route_path_web, '/pages/profile/about/index?presentation=preview&page_key=about' AS preview_route_path_miniprogram, '关于' AS default_tab_text, '关于' AS default_guest_tab_text
  UNION ALL SELECT 'profile-edit', '编辑个人资料', '我的页个人资料编辑入口', '/profile/edit', 'pages/profile/edit/index', '/profile/edit?presentation=preview&page_key=profile-edit', '/pages/profile/edit/index?presentation=preview&page_key=profile-edit', '编辑个人资料', '编辑个人资料'
  UNION ALL SELECT 'profile-bookings', '我的预约记录', '我的页预约记录入口', '/profile/bookings', 'pages/profile/bookings/index', '/profile/bookings?presentation=preview&page_key=profile-bookings', '/pages/profile/bookings/index?presentation=preview&page_key=profile-bookings', '我的预约记录', '我的预约记录'
  UNION ALL SELECT 'profile-change-password', '修改密码', '我的页密码修改入口', '/profile/change-password', 'pages/profile/change-password/index', '/profile/change-password?presentation=preview&page_key=profile-change-password', '/pages/profile/change-password/index?presentation=preview&page_key=profile-change-password', '修改密码', '修改密码'
  UNION ALL SELECT 'profile-delete-account', '删除账户', '我的页账户删除入口', '/profile/delete-account', 'pages/profile/delete-account/index', '/profile/delete-account?presentation=preview&page_key=profile-delete-account', '/pages/profile/delete-account/index?presentation=preview&page_key=profile-delete-account', '删除账户', '删除账户'
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
WHERE page_key IN (
  'about',
  'profile-edit',
  'profile-bookings',
  'profile-change-password',
  'profile-delete-account'
);

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.show_in_nav = 0,
  rules.nav_order = 99,
  rules.nav_text = COALESCE(NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.guest_nav_text = COALESCE(NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.header_title = COALESCE(NULLIF(TRIM(rules.nav_text), ''), registry.default_tab_text, registry.page_name),
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key IN (
  'about',
  'profile-edit',
  'profile-bookings',
  'profile-change-password',
  'profile-delete-account'
);

SELECT
  COUNT(*) AS profile_secondary_registry_count
FROM app_page_registry
WHERE page_key IN (
  'about',
  'profile-edit',
  'profile-bookings',
  'profile-change-password',
  'profile-delete-account'
);
