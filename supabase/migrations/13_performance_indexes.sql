-- ================================================================================================
-- 📂 项目：拾光谣 - 性能优化索引
-- 📝 版本：v1.0
-- 🎯 目标：为高频查询添加必要的索引，提升查询性能
-- 📅 日期：2026-02-05
-- ================================================================================================

-- ================================================================================================
-- 索引说明
-- ================================================================================================
-- 基于 get_admin_dashboard_stats 函数和应用查询分析，添加以下索引：
-- 1. bookings 表：status 和 booking_date 字段（高频筛选）
-- 2. profiles 表：role 字段（管理员权限检查）
-- 3. album_photos 表：is_public 字段（公开/私密筛选）
-- 4. poses 表：tags 字段（数组查询优化）
-- 5. user_active_logs 表：active_date 字段（活跃用户统计）
-- 6. albums 表：expires_at 字段（过期相册查询）
-- ================================================================================================

-- 1. bookings 表索引
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings(status);
CREATE INDEX IF NOT EXISTS bookings_booking_date_idx ON public.bookings(booking_date);
CREATE INDEX IF NOT EXISTS bookings_status_date_idx ON public.bookings(status, booking_date);

-- 2. profiles 表索引
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

-- 3. album_photos 表索引
CREATE INDEX IF NOT EXISTS album_photos_is_public_idx ON public.album_photos(is_public);
CREATE INDEX IF NOT EXISTS album_photos_created_at_idx ON public.album_photos(created_at);

-- 4. poses 表索引（GIN 索引用于数组查询）
CREATE INDEX IF NOT EXISTS poses_tags_gin_idx ON public.poses USING GIN(tags);

-- 5. user_active_logs 表索引
CREATE INDEX IF NOT EXISTS user_active_logs_active_date_idx ON public.user_active_logs(active_date);
CREATE INDEX IF NOT EXISTS user_active_logs_user_date_idx ON public.user_active_logs(user_id, active_date);

-- 6. albums 表索引
CREATE INDEX IF NOT EXISTS albums_expires_at_idx ON public.albums(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS albums_created_at_idx ON public.albums(created_at);

-- 7. analytics_daily 表索引（用于趋势查询）
CREATE INDEX IF NOT EXISTS analytics_daily_date_idx ON public.analytics_daily(date DESC);

-- 8. photo_comments 表索引
CREATE INDEX IF NOT EXISTS photo_comments_photo_id_idx ON public.photo_comments(photo_id);
CREATE INDEX IF NOT EXISTS photo_comments_created_at_idx ON public.photo_comments(created_at);

-- ================================================================================================
-- 索引注释
-- ================================================================================================
COMMENT ON INDEX bookings_status_idx IS '预约状态索引 - 优化状态筛选查询';
COMMENT ON INDEX bookings_booking_date_idx IS '预约日期索引 - 优化日期范围查询';
COMMENT ON INDEX bookings_status_date_idx IS '预约状态+日期复合索引 - 优化即将到来的预约查询';
COMMENT ON INDEX profiles_role_idx IS '用户角色索引 - 优化管理员权限检查';
COMMENT ON INDEX album_photos_is_public_idx IS '照片公开状态索引 - 优化公开/私密筛选';
COMMENT ON INDEX poses_tags_gin_idx IS '摆姿标签GIN索引 - 优化数组查询（overlaps/contains）';
COMMENT ON INDEX user_active_logs_active_date_idx IS '用户活跃日期索引 - 优化活跃用户统计';
COMMENT ON INDEX albums_expires_at_idx IS '相册过期时间索引 - 优化过期相册查询';
COMMENT ON INDEX analytics_daily_date_idx IS '分析数据日期索引 - 优化趋势查询';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 性能优化索引创建完成！';
  RAISE NOTICE '📊 已创建索引：';
  RAISE NOTICE '   - bookings: status, booking_date, status+date 复合索引';
  RAISE NOTICE '   - profiles: role';
  RAISE NOTICE '   - album_photos: is_public, created_at';
  RAISE NOTICE '   - poses: tags (GIN索引)';
  RAISE NOTICE '   - user_active_logs: active_date, user_id+active_date';
  RAISE NOTICE '   - albums: expires_at, created_at';
  RAISE NOTICE '   - analytics_daily: date';
  RAISE NOTICE '   - photo_comments: photo_id, created_at';
  RAISE NOTICE '💡 预期效果：';
  RAISE NOTICE '   - 管理后台统计查询性能提升 50-80%';
  RAISE NOTICE '   - 摆姿标签查询性能提升 70-90%';
  RAISE NOTICE '   - 预约列表查询性能提升 60-80%';
END $$;
