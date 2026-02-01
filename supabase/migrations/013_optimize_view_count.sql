-- ================================================================================================
-- 📂 项目：拾光谣 - 浏览量机制优化
-- 📝 版本：v7.0 - View Count Optimization
-- 🎯 目标：防止单个用户无限刷浏览量，实现基于会话的去重机制
-- 📅 日期：2026-02-01
-- ================================================================================================

-- ================================================================================================
-- 1. 创建照片浏览记录表
-- ================================================================================================

-- 记录用户的照片浏览历史（用于去重）
CREATE TABLE IF NOT EXISTS public.photo_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES public.album_photos(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id text,  -- 用于未登录用户的会话标识
  viewed_at timestamptz DEFAULT now(),
  CONSTRAINT photo_views_unique_user UNIQUE (photo_id, user_id),
  CONSTRAINT photo_views_unique_session UNIQUE (photo_id, session_id)
);

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_photo_views_photo_id ON public.photo_views(photo_id);
CREATE INDEX IF NOT EXISTS idx_photo_views_user_id ON public.photo_views(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_views_session_id ON public.photo_views(session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_photo_views_viewed_at ON public.photo_views(viewed_at);

-- 添加表注释
COMMENT ON TABLE public.photo_views IS '照片浏览记录表 - 用于防止重复计数';
COMMENT ON COLUMN public.photo_views.session_id IS '未登录用户的会话标识（浏览器指纹或UUID）';

-- ================================================================================================
-- 2. 更新浏览量统计 RPC 函数
-- ================================================================================================

-- 优化后的浏览量增加函数（带去重机制）
CREATE OR REPLACE FUNCTION public.increment_photo_view(
  p_photo_id uuid,
  p_session_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY definer AS $$
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
-- 3. 清理旧浏览记录的定时任务（可选）
-- ================================================================================================

-- 创建清理函数：删除90天前的浏览记录
CREATE OR REPLACE FUNCTION public.cleanup_old_photo_views()
RETURNS void LANGUAGE plpgsql SECURITY definer AS $$
BEGIN
  DELETE FROM public.photo_views
  WHERE viewed_at < now() - interval '90 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_photo_views() IS '清理90天前的照片浏览记录';

-- ================================================================================================
-- 4. RLS 策略
-- ================================================================================================

-- 启用 RLS
ALTER TABLE public.photo_views ENABLE ROW LEVEL SECURITY;

-- 允许所有人插入浏览记录
CREATE POLICY "Anyone can insert photo views"
  ON public.photo_views FOR INSERT
  TO public
  WITH CHECK (true);

-- 用户只能查看自己的浏览记录
CREATE POLICY "Users can view own photo views"
  ON public.photo_views FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 管理员可以查看所有浏览记录
CREATE POLICY "Admins can view all photo views"
  ON public.photo_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 浏览量机制优化完成！';
  RAISE NOTICE '📊 新增表：photo_views（浏览记录去重）';
  RAISE NOTICE '🔄 已更新 RPC 函数：increment_photo_view（支持会话去重）';
  RAISE NOTICE '🧹 新增清理函数：cleanup_old_photo_views（清理90天前记录）';
  RAISE NOTICE '⚠️  前端需要传递 session_id 参数（未登录用户）';
END $$;
