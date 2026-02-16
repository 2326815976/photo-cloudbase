-- ================================================================================================
-- 项目：拾光谣（photo）相册根目录名称可配置
-- 日期：2026-02-16
-- 目标：为 albums 增加 root_folder_name 字段，支持后台修改“根目录”显示名称
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE albums
  ADD COLUMN root_folder_name VARCHAR(255) NOT NULL DEFAULT '根目录' AFTER title;

UPDATE albums
SET root_folder_name = '根目录'
WHERE root_folder_name = ''
   OR root_folder_name <=> NULL;

