-- ================================================================================================
-- 项目：拾光谣（photo）首页标签排序
-- 日期：2026-02-18
-- 目标：为 pose_tags 增加 sort_order，支持管理员自定义标签顺序，并让用户端按该顺序展示
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

ALTER TABLE pose_tags
  ADD COLUMN sort_order INT UNSIGNED NOT NULL DEFAULT 2147483647 AFTER usage_count;

CREATE INDEX idx_pose_tags_sort_order ON pose_tags (sort_order);

SET @pose_tag_rank := 0;
UPDATE pose_tags t
JOIN (
  SELECT id, (@pose_tag_rank := @pose_tag_rank + 1) AS rank_order
  FROM pose_tags
  ORDER BY usage_count DESC, name ASC, created_at ASC, id ASC
) ranked ON ranked.id = t.id
SET t.sort_order = ranked.rank_order * 10;
