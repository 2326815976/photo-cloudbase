-- ================================================================================================
-- 项目：拾光谣（photo）页面发布中心
-- 日期：2026-03-30
-- 目标：将 about 页面补充为 Web / 小程序底栏候选页面，支持后续统一上线配置
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

UPDATE app_page_registry
SET
  tab_key = 'about',
  icon_key = 'about',
  is_nav_candidate_web = 1,
  is_tab_candidate_miniprogram = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE page_key = 'about';