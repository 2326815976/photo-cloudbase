-- 创建IP注册频率限制表
CREATE TABLE IF NOT EXISTS ip_registration_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  success BOOLEAN NOT NULL DEFAULT FALSE,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 创建索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_ip_registration_attempts_ip_address
  ON ip_registration_attempts(ip_address);

CREATE INDEX IF NOT EXISTS idx_ip_registration_attempts_attempted_at
  ON ip_registration_attempts(attempted_at DESC);

-- 创建复合索引用于频率限制查询
CREATE INDEX IF NOT EXISTS idx_ip_registration_attempts_ip_time
  ON ip_registration_attempts(ip_address, attempted_at DESC);

-- 添加注释
COMMENT ON TABLE ip_registration_attempts IS 'IP注册尝试记录表，用于频率限制';
COMMENT ON COLUMN ip_registration_attempts.ip_address IS '客户端IP地址';
COMMENT ON COLUMN ip_registration_attempts.attempted_at IS '尝试注册的时间';
COMMENT ON COLUMN ip_registration_attempts.success IS '注册是否成功';
COMMENT ON COLUMN ip_registration_attempts.user_agent IS '用户代理字符串';

-- 创建清理旧记录的函数（保留30天数据）
CREATE OR REPLACE FUNCTION cleanup_old_ip_attempts()
RETURNS void AS $$
BEGIN
  DELETE FROM ip_registration_attempts
  WHERE attempted_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- 创建定时任务（每天凌晨2点清理）
-- 注意：需要在Supabase控制台中手动启用pg_cron扩展
-- SELECT cron.schedule('cleanup-ip-attempts', '0 2 * * *', 'SELECT cleanup_old_ip_attempts()');

-- ================================================================================================
-- RLS 策略配置（安全防护）
-- ================================================================================================

-- 启用 RLS
ALTER TABLE ip_registration_attempts ENABLE ROW LEVEL SECURITY;

-- 只允许管理员查看 IP 注册尝试记录
DROP POLICY IF EXISTS "Admin view ip attempts" ON ip_registration_attempts;
CREATE POLICY "Admin view ip attempts"
  ON ip_registration_attempts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 只允许管理员管理 IP 注册尝试记录
DROP POLICY IF EXISTS "Admin manage ip attempts" ON ip_registration_attempts;
CREATE POLICY "Admin manage ip attempts"
  ON ip_registration_attempts FOR ALL
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

COMMENT ON POLICY "Admin view ip attempts" ON ip_registration_attempts IS '只允许管理员查看IP注册尝试记录';
COMMENT ON POLICY "Admin manage ip attempts" ON ip_registration_attempts IS '只允许管理员管理IP注册尝试记录';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ IP注册频率限制表创建完成！';
  RAISE NOTICE '🔒 RLS 策略已配置：只有管理员可以访问';
  RAISE NOTICE '📊 索引已创建：优化查询性能';
  RAISE NOTICE '🧹 清理函数已创建：自动清理30天前的记录';
END $$;
