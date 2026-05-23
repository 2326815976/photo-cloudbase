-- ================================================================================================
-- 项目：拾光谣（photo）页面中心运行时配置回填
-- 日期：2026-05-23
-- 目标：补齐当前真实库缺失的页面注册与双端发布规则，减少运行时 fallback 依赖
-- 说明：
--   1. 仅插入缺失项，不覆盖已存在的发布状态与页面管理配置
--   2. 对 `about` 页额外做一次二级页语义校正，避免继续被识别为一级导航页
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
  seed.supports_beta,
  seed.supports_preview,
  1,
  1
FROM (
  SELECT
    'album-detail' AS page_key,
    '专属返图空间' AS page_name,
    '提取页进入的返图空间详情' AS page_description,
    '/album/[id]' AS route_path_web,
    'pages/album/detail' AS route_path_miniprogram,
    '' AS preview_route_path_web,
    '' AS preview_route_path_miniprogram,
    '专属返图空间' AS default_tab_text,
    '专属返图空间' AS default_guest_tab_text,
    0 AS supports_beta,
    0 AS supports_preview
  UNION ALL
  SELECT
    'profile-change-password',
    '修改密码',
    '我的页密码修改入口',
    '/profile/change-password',
    'pages/profile/change-password/index',
    '/profile/change-password?presentation=preview&page_key=profile-change-password',
    '/pages/profile/change-password/index?presentation=preview&page_key=profile-change-password',
    '修改密码',
    '修改密码',
    0,
    1
  UNION ALL
  SELECT
    'profile-delete-account',
    '删除账户',
    '我的页账户删除入口',
    '/profile/delete-account',
    'pages/profile/delete-account/index',
    '/profile/delete-account?presentation=preview&page_key=profile-delete-account',
    '/pages/profile/delete-account/index?presentation=preview&page_key=profile-delete-account',
    '删除账户',
    '删除账户',
    0,
    1
) AS seed
WHERE NOT EXISTS (
  SELECT 1
  FROM app_page_registry current_registry
  WHERE current_registry.page_key = seed.page_key
);

UPDATE app_page_registry registry
JOIN (
  SELECT
    'about' AS page_key,
    '关于' AS page_name,
    '我的页关于入口' AS page_description,
    '/profile/about' AS route_path_web,
    'pages/profile/about/index' AS route_path_miniprogram,
    '/profile/about?presentation=preview&page_key=about' AS preview_route_path_web,
    '/pages/profile/about/index?presentation=preview&page_key=about' AS preview_route_path_miniprogram,
    '关于' AS default_tab_text,
    '关于' AS default_guest_tab_text,
    0 AS supports_beta,
    1 AS supports_preview
  UNION ALL
  SELECT
    'login',
    '登录',
    '我的页访客登录入口',
    '/login',
    'pages/login/index',
    '/login?presentation=preview&page_key=login',
    '/pages/login/index?presentation=preview&page_key=login',
    '登录',
    '登录',
    0,
    1
  UNION ALL
  SELECT
    'register',
    '注册',
    '我的页访客注册入口',
    '/register',
    'pages/register/index',
    '/register?presentation=preview&page_key=register',
    '/pages/register/index?presentation=preview&page_key=register',
    '注册',
    '注册',
    0,
    1
  UNION ALL
  SELECT
    'album-detail',
    '专属返图空间',
    '提取页进入的返图空间详情',
    '/album/[id]',
    'pages/album/detail',
    '',
    '',
    '专属返图空间',
    '专属返图空间',
    0,
    0
  UNION ALL
  SELECT
    'profile-change-password',
    '修改密码',
    '我的页密码修改入口',
    '/profile/change-password',
    'pages/profile/change-password/index',
    '/profile/change-password?presentation=preview&page_key=profile-change-password',
    '/pages/profile/change-password/index?presentation=preview&page_key=profile-change-password',
    '修改密码',
    '修改密码',
    0,
    1
  UNION ALL
  SELECT
    'profile-delete-account',
    '删除账户',
    '我的页账户删除入口',
    '/profile/delete-account',
    'pages/profile/delete-account/index',
    '/profile/delete-account?presentation=preview&page_key=profile-delete-account',
    '/pages/profile/delete-account/index?presentation=preview&page_key=profile-delete-account',
    '删除账户',
    '删除账户',
    0,
    1
) AS seed ON seed.page_key = registry.page_key
SET
  registry.page_name = seed.page_name,
  registry.page_description = seed.page_description,
  registry.route_path_web = seed.route_path_web,
  registry.route_path_miniprogram = seed.route_path_miniprogram,
  registry.preview_route_path_web = seed.preview_route_path_web,
  registry.preview_route_path_miniprogram = seed.preview_route_path_miniprogram,
  registry.tab_key = NULL,
  registry.icon_key = NULL,
  registry.default_tab_text = seed.default_tab_text,
  registry.default_guest_tab_text = seed.default_guest_tab_text,
  registry.is_nav_candidate_web = 0,
  registry.is_tab_candidate_miniprogram = 0,
  registry.supports_beta = seed.supports_beta,
  registry.supports_preview = seed.supports_preview,
  registry.is_builtin = 1,
  registry.is_active = 1,
  registry.updated_at = CURRENT_TIMESTAMP;

