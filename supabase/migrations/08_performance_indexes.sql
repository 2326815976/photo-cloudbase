-- ================================================================================================
-- 📂 项目：拾光谣 - 性能优化索引（完整版）
-- 📝 版本：v2.0_Consolidated
-- 🎯 目标：为高频查询添加必要的索引，提升查询性能
-- 📅 日期：2026-02-05
-- 🔄 合并自：13_performance_indexes.sql, 14_optimize_first_screen_query.sql
-- ================================================================================================

-- ================================================================================================
-- 索引说明
-- ================================================================================================
-- 基于应用查询分析和性能测试，添加以下索引：
-- 1. bookings 表：status 和 booking_date 字段（高频筛选）
-- 2. profiles 表：role 字段（管理员权限检查）
-- 3. album_photos 表：is_public 字段（公开/私密筛选）
-- 4. poses 表：tags 字段（数组查询优化）
-- 5. user_active_logs 表：active_date 字段（活跃用户统计）
-- 6. albums 表：expires_at 字段（过期相册查询）
-- 7. analytics_daily 表：date 字段（趋势查询）
-- 8. photo_comments 表：photo_id 和 created_at 字段
-- 9. pose_tags 表：usage_count 字段（首屏查询优化）
-- ================================================================================================

-- ================================================================================================
-- 1. bookings 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS bookings_status_idx ON public.bookings(status);
CREATE INDEX IF NOT EXISTS bookings_booking_date_idx ON public.bookings(booking_date);
CREATE INDEX IF NOT EXISTS bookings_status_date_idx ON public.bookings(status, booking_date);

COMMENT ON INDEX bookings_status_idx IS '预约状态索引 - 优化状态筛选查询';
COMMENT ON INDEX bookings_booking_date_idx IS '预约日期索引 - 优化日期范围查询';
COMMENT ON INDEX bookings_status_date_idx IS '预约状态+日期复合索引 - 优化即将到来的预约查询';

-- ================================================================================================
-- 2. profiles 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS profiles_role_idx ON public.profiles(role);

COMMENT ON INDEX profiles_role_idx IS '用户角色索引 - 优化管理员权限检查';

-- ================================================================================================
-- 3. album_photos 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS album_photos_is_public_idx ON public.album_photos(is_public);
CREATE INDEX IF NOT EXISTS album_photos_created_at_idx ON public.album_photos(created_at);

COMMENT ON INDEX album_photos_is_public_idx IS '照片公开状态索引 - 优化公开/私密筛选';
COMMENT ON INDEX album_photos_created_at_idx IS '照片创建时间索引 - 优化时间排序查询';

-- ================================================================================================
-- 4. poses 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS poses_tags_gin_idx ON public.poses USING GIN(tags);

COMMENT ON INDEX poses_tags_gin_idx IS '摆姿标签GIN索引 - 优化数组查询（overlaps/contains）';

-- ================================================================================================
-- 5. user_active_logs 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS user_active_logs_active_date_idx ON public.user_active_logs(active_date);
CREATE INDEX IF NOT EXISTS user_active_logs_user_date_idx ON public.user_active_logs(user_id, active_date);

COMMENT ON INDEX user_active_logs_active_date_idx IS '用户活跃日期索引 - 优化活跃用户统计';
COMMENT ON INDEX user_active_logs_user_date_idx IS '用户+日期复合索引 - 优化用户活跃记录查询';

-- ================================================================================================
-- 6. albums 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS albums_expires_at_idx ON public.albums(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS albums_created_at_idx ON public.albums(created_at);

COMMENT ON INDEX albums_expires_at_idx IS '相册过期时间索引 - 优化过期相册查询';
COMMENT ON INDEX albums_created_at_idx IS '相册创建时间索引 - 优化时间排序查询';

-- ================================================================================================
-- 7. analytics_daily 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS analytics_daily_date_idx ON public.analytics_daily(date DESC);

COMMENT ON INDEX analytics_daily_date_idx IS '分析数据日期索引 - 优化趋势查询';

-- ================================================================================================
-- 8. photo_comments 表索引
-- ================================================================================================
CREATE INDEX IF NOT EXISTS photo_comments_photo_id_idx ON public.photo_comments(photo_id);
CREATE INDEX IF NOT EXISTS photo_comments_created_at_idx ON public.photo_comments(created_at);

COMMENT ON INDEX photo_comments_photo_id_idx IS '照片评论索引 - 优化评论查询';
COMMENT ON INDEX photo_comments_created_at_idx IS '评论时间索引 - 优化时间排序';

-- ================================================================================================
-- 9. pose_tags 表索引（首屏加载优化）
-- ================================================================================================
CREATE INDEX IF NOT EXISTS pose_tags_usage_count_idx ON public.pose_tags(usage_count DESC);

COMMENT ON INDEX pose_tags_usage_count_idx IS '标签使用次数索引 - 优化首屏标签列表查询（按使用次数降序排序）';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 性能优化索引创建完成';
  RAISE NOTICE '📊 已创建索引：';
  RAISE NOTICE '   - bookings: status, booking_date, status+date';
  RAISE NOTICE '   - profiles: role';
  RAISE NOTICE '   - album_photos: is_public, created_at';
  RAISE NOTICE '   - poses: tags (GIN)';
  RAISE NOTICE '   - user_active_logs: active_date, user_id+active_date';
  RAISE NOTICE '   - albums: expires_at, created_at';
  RAISE NOTICE '   - analytics_daily: date';
  RAISE NOTICE '   - photo_comments: photo_id, created_at';
  RAISE NOTICE '   - pose_tags: usage_count';
  RAISE NOTICE '⚡ 预期效果：查询性能提升 50-90%%';
END $$;
