-- ================================================================================================
-- 📂 项目：拾光谣 - 统计分析系统
-- 📝 版本：v1.0_Consolidated
-- 🎯 目标：管理员仪表板统计、实时数据、趋势分析
-- 📅 日期：2026-02-04
-- 🔄 合并自：011
-- ================================================================================================

-- ================================================================================================
-- 1. 扩展 analytics_daily 表
-- ================================================================================================

-- 添加更多统计字段到每日快照表
ALTER TABLE public.analytics_daily
ADD COLUMN IF NOT EXISTS total_users_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS admin_users_count int DEFAULT 0,

-- 相册统计
ADD COLUMN IF NOT EXISTS total_albums_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_albums_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS expired_albums_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS tipping_enabled_albums_count int DEFAULT 0,

-- 照片统计
ADD COLUMN IF NOT EXISTS total_photos_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_photos_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS public_photos_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS private_photos_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_photo_views int DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_photo_likes int DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_photo_comments int DEFAULT 0,

-- 预约统计
ADD COLUMN IF NOT EXISTS total_bookings_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_bookings_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_bookings_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS confirmed_bookings_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS finished_bookings_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS cancelled_bookings_count int DEFAULT 0,

-- 摆姿统计
ADD COLUMN IF NOT EXISTS total_poses_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS new_poses_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pose_tags_count int DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_pose_views int DEFAULT 0;

-- 添加字段注释
COMMENT ON COLUMN public.analytics_daily.total_users_count IS '总用户数';
COMMENT ON COLUMN public.analytics_daily.admin_users_count IS '管理员数量';
COMMENT ON COLUMN public.analytics_daily.total_albums_count IS '总相册数';
COMMENT ON COLUMN public.analytics_daily.new_albums_count IS '当日新增相册数';
COMMENT ON COLUMN public.analytics_daily.expired_albums_count IS '已过期相册数';
COMMENT ON COLUMN public.analytics_daily.tipping_enabled_albums_count IS '启用打赏的相册数';
COMMENT ON COLUMN public.analytics_daily.total_photos_count IS '总照片数';
COMMENT ON COLUMN public.analytics_daily.new_photos_count IS '当日新增照片数';
COMMENT ON COLUMN public.analytics_daily.public_photos_count IS '公开照片数（照片墙）';
COMMENT ON COLUMN public.analytics_daily.private_photos_count IS '私密照片数';
COMMENT ON COLUMN public.analytics_daily.total_photo_views IS '照片总浏览量';
COMMENT ON COLUMN public.analytics_daily.total_photo_likes IS '照片总点赞数';
COMMENT ON COLUMN public.analytics_daily.total_photo_comments IS '照片总评论数';
COMMENT ON COLUMN public.analytics_daily.total_bookings_count IS '总预约数';
COMMENT ON COLUMN public.analytics_daily.new_bookings_count IS '当日新增预约数';
COMMENT ON COLUMN public.analytics_daily.pending_bookings_count IS '待处理预约数';
COMMENT ON COLUMN public.analytics_daily.confirmed_bookings_count IS '已确认预约数';
COMMENT ON COLUMN public.analytics_daily.finished_bookings_count IS '已完成预约数';
COMMENT ON COLUMN public.analytics_daily.cancelled_bookings_count IS '已取消预约数';
COMMENT ON COLUMN public.analytics_daily.total_poses_count IS '总摆姿数';
COMMENT ON COLUMN public.analytics_daily.new_poses_count IS '当日新增摆姿数';
COMMENT ON COLUMN public.analytics_daily.total_pose_tags_count IS '总标签数';
COMMENT ON COLUMN public.analytics_daily.total_pose_views IS '摆姿总浏览量';

-- ================================================================================================
-- 2. 实时统计查询函数
-- ================================================================================================