INSERT INTO app_page_publish_rules (
  page_id,
  channel,
  publish_state,
  show_in_nav,
  nav_order,
  nav_text,
  guest_nav_text,
  header_title,
  header_subtitle,
  is_home_entry,
  notes
)
SELECT
  registry.id,
  seed.channel,
  seed.publish_state,
  seed.show_in_nav,
  seed.nav_order,
  seed.nav_text,
  seed.guest_nav_text,
  seed.header_title,
  seed.header_subtitle,
  seed.is_home_entry,
  seed.notes
FROM (
  SELECT 'album' AS page_key, 'web' AS channel, 'online' AS publish_state, 1 AS show_in_nav, 1 AS nav_order, '提取' AS nav_text, '提取' AS guest_nav_text, '' AS header_title, '' AS header_subtitle, 0 AS is_home_entry, '' AS notes
  UNION ALL
  SELECT 'gallery', 'web', 'online', 1, 2, '照片墙', '照片墙', '', '', 0, ''
  UNION ALL
  SELECT 'booking', 'web', 'online', 1, 3, '约拍', '约拍', '', '', 0, ''
  UNION ALL
  SELECT 'profile', 'web', 'online', 1, 4, '我的', '我的', '我的小天地', '📒 管理你的拾光小秘密 📒', 0, ''
  UNION ALL
  SELECT 'about', 'web', 'online', 0, 140, '关于', '关于', '关于', '', 0, ''
  UNION ALL
  SELECT 'login', 'web', 'online', 0, 10, '登录', '登录', '登录', '', 0, ''
  UNION ALL
  SELECT 'login', 'miniprogram', 'online', 0, 10, '登录', '登录', '登录', '', 0, ''
  UNION ALL
  SELECT 'register', 'web', 'online', 0, 20, '注册', '注册', '注册', '', 0, ''
  UNION ALL
  SELECT 'register', 'miniprogram', 'online', 0, 20, '注册', '注册', '注册', '', 0, ''
  UNION ALL
  SELECT 'profile-beta', 'web', 'online', 0, 130, '内测功能', '内测功能', '内测功能', '', 0, ''
  UNION ALL
  SELECT 'profile-bookings', 'web', 'online', 0, 120, '我的预约记录', '我的预约记录', '我的预约记录', '', 0, ''
  UNION ALL
  SELECT 'album-detail', 'web', 'online', 0, 110, '专属返图空间', '专属返图空间', '专属返图空间', '', 0, ''
  UNION ALL
  SELECT 'album-detail', 'miniprogram', 'online', 0, 110, '专属返图空间', '专属返图空间', '专属返图空间', '', 0, ''
  UNION ALL
  SELECT 'profile-change-password', 'web', 'online', 0, 150, '修改密码', '修改密码', '修改密码', '', 0, ''
  UNION ALL
  SELECT 'profile-change-password', 'miniprogram', 'online', 0, 150, '修改密码', '修改密码', '修改密码', '', 0, ''
  UNION ALL
  SELECT 'profile-delete-account', 'web', 'online', 0, 160, '删除账户', '删除账户', '删除账户', '', 0, ''
  UNION ALL
  SELECT 'profile-delete-account', 'miniprogram', 'online', 0, 160, '删除账户', '删除账户', '删除账户', '', 0, ''
) AS seed
JOIN app_page_registry registry ON registry.page_key = seed.page_key
LEFT JOIN app_page_publish_rules current_rules
  ON current_rules.page_id = registry.id
 AND current_rules.channel = seed.channel
WHERE current_rules.id IS NULL;

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.publish_state = 'online',
  rules.show_in_nav = 0,
  rules.nav_order = 140,
  rules.nav_text = '关于',
  rules.guest_nav_text = '关于',
  rules.header_title = '关于',
  rules.header_subtitle = '',
  rules.is_home_entry = 0,
  rules.notes = '',
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key = 'about'
  AND rules.channel IN ('web', 'miniprogram');

SELECT
  page_key,
  page_name,
  route_path_web,
  route_path_miniprogram,
  supports_beta,
  supports_preview,
  is_active
FROM app_page_registry
WHERE page_key IN (
  'about',
  'login',
  'register',
  'album-detail',
  'profile-change-password',
  'profile-delete-account'
)
ORDER BY FIELD(
  page_key,
  'about',
  'login',
  'register',
  'album-detail',
  'profile-change-password',
  'profile-delete-account'
);

SELECT
  registry.page_key,
  rules.channel,
  rules.publish_state,
  rules.show_in_nav,
  rules.nav_order,
  rules.nav_text,
  rules.guest_nav_text,
  rules.header_title,
  rules.header_subtitle
FROM app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
WHERE registry.page_key IN (
  'album',
  'gallery',
  'booking',
  'profile',
  'about',
  'login',
  'register',
  'profile-beta',
  'profile-bookings',
  'album-detail',
  'profile-change-password',
  'profile-delete-account'
)
ORDER BY FIELD(
  registry.page_key,
  'album',
  'gallery',
  'booking',
  'profile',
  'about',
  'login',
  'register',
  'profile-beta',
  'profile-bookings',
  'album-detail',
  'profile-change-password',
  'profile-delete-account'
), rules.channel;
