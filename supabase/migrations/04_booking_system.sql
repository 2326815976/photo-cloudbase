-- ================================================================================================
-- 📂 项目：拾光谣 - 预约系统完整实现（优化版）
-- 📝 版本：v3.0_Consolidated
-- 🎯 目标：约拍类型、城市限制、预约管理、档期锁定、取消策略、进行中状态、竞态条件防护
-- 📅 日期：2026-02-05
-- 🔄 合并自：04_booking_system.sql, 09_fix_bookings_updated_at.sql, 10_add_in_progress_status.sql, 11_fix_booking_race_condition.sql
-- ================================================================================================

-- ================================================================================================
-- 1. 约拍类型表
-- ================================================================================================

CREATE TABLE IF NOT EXISTS public.booking_types (
  id serial PRIMARY KEY,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 添加唯一约束
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'booking_types_name_key'
    AND conrelid = 'public.booking_types'::regclass
  ) THEN
    ALTER TABLE public.booking_types ADD CONSTRAINT booking_types_name_key UNIQUE (name);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_booking_types_is_active ON public.booking_types(is_active);

COMMENT ON TABLE public.booking_types IS '约拍类型表 - 管理员可添加和管理';
COMMENT ON COLUMN public.booking_types.name IS '约拍类型名称';
COMMENT ON COLUMN public.booking_types.is_active IS '是否启用';

-- 插入默认约拍类型
INSERT INTO public.booking_types (name, description) VALUES
  ('互勉', '互相勉励的约拍'),
  ('常规约拍', '普通的摄影约拍'),
  ('婚礼跟拍', '婚礼现场跟拍'),
  ('活动记录', '活动现场记录')
ON CONFLICT (name) DO NOTHING;

-- ================================================================================================
-- 2. 城市限制表
-- ================================================================================================

CREATE TABLE IF NOT EXISTS public.allowed_cities (
  id serial PRIMARY KEY,
  city_name text NOT NULL,
  province text,
  city_code text,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allowed_cities_is_active ON public.allowed_cities(is_active);
CREATE INDEX IF NOT EXISTS idx_allowed_cities_city_name ON public.allowed_cities(city_name);

COMMENT ON TABLE public.allowed_cities IS '允许预约的城市列表 - 管理员设定';
COMMENT ON COLUMN public.allowed_cities.city_name IS '城市名称';
COMMENT ON COLUMN public.allowed_cities.province IS '省份';
COMMENT ON COLUMN public.allowed_cities.city_code IS '城市代码（高德地图）';
COMMENT ON COLUMN public.allowed_cities.latitude IS '城市中心纬度';
COMMENT ON COLUMN public.allowed_cities.longitude IS '城市中心经度';

-- ================================================================================================
-- 3. 预约表（包含 updated_at 字段和 in_progress 状态）
-- ================================================================================================

CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type_id integer NOT NULL REFERENCES public.booking_types(id) ON DELETE RESTRICT,
  booking_date date NOT NULL,
  time_slot_start time,
  time_slot_end time,
  location text NOT NULL,
  latitude numeric(10, 6),
  longitude numeric(10, 6),
  city_name text,
  phone text NOT NULL,
  wechat text NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'in_progress', 'finished', 'cancelled')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_bookings_user_id ON public.bookings(user_id);
CREATE INDEX IF NOT EXISTS idx_bookings_type_id ON public.bookings(type_id);
CREATE INDEX IF NOT EXISTS idx_bookings_booking_date ON public.bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON public.bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_created_at ON public.bookings(created_at DESC);

-- 字段注释
COMMENT ON TABLE public.bookings IS '预约表 - 用户提交的预约信息';
COMMENT ON COLUMN public.bookings.type_id IS '约拍类型ID';
COMMENT ON COLUMN public.bookings.booking_date IS '约拍日期';
COMMENT ON COLUMN public.bookings.time_slot_start IS '约拍时间段开始（可选，预留字段）';
COMMENT ON COLUMN public.bookings.time_slot_end IS '约拍时间段结束（可选，预留字段）';
COMMENT ON COLUMN public.bookings.location IS '约拍地点名称';
COMMENT ON COLUMN public.bookings.latitude IS '约拍地点纬度';
COMMENT ON COLUMN public.bookings.longitude IS '约拍地点经度';
COMMENT ON COLUMN public.bookings.city_name IS '约拍城市';
COMMENT ON COLUMN public.bookings.phone IS '手机号（必填）';
COMMENT ON COLUMN public.bookings.wechat IS '微信号（必填）';
COMMENT ON COLUMN public.bookings.notes IS '备注（选填）';
COMMENT ON COLUMN public.bookings.status IS '预约状态：pending-待确认, confirmed-已确认, in_progress-进行中, finished-已完成, cancelled-已取消';
COMMENT ON COLUMN public.bookings.updated_at IS '最后更新时间';

