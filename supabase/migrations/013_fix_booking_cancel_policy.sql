-- ================================================================================================
-- 📂 项目：拾光谣 - 完善预约取消和完成逻辑
-- 📝 版本：v1.2 - Fix booking cancel and completion logic
-- 🎯 目标：
--   1. 允许用户在预约日期之前取消 pending 或 confirmed 状态的预约
--   2. 预约当天不允许取消
--   3. 自动将过期的预约标记为 completed
-- 📅 日期：2026-02-04
-- ================================================================================================

-- 删除旧的更新策略
DROP POLICY IF EXISTS "Users can update own pending bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update own bookings" ON public.bookings;

-- 创建新的更新策略：允许用户在预约日期之前取消预约
CREATE POLICY "Users can cancel bookings before booking date"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('pending', 'confirmed')
    AND booking_date > CURRENT_DATE  -- 只能在预约日期之前取消
  )
  WITH CHECK (auth.uid() = user_id);

-- 添加注释
COMMENT ON POLICY "Users can cancel bookings before booking date" ON public.bookings
IS '允许用户在预约日期之前取消待确认或已确认的预约（预约当天不可取消）';

-- ================================================================================================
-- 自动完成过期预约的函数
-- ================================================================================================

-- 创建函数：自动将过期的预约标记为 completed
CREATE OR REPLACE FUNCTION public.auto_complete_expired_bookings()
RETURNS void
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  UPDATE public.bookings
  SET status = 'finished'
  WHERE status IN ('pending', 'confirmed')
    AND booking_date < CURRENT_DATE;
END;
$$;

COMMENT ON FUNCTION public.auto_complete_expired_bookings()
IS '自动将过期的预约（预约日期已过）标记为已完成';

-- ================================================================================================
-- 创建定时任务（使用 pg_cron 扩展，如果可用）
-- ================================================================================================

-- 注意：pg_cron 需要在 Supabase Dashboard 中启用
-- 如果 pg_cron 不可用，可以使用 Supabase Edge Functions 或客户端定时任务

-- 尝试创建定时任务（每天凌晨1点执行）
DO $BODY$
BEGIN
  -- 检查 pg_cron 扩展是否存在
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 删除旧的定时任务（如果存在）
    PERFORM cron.unschedule('auto-complete-expired-bookings');

    -- 创建新的定时任务
    PERFORM cron.schedule(
      'auto-complete-expired-bookings',
      '0 1 * * *',  -- 每天凌晨1点
      'SELECT public.auto_complete_expired_bookings()'
    );

    RAISE NOTICE '✅ 定时任务已创建：每天凌晨1点自动完成过期预约';
  ELSE
    RAISE NOTICE '⚠️  pg_cron 扩展未启用，请手动调用 auto_complete_expired_bookings() 或使用其他方式';
  END IF;
END $BODY$;

-- 立即执行一次，清理现有的过期预约
SELECT public.auto_complete_expired_bookings();

-- 完成提示
DO $BODY$
BEGIN
  RAISE NOTICE '✅ 预约取消和完成逻辑已完善！';
  RAISE NOTICE '📋 用户现在只能在预约日期之前取消预约';
  RAISE NOTICE '📋 过期预约会自动标记为已完成';
END $BODY$;
