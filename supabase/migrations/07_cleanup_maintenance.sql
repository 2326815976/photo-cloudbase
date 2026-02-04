-- ================================================================================================
-- 📂 项目：拾光谣 - 清理和维护函数
-- 📝 版本：v1.0_Consolidated
-- 🎯 目标：过期数据清理、定期维护任务
-- 📅 日期：2026-02-04
-- 🔄 合并自：004（部分清理函数）
-- ================================================================================================

-- ================================================================================================
-- 1. 清理过期数据函数
-- ================================================================================================

-- 清理过期数据（照片、文件夹、相册）
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_photos int := 0;
  deleted_folders int := 0;
  deleted_albums int := 0;
BEGIN
  -- 删除过期且未公开的照片
  WITH deleted AS (
    DELETE FROM public.album_photos
    WHERE created_at < now() - interval '7 days'
    AND is_public = false
    RETURNING id
  )
  SELECT count(*) INTO deleted_photos FROM deleted;

  -- 删除空文件夹
  WITH deleted AS (
    DELETE FROM public.album_folders
    WHERE id NOT IN (
      SELECT DISTINCT folder_id
      FROM public.album_photos
      WHERE folder_id IS NOT NULL
    )
    AND created_at < now() - interval '24 hours'
    RETURNING id
  )
  SELECT count(*) INTO deleted_folders FROM deleted;

  -- 删除过期的空相册
  WITH deleted AS (
    DELETE FROM public.albums
    WHERE expires_at < now()
    AND id NOT IN (
      SELECT DISTINCT album_id
      FROM public.album_photos
    )
    RETURNING id
  )
  SELECT count(*) INTO deleted_albums FROM deleted;

  RETURN jsonb_build_object(
    'deleted_photos', deleted_photos,
    'deleted_folders', deleted_folders,
    'deleted_albums', deleted_albums,
    'timestamp', now()
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_data() IS '清理过期数据（照片、文件夹、相册），应由定时任务每天调用';

-- ================================================================================================
-- 2. 清理旧浏览记录
-- ================================================================================================

-- 清理90天前的照片浏览记录
CREATE OR REPLACE FUNCTION public.cleanup_old_photo_views()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.photo_views
  WHERE viewed_at < now() - interval '90 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_photo_views() IS '清理90天前的照片浏览记录';

-- ================================================================================================
-- 3. 自动完成过期预约
-- ================================================================================================

-- 自动将过期的预约标记为已完成
CREATE OR REPLACE FUNCTION public.auto_complete_expired_bookings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.bookings
  SET status = 'finished'
  WHERE status IN ('pending', 'confirmed')
    AND booking_date < CURRENT_DATE;
END;
$$;

COMMENT ON FUNCTION public.auto_complete_expired_bookings() IS '自动将过期的预约（预约日期已过）标记为已完成';

-- ================================================================================================
-- 4. 综合维护函数
-- ================================================================================================

-- 执行所有维护任务
CREATE OR REPLACE FUNCTION public.run_maintenance_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cleanup_result jsonb;
  result jsonb;
BEGIN
  -- 清理过期数据
  SELECT public.cleanup_expired_data() INTO cleanup_result;

  -- 清理旧浏览记录
  PERFORM public.cleanup_old_photo_views();

  -- 自动完成过期预约
  PERFORM public.auto_complete_expired_bookings();

  -- 更新每日统计快照
  PERFORM public.update_daily_analytics_snapshot();

  -- 构建结果
  result := jsonb_build_object(
    'cleanup_result', cleanup_result,
    'photo_views_cleaned', true,
    'bookings_updated', true,
    'analytics_updated', true,
    'timestamp', now()
  );

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.run_maintenance_tasks() IS '执行所有维护任务（建议每天凌晨执行）';

-- ================================================================================================
-- 5. 定时任务配置（可选）
-- ================================================================================================

-- 尝试创建定时任务（需要 pg_cron 扩展）
DO $$
BEGIN
  -- 检查 pg_cron 扩展是否存在
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 删除旧的定时任务（如果存在）
    PERFORM cron.unschedule('daily-maintenance-tasks');

    -- 创建新的定时任务：每天凌晨2点执行
    PERFORM cron.schedule(
      'daily-maintenance-tasks',
      '0 2 * * *',
      'SELECT public.run_maintenance_tasks()'
    );

    RAISE NOTICE '✅ 定时任务已创建：每天凌晨2点执行维护任务';
  ELSE
    RAISE NOTICE '⚠️  pg_cron 扩展未启用，请手动调用 run_maintenance_tasks() 或使用其他方式';
  END IF;
END $$;

-- ================================================================================================
-- 6. 手动执行维护任务
-- ================================================================================================

-- 立即执行一次维护任务
SELECT public.run_maintenance_tasks();

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 清理和维护函数创建完成！';
  RAISE NOTICE '🔄 已创建函数：';
  RAISE NOTICE '   - cleanup_expired_data()：清理过期数据';
  RAISE NOTICE '   - cleanup_old_photo_views()：清理旧浏览记录';
  RAISE NOTICE '   - auto_complete_expired_bookings()：自动完成过期预约';
  RAISE NOTICE '   - run_maintenance_tasks()：执行所有维护任务';
  RAISE NOTICE '💡 建议：';
  RAISE NOTICE '   - 配置定时任务每天执行 run_maintenance_tasks()';
  RAISE NOTICE '   - 或使用 Supabase Edge Functions 定期调用';
END $$;
