-- 优化：单张摆姿查询函数（用于服务端预取）
-- 创建时间：2026-02-08
-- 说明：减少服务端预取数据量，从6张减少到1张

-- 创建单张摆姿查询函数
CREATE OR REPLACE FUNCTION get_random_pose_single()
RETURNS TABLE (
  id bigint,
  image_url text,
  tags text[],
  storage_path text,
  view_count bigint,
  rand_key double precision
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.image_url,
    p.tags,
    p.storage_path,
    p.view_count,
    p.rand_key
  FROM poses p
  WHERE p.rand_key >= random()
  ORDER BY p.rand_key
  LIMIT 1;

  -- 如果没有结果，从头开始查询
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT
      p.id,
      p.image_url,
      p.tags,
      p.storage_path,
      p.view_count,
      p.rand_key
    FROM poses p
    ORDER BY p.rand_key
    LIMIT 1;
  END IF;
END;
$$;

-- 添加函数注释
COMMENT ON FUNCTION get_random_pose_single() IS '获取单张随机摆姿，用于首屏优化';
