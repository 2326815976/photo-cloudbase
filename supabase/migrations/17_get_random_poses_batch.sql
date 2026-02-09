-- ================================================================================================
-- 📂 项目：拾光谣 - 批量获取随机摆姿函数
-- 📝 版本：v1.0
-- 🎯 目标：创建批量获取 RPC 函数，减少网络往返次数，优化补池性能
-- 📅 日期：2026-02-09
-- ================================================================================================

-- ================================================================================================
-- 1. 创建批量获取随机摆姿函数
-- ================================================================================================

-- 批量获取随机摆姿（支持标签过滤和历史去重）
CREATE OR REPLACE FUNCTION public.get_random_poses_batch(
  tag_filter text[] DEFAULT NULL,
  batch_size int DEFAULT 20,
  exclude_ids int[] DEFAULT ARRAY[]::int[]
)
RETURNS SETOF poses LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 如果有标签过滤
  IF tag_filter IS NOT NULL AND array_length(tag_filter, 1) > 0 THEN
    RETURN QUERY
    SELECT *
    FROM public.poses
    WHERE
      tags && tag_filter  -- 标签匹配
      AND NOT (id = ANY(exclude_ids))  -- 排除历史记录
      AND rand_key >= random()  -- 随机过滤
    ORDER BY rand_key
    LIMIT batch_size;
  ELSE
    -- 无标签过滤
    RETURN QUERY
    SELECT *
    FROM public.poses
    WHERE
      NOT (id = ANY(exclude_ids))  -- 排除历史记录
      AND rand_key >= random()  -- 随机过滤
    ORDER BY rand_key
    LIMIT batch_size;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.get_random_poses_batch(text[], int, int[]) IS '批量获取随机摆姿，支持标签过滤和历史去重，减少网络往返次数';

-- ================================================================================================
-- 2. 授予执行权限
-- ================================================================================================

-- 允许匿名用户和认证用户调用此函数
GRANT EXECUTE ON FUNCTION public.get_random_poses_batch(text[], int, int[]) TO anon, authenticated;

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ get_random_poses_batch 函数创建完成！';
  RAISE NOTICE '📊 功能：批量获取随机摆姿（支持标签过滤和历史去重）';
  RAISE NOTICE '🔒 权限：anon 和 authenticated 用户可调用';
  RAISE NOTICE '💡 优化：减少80%%+网络往返次数，提升补池性能';
END $$;