-- ================================================================================================
-- 4. 档期锁定表
-- ================================================================================================

CREATE TABLE IF NOT EXISTS public.booking_blackouts (
  id serial PRIMARY KEY,
  date date NOT NULL UNIQUE,
  reason text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_blackouts_date ON public.booking_blackouts(date);

COMMENT ON TABLE public.booking_blackouts IS '档期锁定表 - 管理员锁定不可预约的日期';
COMMENT ON COLUMN public.booking_blackouts.date IS '锁定日期';
COMMENT ON COLUMN public.booking_blackouts.reason IS '锁定原因';

-- ================================================================================================
-- 5. RPC 函数
-- ================================================================================================

-- 检查日期是否可预约（带行级锁防止竞态条件）
CREATE OR REPLACE FUNCTION public.check_date_availability(target_date date)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  is_blacklisted boolean;
  has_active_booking boolean;
BEGIN
  -- 检查是否在黑名单中
  SELECT EXISTS(
    SELECT 1 FROM public.booking_blackouts
    WHERE date = target_date
  ) INTO is_blacklisted;

  IF is_blacklisted THEN
    RETURN false;
  END IF;

  -- 检查是否已有活跃预约（使用 FOR UPDATE 锁定，防止并发插入）
  SELECT EXISTS(
    SELECT 1 FROM public.bookings
    WHERE booking_date = target_date
    AND status IN ('pending', 'confirmed', 'in_progress')
    FOR UPDATE  -- 添加行级锁，防止并发问题
  ) INTO has_active_booking;

  RETURN NOT has_active_booking;
END;
$$;

COMMENT ON FUNCTION public.check_date_availability(date) IS '检查指定日期是否可预约（带行级锁防止竞态条件）';

-- 验证城市是否在允许列表中
CREATE OR REPLACE FUNCTION public.validate_city(p_city_name text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.allowed_cities
    WHERE city_name = p_city_name
    AND is_active = true
  );
END;
$$;

COMMENT ON FUNCTION public.validate_city(text) IS '验证城市是否在允许预约的列表中';

-- 自动完成过期预约
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

-- ================================================================================================
-- 6. RLS 策略
-- ================================================================================================

-- 约拍类型表 RLS
ALTER TABLE public.booking_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active booking types" ON public.booking_types;
DROP POLICY IF EXISTS "Admins can manage booking types" ON public.booking_types;

CREATE POLICY "Anyone can view active booking types"
  ON public.booking_types FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Admins can manage booking types"
  ON public.booking_types FOR ALL
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

-- 城市限制表 RLS
ALTER TABLE public.allowed_cities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view active cities" ON public.allowed_cities;
DROP POLICY IF EXISTS "Admins can manage cities" ON public.allowed_cities;

CREATE POLICY "Anyone can view active cities"
  ON public.allowed_cities FOR SELECT
  TO public
  USING (is_active = true);

CREATE POLICY "Admins can manage cities"
  ON public.allowed_cities FOR ALL
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

-- 预约表 RLS
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can create bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can update own pending bookings" ON public.bookings;
DROP POLICY IF EXISTS "Users can cancel bookings before booking date" ON public.bookings;
DROP POLICY IF EXISTS "Admins can view all bookings" ON public.bookings;
DROP POLICY IF EXISTS "Admins can manage all bookings" ON public.bookings;

CREATE POLICY "Users can view own bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookings"
  ON public.bookings FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can cancel bookings before booking date"
  ON public.bookings FOR UPDATE
  TO authenticated
  USING (
    auth.uid() = user_id
    AND status IN ('pending', 'confirmed')
    AND booking_date > CURRENT_DATE
  )
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all bookings"
  ON public.bookings FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can manage all bookings"
  ON public.bookings FOR ALL
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

COMMENT ON POLICY "Users can cancel bookings before booking date" ON public.bookings
IS '允许用户在预约日期之前取消待确认或已确认的预约（预约当天不可取消）';

-- 档期锁定表 RLS
ALTER TABLE public.booking_blackouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view blackouts" ON public.booking_blackouts;
DROP POLICY IF EXISTS "Admins can manage blackouts" ON public.booking_blackouts;

CREATE POLICY "Anyone can view blackouts"
  ON public.booking_blackouts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Admins can manage blackouts"
  ON public.booking_blackouts FOR ALL
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
-- 7. 触发器
-- ================================================================================================

-- 更新 updated_at 字段的触发器函数
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 为约拍类型表添加触发器
DROP TRIGGER IF EXISTS update_booking_types_updated_at ON public.booking_types;
CREATE TRIGGER update_booking_types_updated_at
  BEFORE UPDATE ON public.booking_types
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 为城市限制表添加触发器
DROP TRIGGER IF EXISTS update_allowed_cities_updated_at ON public.allowed_cities;
CREATE TRIGGER update_allowed_cities_updated_at
  BEFORE UPDATE ON public.allowed_cities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 为预约表添加触发器
DROP TRIGGER IF EXISTS update_bookings_updated_at ON public.bookings;
CREATE TRIGGER update_bookings_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ================================================================================================
-- 8. 定时任务配置（可选）
-- ================================================================================================

-- 尝试创建定时任务（每天凌晨1点执行）
DO $$
BEGIN
  -- 检查 pg_cron 扩展是否存在
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- 删除旧的定时任务（如果存在）
    PERFORM cron.unschedule('auto-complete-expired-bookings');

    -- 创建新的定时任务
    PERFORM cron.schedule(
      'auto-complete-expired-bookings',
      '0 1 * * *',
      'SELECT public.auto_complete_expired_bookings()'
    );

    RAISE NOTICE '✅ 定时任务已创建：每天凌晨1点自动完成过期预约';
  ELSE
    RAISE NOTICE '⚠️  pg_cron 扩展未启用，请手动调用 auto_complete_expired_bookings() 或使用其他方式';
  END IF;
END $$;

-- 立即执行一次，清理现有的过期预约
SELECT public.auto_complete_expired_bookings();

-- ================================================================================================
-- 9. 竞态条件防护（唯一索引）
-- ================================================================================================

-- 创建部分唯一索引：只对 pending、confirmed、in_progress 状态的预约生效
-- 这样可以允许同一日期有多个 finished 或 cancelled 的预约（历史记录）
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_active_date
ON public.bookings(booking_date)
WHERE status IN ('pending', 'confirmed', 'in_progress');

COMMENT ON INDEX idx_bookings_unique_active_date IS '确保同一日期只能有一个活跃预约（pending/confirmed/in_progress），防止竞态条件';

-- 创建部分唯一索引：确保同一用户只有一个活跃预约
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_unique_active_user
ON public.bookings(user_id)
WHERE status IN ('pending', 'confirmed', 'in_progress');

COMMENT ON INDEX idx_bookings_unique_active_user IS '确保同一用户只能有一个活跃预约（pending/confirmed/in_progress）';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 预约系统完整功能创建完成！';
  RAISE NOTICE '📋 已创建表：';
  RAISE NOTICE '  - booking_types（约拍类型）';
  RAISE NOTICE '  - allowed_cities（城市限制）';
  RAISE NOTICE '  - bookings（预约信息，包含 updated_at 和 in_progress 状态）';
  RAISE NOTICE '  - booking_blackouts（档期锁定）';
  RAISE NOTICE '🔒 RLS 策略已配置';
  RAISE NOTICE '⚡ RPC 函数已创建';
  RAISE NOTICE '🔄 触发器已设置';
  RAISE NOTICE '📅 预约取消策略：只能在预约日期之前取消';
  RAISE NOTICE '💡 状态流转：pending → confirmed → in_progress → finished';
  RAISE NOTICE '🛡️  竞态条件防护：唯一索引 + 行级锁';
END $$;
