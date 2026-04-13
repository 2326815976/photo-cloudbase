-- ================================================================================================
-- 项目：拾光谣（photo）内测功能标题同步
-- 日期：2026-04-13
-- 目标：将“我的 -> 页面内测中心”统一更名为“内测功能”，并清理旧副标题
-- 说明：仅覆盖旧默认值，保留后台已自定义的标题文案
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

UPDATE app_page_registry
SET
  page_name = '内测功能',
  page_description = CASE
    WHEN TRIM(IFNULL(page_description, '')) IN ('', '我的页页面内测中心入口', '我的页内测功能入口') THEN '我的页内测功能入口'
    ELSE page_description
  END,
  default_tab_text = '内测功能',
  default_guest_tab_text = '内测功能',
  updated_at = CURRENT_TIMESTAMP
WHERE page_key = 'profile-beta';

UPDATE app_page_publish_rules rules
JOIN app_page_registry registry ON registry.id = rules.page_id
SET
  rules.nav_text = CASE
    WHEN TRIM(IFNULL(rules.nav_text, '')) IN ('', '页面内测中心', '内测功能') THEN '内测功能'
    ELSE rules.nav_text
  END,
  rules.guest_nav_text = CASE
    WHEN TRIM(IFNULL(rules.guest_nav_text, '')) IN ('', '页面内测中心', '内测功能') THEN '内测功能'
    ELSE rules.guest_nav_text
  END,
  rules.header_title = CASE
    WHEN TRIM(IFNULL(rules.header_title, '')) IN ('', '页面内测中心', '内测功能') THEN '内测功能'
    ELSE rules.header_title
  END,
  rules.header_subtitle = CASE
    WHEN TRIM(IFNULL(rules.header_subtitle, '')) IN ('', '绑定页面内测码后，可直接进入无底栏页面。', '绑定页面内测码后，可直接进入无底栏页面') THEN ''
    ELSE rules.header_subtitle
  END,
  rules.updated_at = CURRENT_TIMESTAMP
WHERE registry.page_key = 'profile-beta';

SELECT
  page_key,
  page_name,
  default_tab_text,
  default_guest_tab_text
FROM app_page_registry
WHERE page_key = 'profile-beta';
