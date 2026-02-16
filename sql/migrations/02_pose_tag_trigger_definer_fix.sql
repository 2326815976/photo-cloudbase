-- ================================================================================================
-- 项目：拾光谣（photo）CloudBase SQL Definer 清理补丁
-- 目标：移除 poses / pose_tags 上依赖 definer 的存储过程与触发器，避免写入时报错
-- 日期：2026-02-16
-- 说明：usage_count 与标签联动逻辑已迁移到应用层（lib/cloudbase/query-engine.ts）
-- ================================================================================================

SET NAMES utf8mb4;
SET time_zone = '+08:00';

-- 1) 移除旧触发器与过程（可能带无效 definer）
DROP TRIGGER IF EXISTS trg_poses_set_rand_key;
DROP TRIGGER IF EXISTS trg_poses_after_insert;
DROP TRIGGER IF EXISTS trg_poses_after_update;
DROP TRIGGER IF EXISTS trg_poses_after_delete;
DROP TRIGGER IF EXISTS trg_pose_tags_before_update;
DROP TRIGGER IF EXISTS trg_pose_tags_before_delete;
DROP TRIGGER IF EXISTS trg_pose_tags_after_insert;
DROP TRIGGER IF EXISTS trg_pose_tags_after_update;
DROP TRIGGER IF EXISTS trg_pose_tags_after_delete;
DROP PROCEDURE IF EXISTS sp_rebuild_pose_tag_usage_counts;

-- 2) 一次性重建 usage_count，确保历史数据一致
UPDATE pose_tags t
SET usage_count = (
  SELECT COUNT(*)
  FROM poses p
  WHERE !(p.tags <=> NULL)
    AND !(JSON_SEARCH(p.tags, 'one', t.name) <=> NULL)
);