-- 获取后台管理系统实时统计数据
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb;
BEGIN
  -- 验证管理员权限
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION '无权访问：仅管理员可查看统计数据';
  END IF;

  -- 构建统计数据
  SELECT jsonb_build_object(
    -- 用户统计
    'users', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.profiles),
      'admins', (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin'),
      'regular_users', (SELECT COUNT(*) FROM public.profiles WHERE role = 'user'),
      'new_today', (SELECT COUNT(*) FROM public.profiles WHERE DATE(created_at) = CURRENT_DATE),
      'active_today', (SELECT COUNT(DISTINCT user_id) FROM public.user_active_logs WHERE active_date = CURRENT_DATE)
    ),

    -- 相册统计
    'albums', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.albums),
      'new_today', (SELECT COUNT(*) FROM public.albums WHERE DATE(created_at) = CURRENT_DATE),
      'expired', (
        SELECT COUNT(*) FROM public.albums
        WHERE COALESCE(expires_at, created_at + INTERVAL '7 days') < NOW()
      ),
      'tipping_enabled', (SELECT COUNT(*) FROM public.albums WHERE enable_tipping = true)
    ),

    -- 照片统计
    'photos', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.album_photos),
      'new_today', (SELECT COUNT(*) FROM public.album_photos WHERE DATE(created_at) = CURRENT_DATE),
      'public', (SELECT COUNT(*) FROM public.album_photos WHERE is_public = true),
      'private', (SELECT COUNT(*) FROM public.album_photos WHERE is_public = false),
      'total_views', (SELECT COALESCE(SUM(view_count), 0) FROM public.album_photos),
      'total_likes', (SELECT COALESCE(SUM(like_count), 0) FROM public.album_photos),
      'total_comments', (SELECT COUNT(*) FROM public.photo_comments),
      'avg_rating', (SELECT ROUND(AVG(rating)::numeric, 2) FROM public.album_photos WHERE rating > 0)
    ),

    -- 预约统计
    'bookings', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.bookings),
      'new_today', (SELECT COUNT(*) FROM public.bookings WHERE DATE(created_at) = CURRENT_DATE),
      'pending', (SELECT COUNT(*) FROM public.bookings WHERE status = 'pending'),
      'confirmed', (SELECT COUNT(*) FROM public.bookings WHERE status = 'confirmed'),
      'finished', (SELECT COUNT(*) FROM public.bookings WHERE status = 'finished'),
      'cancelled', (SELECT COUNT(*) FROM public.bookings WHERE status = 'cancelled'),
      'upcoming', (
        SELECT COUNT(*) FROM public.bookings
        WHERE status IN ('pending', 'confirmed') AND booking_date >= CURRENT_DATE
      ),
      'types', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT bt.name as type_name, COUNT(b.id) as count
          FROM public.booking_types bt
          LEFT JOIN public.bookings b ON b.type_id = bt.id
          GROUP BY bt.id, bt.name
        ) t
      )
    ),

    -- 摆姿统计
    'poses', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.poses),
      'new_today', (SELECT COUNT(*) FROM public.poses WHERE DATE(created_at) = CURRENT_DATE),
      'total_views', (SELECT COALESCE(SUM(view_count), 0) FROM public.poses),
      'total_tags', (SELECT COUNT(*) FROM public.pose_tags),
      'avg_tags_per_pose', (
        SELECT ROUND(AVG(array_length(tags, 1))::numeric, 2)
        FROM public.poses
        WHERE tags IS NOT NULL AND array_length(tags, 1) > 0
      ),
      'top_tags', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT name as tag_name, usage_count
          FROM public.pose_tags
          ORDER BY usage_count DESC
          LIMIT 10
        ) t
      )
    ),

    -- 系统统计
    'system', jsonb_build_object(
      'total_cities', (SELECT COUNT(*) FROM public.allowed_cities WHERE is_active = true),
      'total_blackout_dates', (SELECT COUNT(*) FROM public.booking_blackouts WHERE date >= CURRENT_DATE),
      'total_releases', (SELECT COUNT(*) FROM public.app_releases),
      'latest_version', (SELECT version FROM public.app_releases ORDER BY created_at DESC LIMIT 1)
    ),

    -- 趋势数据（最近7天）
    'trends', jsonb_build_object(
      'daily_new_users', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT date, new_users_count as count
          FROM public.analytics_daily
          WHERE date >= CURRENT_DATE - INTERVAL '6 days'
          ORDER BY date DESC
        ) t
      ),
      'daily_active_users', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT date, active_users_count as count
          FROM public.analytics_daily
          WHERE date >= CURRENT_DATE - INTERVAL '6 days'
          ORDER BY date DESC
        ) t
      ),
      'daily_new_bookings', (
        SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb), '[]'::jsonb)
        FROM (
          SELECT date, new_bookings_count as count
          FROM public.analytics_daily
          WHERE date >= CURRENT_DATE - INTERVAL '6 days'
          ORDER BY date DESC
        ) t
      )
    )
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_admin_dashboard_stats() IS '获取后台管理系统实时统计数据（仅管理员）';

