-- ================================================================================================
-- 项目：拾光谣（photo）照片拍摄日期字段
-- 日期：2026-03-01
-- 目标：为 album_photos 增加 shot_date（拍摄日期）并回填历史数据
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE album_photos
  ADD COLUMN IF NOT EXISTS shot_date DATE NULL AFTER sort_order;

UPDATE album_photos
SET shot_date = DATE(created_at)
WHERE shot_date IS NULL;
