-- ================================================================================================
-- 📂 项目：拾光谣 - 更新统计函数以支持"进行中"状态
-- 📝 版本：v1.0
-- 🎯 目标：更新 get_admin_dashboard_stats 函数以包含 in_progress 状态统计
-- 📅 日期：2026-02-04
-- ================================================================================================

-- 更新统计函数以支持 in_progress 状态
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

    -- 预约统计（添加 in_progress 状态）
    'bookings', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM public.bookings),
      'new_today', (SELECT COUNT(*) FROM public.bookings WHERE DATE(created_at) = CURRENT_DATE),
      'pending', (SELECT COUNT(*) FROM public.bookings WHERE status = 'pending'),
      'confirmed', (SELECT COUNT(*) FROM public.bookings WHERE status = 'confirmed'),
      'in_progress', (SELECT COUNT(*) FROM public.bookings WHERE status = 'in_progress'),
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
      'latest_version', (
        SELECT row_to_json(t)::jsonb
        FROM (
          SELECT version, platform, created_at
          FROM public.app_releases
          ORDER BY created_at DESC
          LIMIT 1
        ) t
      )
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

-- 添加注释
COMMENT ON FUNCTION public.get_admin_dashboard_stats() IS '获取管理员仪表板统计数据（包含 in_progress 状态）';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 统计函数更新完成！';
  RAISE NOTICE '📋 已执行操作：';
  RAISE NOTICE '   - 更新 get_admin_dashboard_stats 函数';
  RAISE NOTICE '   - 添加 in_progress 状态统计';
  RAISE NOTICE '💡 新增统计项：';
  RAISE NOTICE '   - bookings.in_progress: 进行中的预约数量';
END $$;
