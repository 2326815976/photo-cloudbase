-- ================================================================================================
-- 项目：拾光谣（photo）页面发布中心
-- 日期：2026-04-01
-- 目标：为页面发布规则增加页面头部标题元数据，支持按端独立重命名
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE app_page_publish_rules
  ADD COLUMN IF NOT EXISTS header_title VARCHAR(64) NULL COMMENT '页面头部大标题' AFTER guest_nav_text,
  ADD COLUMN IF NOT EXISTS header_subtitle VARCHAR(64) NULL COMMENT '页面头部小标题' AFTER header_title;

SELECT
  DATABASE() AS db_name,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_publish_rules'
      AND column_name = 'header_title'
  ) AS has_header_title,
  (
    SELECT COUNT(*)
    FROM information_schema.columns
    WHERE table_schema = DATABASE()
      AND table_name = 'app_page_publish_rules'
      AND column_name = 'header_subtitle'
  ) AS has_header_subtitle;
