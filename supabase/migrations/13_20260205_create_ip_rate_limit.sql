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
