-- ================================================================================================
-- 📂 项目：拾光谣 - 照片墙功能完整实现
-- 📝 版本：v1.0_Consolidated
-- 🎯 目标：多版本图片、浏览量去重、点赞功能、定格到照片墙
-- 📅 日期：2026-02-04
-- 🔄 合并自：005
-- ================================================================================================

-- ================================================================================================
-- 1. 浏览量去重机制
-- ================================================================================================

-- 创建照片浏览记录表
CREATE TABLE IF NOT EXISTS public.photo_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.album_photos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,
  viewed_at timestamptz DEFAULT now(),
  CONSTRAINT photo_views_unique_user UNIQUE (photo_id, user_id),
  CONSTRAINT photo_views_unique_session UNIQUE (photo_id, session_id)
);

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_photo_views_photo_id ON public.photo_views(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_views_user_id ON public.photo_views(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_views_session_id ON public.photo_views(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_views_viewed_at ON public.photo_views(viewed_at);

-- RLS 策略
ALTER TABLE public.photo_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert photo views" ON public.photo_views;
DROP POLICY IF EXISTS "Users can view own photo views" ON public.photo_views;
DROP POLICY IF EXISTS "Admins can view all photo views" ON public.photo_views;

CREATE POLICY "Anyone can insert photo views"
  ON public.photo_views FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can view own photo views"
  ON public.photo_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all photo views"
  ON public.photo_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 表注释
COMMENT ON TABLE public.photo_views IS '照片浏览记录表 - 用于防止重复计数';
COMMENT ON COLUMN public.photo_views.session_id IS '未登录用户的会话标识（浏览器指纹或UUID）';

-- ================================================================================================
-- 2. RPC 函数 - 点赞功能
-- ================================================================================================

-- 点赞照片（仅登录用户）
CREATE OR REPLACE FUNCTION public.like_photo(p_photo_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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
-- 3. RPC 函数 - 浏览量统计（带去重）
-- ================================================================================================

-- 优化后的浏览量增加函数（带去重机制）
CREATE OR REPLACE FUNCTION public.increment_photo_view(
  p_photo_id uuid,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_already_viewed boolean;
  v_view_count int;
BEGIN
  -- 获取当前用户ID（如果已登录）
  v_user_id := auth.uid();

  -- 检查是否已经浏览过
  IF v_user_id IS NOT NULL THEN
    -- 登录用户：检查用户ID
    SELECT EXISTS(
      SELECT 1 FROM public.photo_views
      WHERE photo_id = p_photo_id AND user_id = v_user_id
    ) INTO v_already_viewed;
  ELSIF p_session_id IS NOT NULL THEN
    -- 未登录用户：检查会话ID
    SELECT EXISTS(
      SELECT 1 FROM public.photo_views
      WHERE photo_id = p_photo_id AND session_id = p_session_id
    ) INTO v_already_viewed;
  ELSE
    -- 没有用户ID也没有会话ID，不记录浏览
    v_already_viewed := true;
  END IF;

  -- 如果是首次浏览，增加浏览量并记录
  IF NOT v_already_viewed THEN
    -- 增加浏览量
    UPDATE public.album_photos
    SET view_count = view_count + 1
    WHERE id = p_photo_id
    RETURNING view_count INTO v_view_count;

    -- 记录浏览历史
    INSERT INTO public.photo_views (photo_id, user_id, session_id)
    VALUES (p_photo_id, v_user_id, p_session_id)
    ON CONFLICT DO NOTHING;

    RETURN jsonb_build_object(
      'counted', true,
      'view_count', v_view_count
    );
  ELSE
    -- 已经浏览过，不增加浏览量
    SELECT view_count INTO v_view_count
    FROM public.album_photos
    WHERE id = p_photo_id;

    RETURN jsonb_build_object(
      'counted', false,
      'view_count', v_view_count
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION public.increment_photo_view(uuid, text) IS '增加照片浏览量（带去重机制，防止重复计数）';

-- ================================================================================================
-- 4. RPC 函数 - 用户定格照片到照片墙
-- ================================================================================================

-- 用户在专属空间定格照片到照片墙
CREATE OR REPLACE FUNCTION public.pin_photo_to_wall(
  p_access_key text,
  p_photo_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
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
-- 5. RPC 函数 - 获取照片墙数据（优化版）
-- ================================================================================================

-- 替换原有的 get_public_gallery 函数，添加多版本URL和更多信息
CREATE OR REPLACE FUNCTION public.get_public_gallery(page_no int, page_size int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total_count int;
  photos_data jsonb;
BEGIN
  -- 获取总数
  SELECT COUNT(*) INTO total_count
  FROM public.album_photos
  WHERE is_public = true;

  -- 获取分页数据
  SELECT COALESCE(json_agg(t), '[]'::json) INTO photos_data FROM (
    SELECT
      p.id,
      -- 优先使用新字段，如果为空则回退到 url 字段（向后兼容）
      COALESCE(p.thumbnail_url, p.url) as thumbnail_url,
      COALESCE(p.preview_url, p.url) as preview_url,
      p.width,
      p.height,
      p.blurhash,
      p.like_count,
      p.view_count,
      p.created_at,
      EXISTS(
        SELECT 1 FROM public.photo_likes pl
        WHERE pl.photo_id = p.id AND pl.user_id = auth.uid()
      ) as is_liked
    FROM public.album_photos p
    WHERE p.is_public = true
    ORDER BY p.created_at DESC
    LIMIT page_size
    OFFSET (page_no - 1) * page_size
  ) t;

  -- 返回包含 photos 和 total 的对象
  RETURN jsonb_build_object(
    'photos', photos_data,
    'total', total_count
  );
END;
$$;

COMMENT ON FUNCTION public.get_public_gallery(int, int) IS '获取照片墙数据（分页，包含点赞状态和多版本URL）';

-- ================================================================================================
-- 6. 清理旧浏览记录的定时任务
-- ================================================================================================

-- 创建清理函数：删除90天前的浏览记录
CREATE OR REPLACE FUNCTION public.cleanup_old_photo_views()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.photo_views
  WHERE viewed_at < now() - interval '90 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_photo_views() IS '清理90天前的照片浏览记录';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 照片墙功能完整实现完成！';
  RAISE NOTICE '📊 新增表：photo_views（浏览记录去重）';
  RAISE NOTICE '🔄 已创建 RPC 函数：';
  RAISE NOTICE '   - like_photo（点赞/取消点赞）';
  RAISE NOTICE '   - increment_photo_view（浏览量统计+去重）';
  RAISE NOTICE '   - pin_photo_to_wall（定格到照片墙）';
  RAISE NOTICE '   - get_public_gallery（获取照片墙数据）';
  RAISE NOTICE '   - cleanup_old_photo_views（清理旧记录）';
END $$;