-- ================================================================================================
-- 3. 每日统计快照更新函数
-- ================================================================================================

-- 更新每日统计快照
CREATE OR REPLACE FUNCTION public.update_daily_analytics_snapshot()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_date date := CURRENT_DATE;
BEGIN
  -- 插入或更新当日统计快照
  INSERT INTO public.analytics_daily (
    date,
    -- 用户统计
    new_users_count,
    active_users_count,
    total_users_count,
    admin_users_count,

    -- 相册统计
    total_albums_count,
    new_albums_count,
    expired_albums_count,
    tipping_enabled_albums_count,

    -- 照片统计
    total_photos_count,
    new_photos_count,
    public_photos_count,
    private_photos_count,
    total_photo_views,
    total_photo_likes,
    total_photo_comments,

    -- 预约统计
    total_bookings_count,
    new_bookings_count,
    pending_bookings_count,
    confirmed_bookings_count,
    finished_bookings_count,
    cancelled_bookings_count,

    -- 摆姿统计
    total_poses_count,
    new_poses_count,
    total_pose_tags_count,
    total_pose_views
  )
  VALUES (
    target_date,
    -- 用户统计
    (SELECT COUNT(*) FROM public.profiles WHERE DATE(created_at) = target_date),
    (SELECT COUNT(DISTINCT user_id) FROM public.user_active_logs WHERE active_date = target_date),
    (SELECT COUNT(*) FROM public.profiles),
    (SELECT COUNT(*) FROM public.profiles WHERE role = 'admin'),

    -- 相册统计
    (SELECT COUNT(*) FROM public.albums),
    (SELECT COUNT(*) FROM public.albums WHERE DATE(created_at) = target_date),
    (SELECT COUNT(*) FROM public.albums WHERE COALESCE(expires_at, created_at + INTERVAL '7 days') < NOW()),
    (SELECT COUNT(*) FROM public.albums WHERE enable_tipping = true),

    -- 照片统计
    (SELECT COUNT(*) FROM public.album_photos),
    (SELECT COUNT(*) FROM public.album_photos WHERE DATE(created_at) = target_date),
    (SELECT COUNT(*) FROM public.album_photos WHERE is_public = true),
    (SELECT COUNT(*) FROM public.album_photos WHERE is_public = false),
    (SELECT COALESCE(SUM(view_count), 0) FROM public.album_photos),
    (SELECT COALESCE(SUM(like_count), 0) FROM public.album_photos),
    (SELECT COUNT(*) FROM public.photo_comments),

    -- 预约统计
    (SELECT COUNT(*) FROM public.bookings),
    (SELECT COUNT(*) FROM public.bookings WHERE DATE(created_at) = target_date),
    (SELECT COUNT(*) FROM public.bookings WHERE status = 'pending'),
    (SELECT COUNT(*) FROM public.bookings WHERE status = 'confirmed'),
    (SELECT COUNT(*) FROM public.bookings WHERE status = 'finished'),
    (SELECT COUNT(*) FROM public.bookings WHERE status = 'cancelled'),

    -- 摆姿统计
    (SELECT COUNT(*) FROM public.poses),
    (SELECT COUNT(*) FROM public.poses WHERE DATE(created_at) = target_date),
    (SELECT COUNT(*) FROM public.pose_tags),
    (SELECT COALESCE(SUM(view_count), 0) FROM public.poses)
  )
  ON CONFLICT (date) DO UPDATE SET
    -- 用户统计
    new_users_count = EXCLUDED.new_users_count,
    active_users_count = EXCLUDED.active_users_count,
    total_users_count = EXCLUDED.total_users_count,
    admin_users_count = EXCLUDED.admin_users_count,

    -- 相册统计
    total_albums_count = EXCLUDED.total_albums_count,
    new_albums_count = EXCLUDED.new_albums_count,
    expired_albums_count = EXCLUDED.expired_albums_count,
    tipping_enabled_albums_count = EXCLUDED.tipping_enabled_albums_count,

    -- 照片统计
    total_photos_count = EXCLUDED.total_photos_count,
    new_photos_count = EXCLUDED.new_photos_count,
    public_photos_count = EXCLUDED.public_photos_count,
    private_photos_count = EXCLUDED.private_photos_count,
    total_photo_views = EXCLUDED.total_photo_views,
    total_photo_likes = EXCLUDED.total_photo_likes,
    total_photo_comments = EXCLUDED.total_photo_comments,

    -- 预约统计
    total_bookings_count = EXCLUDED.total_bookings_count,
    new_bookings_count = EXCLUDED.new_bookings_count,
    pending_bookings_count = EXCLUDED.pending_bookings_count,
    confirmed_bookings_count = EXCLUDED.confirmed_bookings_count,
    finished_bookings_count = EXCLUDED.finished_bookings_count,
    cancelled_bookings_count = EXCLUDED.cancelled_bookings_count,

    -- 摆姿统计
    total_poses_count = EXCLUDED.total_poses_count,
    new_poses_count = EXCLUDED.new_poses_count,
    total_pose_tags_count = EXCLUDED.total_pose_tags_count,
    total_pose_views = EXCLUDED.total_pose_views;

  RAISE NOTICE '✅ 每日统计快照已更新：%', target_date;
