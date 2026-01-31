-- ================================================================================================
-- 照片墙功能增强：点赞、浏览量统计、用户定格
-- ================================================================================================

-- ================================================================================================
-- 1. 点赞功能 RPC
-- ================================================================================================

-- 点赞照片（仅登录用户）
CREATE OR REPLACE FUNCTION public.like_photo(p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_user_id uuid;
  v_already_liked boolean;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  -- 检查是否已点赞
  SELECT EXISTS(
    SELECT 1 FROM public.photo_likes
    WHERE user_id = v_user_id AND photo_id = p_photo_id
  ) INTO v_already_liked;

  IF v_already_liked THEN
    -- 取消点赞
    DELETE FROM public.photo_likes
    WHERE user_id = v_user_id AND photo_id = p_photo_id;

    -- 更新点赞数
    UPDATE public.album_photos
    SET like_count = GREATEST(0, like_count - 1)
    WHERE id = p_photo_id;

    RETURN jsonb_build_object('liked', false);
  ELSE
    -- 添加点赞
    INSERT INTO public.photo_likes (user_id, photo_id)
    VALUES (v_user_id, p_photo_id);

    -- 更新点赞数
    UPDATE public.album_photos
    SET like_count = like_count + 1
    WHERE id = p_photo_id;

    RETURN jsonb_build_object('liked', true);
  END IF;
END;
$$;

COMMENT ON FUNCTION public.like_photo(uuid) IS '点赞/取消点赞照片（仅登录用户）';

-- ================================================================================================
-- 2. 浏览量统计 RPC
-- ================================================================================================

-- 增加照片浏览量（访客和登录用户均可）
CREATE OR REPLACE FUNCTION public.increment_photo_view(p_photo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY definer AS $$
BEGIN
  UPDATE public.album_photos
  SET view_count = view_count + 1
  WHERE id = p_photo_id;
END;
$$;

COMMENT ON FUNCTION public.increment_photo_view(uuid) IS '增加照片浏览量（点击预览时调用）';

-- ================================================================================================
-- 3. 用户定格照片到照片墙 RPC
-- ================================================================================================

-- 用户在专属空间定格照片到照片墙
CREATE OR REPLACE FUNCTION public.pin_photo_to_wall(
  p_access_key text,
  p_photo_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_album_id uuid;
  v_is_public boolean;
BEGIN
  -- 验证密钥并获取相册ID
  SELECT a.id INTO v_album_id
  FROM public.albums a
  JOIN public.album_photos p ON p.album_id = a.id
  WHERE a.access_key = p_access_key AND p.id = p_photo_id;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '无权操作：密钥错误或照片不属于该空间';
  END IF;

  -- 获取当前公开状态
  SELECT is_public INTO v_is_public
  FROM public.album_photos
  WHERE id = p_photo_id;

  -- 切换公开状态
  UPDATE public.album_photos
  SET is_public = NOT v_is_public
  WHERE id = p_photo_id;
END;
$$;

COMMENT ON FUNCTION public.pin_photo_to_wall(text, uuid) IS '用户在专属空间定格/取消定格照片到照片墙';

-- ================================================================================================
-- 4. 获取照片墙数据（优化版）
-- ================================================================================================

-- 替换原有的 get_public_gallery 函数，添加更多信息
CREATE OR REPLACE FUNCTION public.get_public_gallery(page_no int, page_size int)
RETURNS jsonb LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_user_id uuid;
  result jsonb;
BEGIN
  v_user_id := auth.uid();

  SELECT jsonb_build_object(
    'photos', COALESCE((
      SELECT json_agg(t ORDER BY t.created_at DESC)
      FROM (
        SELECT
          p.id,
          p.url as storage_path,
          p.width,
          p.height,
          p.blurhash,
          p.like_count,
          p.view_count,
          p.created_at,
          -- 检查当前用户是否点过赞
          CASE
            WHEN v_user_id IS NOT NULL THEN
              EXISTS(SELECT 1 FROM public.photo_likes pl WHERE pl.photo_id = p.id AND pl.user_id = v_user_id)
            ELSE false
          END as is_liked
        FROM public.album_photos p
        WHERE p.is_public = true
        ORDER BY p.created_at DESC
        LIMIT page_size
        OFFSET (page_no - 1) * page_size
      ) t
    ), '[]'::json),
    'total', (SELECT COUNT(*) FROM public.album_photos WHERE is_public = true)
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_public_gallery(int, int) IS '获取照片墙数据（分页，包含点赞状态）';
