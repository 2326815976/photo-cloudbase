-- ================================================================================================
-- 📂 项目：拾光谣 - 手工补丁（UTC+8 & 预约/相册/维护修正）
-- 📝 版本：v1.0
-- 📅 日期：2026-02-07
-- 说明：可直接在 Supabase SQL Editor 执行
-- ================================================================================================

-- 1. 统一时区为 UTC+8（Asia/Shanghai）
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'Asia/Shanghai');
END $$;

SET TIME ZONE 'Asia/Shanghai';

-- 2. 相册访问控制：仅绑定用户可读，管理员全权
ALTER TABLE public.albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access with access_key" ON public.albums;
DROP POLICY IF EXISTS "Allow authenticated users to read albums" ON public.albums;
DROP POLICY IF EXISTS "Allow bound users read albums" ON public.albums;
DROP POLICY IF EXISTS "Allow admin full access" ON public.albums;

CREATE POLICY "Allow bound users read albums"
  ON public.albums FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_album_bindings b
      WHERE b.album_id = albums.id AND b.user_id = auth.uid()
    )
  );

CREATE POLICY "Allow admin full access"
  ON public.albums FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 2.1 照片墙系统相册（用于管理员上传照片墙）
DO $$
DECLARE
  v_album_id uuid := '00000000-0000-0000-0000-000000000000';
  v_access_key text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.albums WHERE id = v_album_id) THEN
    v_access_key := upper('WALL' || substr(md5(random()::text), 1, 4));
    WHILE EXISTS (SELECT 1 FROM public.albums WHERE access_key = v_access_key) LOOP
      v_access_key := upper('WALL' || substr(md5(random()::text), 1, 4));
    END LOOP;

    INSERT INTO public.albums (
      id, access_key, title, enable_tipping, enable_welcome_letter, created_at
    ) VALUES (
      v_album_id, v_access_key, '照片墙系统', false, false, now()
    );
  END IF;
END $$;

-- 3. 预约：同一用户仅允许一个活跃预约
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_active_user
ON public.bookings(user_id)
WHERE status IN ('pending', 'confirmed', 'in_progress');

COMMENT ON INDEX idx_bookings_unique_active_user IS '确保同一用户只能有一个活跃预约（pending/confirmed/in_progress）';

-- 3.1 预约：用户可删除已取消或已完成的预约
DROP POLICY IF EXISTS "Users can delete finished or cancelled bookings" ON public.bookings;
CREATE POLICY "Users can delete finished or cancelled bookings"
  ON public.bookings FOR DELETE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('finished', 'cancelled')
  );

-- 4. 维护：过期预约自动完成（包含 in_progress）
CREATE OR REPLACE FUNCTION public.auto_complete_expired_bookings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.bookings
  SET status = 'finished'
  WHERE status IN ('pending', 'confirmed', 'in_progress')
    AND booking_date < CURRENT_DATE;
END;
$$;

COMMENT ON FUNCTION public.auto_complete_expired_bookings() IS '自动将过期的预约（预约日期已过）标记为已完成';

-- 5. 清理：基于相册有效期删除未公开照片
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  deleted_photos int := 0;
  deleted_folders int := 0;
  deleted_albums int := 0;
BEGIN
  -- 删除过期且未公开的照片（基于相册有效期）
  WITH deleted AS (
    DELETE FROM public.album_photos p
    USING public.albums a
    WHERE p.album_id = a.id
      AND p.is_public = false
      AND COALESCE(a.expires_at, a.created_at + interval '7 days') < now()
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
    WHERE COALESCE(expires_at, created_at + interval '7 days') < now()
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

-- 6. 清理旧浏览记录（保持函数存在，供维护入口调用）
CREATE OR REPLACE FUNCTION public.cleanup_old_photo_views()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  DELETE FROM public.photo_views
  WHERE viewed_at < now() - interval '90 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_old_photo_views() IS '清理90天前的照片浏览记录';

-- 7. 当天预约自动进入进行中
CREATE OR REPLACE FUNCTION public.auto_start_today_bookings()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.bookings
  SET status = 'in_progress'
  WHERE status = 'confirmed'
    AND booking_date = CURRENT_DATE;
END;
$$;

COMMENT ON FUNCTION public.auto_start_today_bookings() IS '自动将当天预约（已确认）标记为进行中';

-- 8. 维护入口：加入 auto_start_today_bookings
CREATE OR REPLACE FUNCTION public.run_maintenance_tasks()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  cleanup_result jsonb;
  result jsonb;
BEGIN
  SELECT public.cleanup_expired_data() INTO cleanup_result;
  PERFORM public.cleanup_old_photo_views();
  PERFORM public.auto_start_today_bookings();
  PERFORM public.auto_complete_expired_bookings();
  PERFORM public.update_daily_analytics_snapshot();

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
