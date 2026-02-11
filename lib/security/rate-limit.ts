import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * IP频率限制配置
 */
export const RATE_LIMIT_CONFIG = {
  // 1小时内最多注册次数
  MAX_ATTEMPTS_PER_HOUR: 3,
  // 24小时内最多注册次数
  MAX_ATTEMPTS_PER_DAY: 5,
  // 时间窗口（毫秒）
  HOUR_WINDOW: 60 * 60 * 1000,
  DAY_WINDOW: 24 * 60 * 60 * 1000,
} as const;

function createRateLimitClient() {
  const supabaseUrl = env.SUPABASE_URL();
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('频率限制服务初始化失败: Supabase 环境变量缺失');
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey);
}

/**
 * 验证IP地址格式
 */
function isValidIP(ip: string): boolean {
  // IPv4格式验证
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }
  // IPv6格式验证（简化版）
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip);
}

/**
 * 获取客户端真实IP地址
 */
export function getClientIP(request: Request): string {
  // 优先从代理头获取真实IP
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0].trim();
    if (isValidIP(ip)) return ip;
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP && isValidIP(realIP.trim())) {
    return realIP.trim();
  }

  // Cloudflare
  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP && isValidIP(cfConnectingIP.trim())) {
    return cfConnectingIP.trim();
  }

  // 开发环境返回默认值
  return '127.0.0.1';
}

/**
 * 检查IP是否超过注册频率限制（优化版：单次查询）
 */
export async function checkIPRateLimit(
  ipAddress: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  try {
    const supabase = createRateLimitClient();
    if (!supabase) {
      return { allowed: true };
    }

    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - RATE_LIMIT_CONFIG.HOUR_WINDOW);
    const oneDayAgo = new Date(now.getTime() - RATE_LIMIT_CONFIG.DAY_WINDOW);

    // 优化：只查询一次24小时内的数据
    const { data: allAttempts, error } = await supabase
      .from('ip_registration_attempts')
      .select('id, attempted_at')
      .eq('ip_address', ipAddress)
      .gte('attempted_at', oneDayAgo.toISOString())
      .order('attempted_at', { ascending: false });

    if (error) {
      console.error('查询注册记录失败:', error);
      // 数据库错误时允许通过，避免影响正常用户
      return { allowed: true };
    }

    if (!allAttempts || allAttempts.length === 0) {
      return { allowed: true };
    }

    // 在内存中过滤1小时内的记录
    const hourAttempts = allAttempts.filter(
      attempt => new Date(attempt.attempted_at) >= oneHourAgo
    );

    // 检查1小时限制
    if (hourAttempts.length >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_HOUR) {
      const newestAttempt = new Date(hourAttempts[0].attempted_at);
      const retryAfter = Math.ceil(
        (newestAttempt.getTime() + RATE_LIMIT_CONFIG.HOUR_WINDOW - now.getTime()) / 1000
      );
      return {
        allowed: false,
        reason: `注册过于频繁，请在${Math.ceil(retryAfter / 60)}分钟后重试`,
        retryAfter,
      };
    }

    // 检查24小时限制
    if (allAttempts.length >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_DAY) {
      const newestAttempt = new Date(allAttempts[0].attempted_at);
      const retryAfter = Math.ceil(
        (newestAttempt.getTime() + RATE_LIMIT_CONFIG.DAY_WINDOW - now.getTime()) / 1000
      );
      return {
        allowed: false,
        reason: `今日注册次数已达上限，请在${Math.ceil(retryAfter / 3600)}小时后重试`,
        retryAfter,
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('IP频率限制检查失败:', error);
    // 发生错误时允许通过，避免影响正常用户
    return { allowed: true };
  }
}

/**
 * 记录IP注册尝试
 */
export async function recordIPAttempt(
  ipAddress: string,
  success: boolean,
  userAgent?: string
): Promise<void> {
  try {
    const supabase = createRateLimitClient();
    if (!supabase) {
      return;
    }

    const { error } = await supabase.from('ip_registration_attempts').insert({
      ip_address: ipAddress,
      success,
      user_agent: userAgent || null,
      attempted_at: new Date().toISOString(),
    });

    if (error) {
      console.error('记录IP注册尝试失败:', error);
    }
  } catch (error) {
    console.error('记录IP注册尝试异常:', error);
  }
}