END;
$$;

COMMENT ON FUNCTION public.update_daily_analytics_snapshot() IS '更新每日统计快照（建议通过定时任务每日执行）';

-- ================================================================================================
-- 4. 历史数据统计查询函数
-- ================================================================================================

-- 获取指定日期范围的统计趋势
CREATE OR REPLACE FUNCTION public.get_analytics_trends(
  start_date date DEFAULT CURRENT_DATE - INTERVAL '30 days',
  end_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb;
BEGIN
  -- 验证管理员权限
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION '无权访问：仅管理员可查看统计数据';
  END IF;

  -- 构建趋势数据
  SELECT jsonb_build_object(
    'date_range', jsonb_build_object(
      'start_date', start_date,
      'end_date', end_date
    ),
    'daily_stats', (
      SELECT jsonb_agg(
        jsonb_build_object(
          'date', date,
          'new_users', new_users_count,
          'active_users', active_users_count,
          'new_albums', new_albums_count,
          'new_photos', new_photos_count,
          'new_bookings', new_bookings_count,
          'new_poses', new_poses_count
        ) ORDER BY date DESC
      )
      FROM public.analytics_daily
      WHERE date BETWEEN start_date AND end_date
    )
  ) INTO result;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_analytics_trends(date, date) IS '获取指定日期范围的统计趋势（仅管理员）';

-- ================================================================================================
-- 5. RLS 策略更新
-- ================================================================================================

-- 确保 analytics_daily 表的 RLS 策略正确
DROP POLICY IF EXISTS "Admin read stats" ON public.analytics_daily;
DROP POLICY IF EXISTS "Admin manage stats" ON public.analytics_daily;

CREATE POLICY "Admin read stats"
  ON public.analytics_daily FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admin manage stats"
  ON public.analytics_daily FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ================================================================================================
-- 6. 初始化当前统计快照
-- ================================================================================================

-- 立即执行一次统计快照更新
DO $$
BEGIN
  PERFORM public.update_daily_analytics_snapshot();
END $$;

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 统计分析系统创建完成！';
  RAISE NOTICE '📊 已扩展 analytics_daily 表，添加完整统计维度';
  RAISE NOTICE '🔄 已创建 RPC 函数：';
  RAISE NOTICE '   - get_admin_dashboard_stats()：获取实时统计数据';
  RAISE NOTICE '   - update_daily_analytics_snapshot()：更新每日统计快照';
  RAISE NOTICE '   - get_analytics_trends(start_date, end_date)：获取历史趋势';
  RAISE NOTICE '🔒 RLS 策略已更新';
  RAISE NOTICE '💡 建议：配置定时任务每日执行 update_daily_analytics_snapshot()';
END $$;
