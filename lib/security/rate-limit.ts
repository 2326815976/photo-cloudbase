import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';

export const RATE_LIMIT_CONFIG = {
  MAX_ATTEMPTS_PER_HOUR: 3,
  MAX_ATTEMPTS_PER_DAY: 5,
  HOUR_WINDOW: 60 * 60 * 1000,
  DAY_WINDOW: 24 * 60 * 60 * 1000,
} as const;

function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split('.');
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  }

  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  return ipv6Regex.test(ip);
}

export function getClientIP(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0].trim();
    if (isValidIP(ip)) return ip;
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP && isValidIP(realIP.trim())) {
    return realIP.trim();
  }

  const cfConnectingIP = request.headers.get('cf-connecting-ip');
  if (cfConnectingIP && isValidIP(cfConnectingIP.trim())) {
    return cfConnectingIP.trim();
  }

  return '127.0.0.1';
}

export async function checkIPRateLimit(
  ipAddress: string
): Promise<{ allowed: boolean; reason?: string; retryAfter?: number }> {
  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - RATE_LIMIT_CONFIG.HOUR_WINDOW);

    const result = await executeSQL(
      `
        SELECT id, attempted_at
        FROM ip_registration_attempts
        WHERE ip_address = {{ip_address}}
          AND attempted_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
        ORDER BY attempted_at DESC
      `,
      { ip_address: ipAddress }
    );

    const allAttempts = result.rows ?? [];
    if (allAttempts.length === 0) {
      return { allowed: true };
    }

    const hourAttempts = allAttempts.filter((attempt) => {
      const attemptedAt = new Date(String(attempt.attempted_at));
      return attemptedAt >= oneHourAgo;
    });

    if (hourAttempts.length >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_HOUR) {
      const oldestInHour = new Date(String(hourAttempts[hourAttempts.length - 1].attempted_at));
      const retryAfter = Math.ceil(
        (oldestInHour.getTime() + RATE_LIMIT_CONFIG.HOUR_WINDOW - now.getTime()) / 1000
      );

      return {
        allowed: false,
        reason: `注册过于频繁，请在${Math.max(1, Math.ceil(retryAfter / 60))}分钟后重试`,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    if (allAttempts.length >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_DAY) {
      const oldestInDay = new Date(String(allAttempts[allAttempts.length - 1].attempted_at));
      const retryAfter = Math.ceil(
        (oldestInDay.getTime() + RATE_LIMIT_CONFIG.DAY_WINDOW - now.getTime()) / 1000
      );

      return {
        allowed: false,
        reason: `今日注册次数已达上限，请在${Math.max(1, Math.ceil(retryAfter / 3600))}小时后重试`,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    return { allowed: true };
  } catch (error) {
    console.error('IP频率限制检查失败:', error);
    return { allowed: true };
  }
}

export async function recordIPAttempt(
  ipAddress: string,
  success: boolean,
  userAgent?: string
): Promise<void> {
  try {
    await executeSQL(
      `
        INSERT INTO ip_registration_attempts (
          id,
          ip_address,
          attempted_at,
          success,
          user_agent,
          created_at
        )
        VALUES (
          {{id}},
          {{ip_address}},
          NOW(),
          {{success}},
          {{user_agent}},
          NOW()
        )
      `,
      {
        id: randomUUID(),
        ip_address: ipAddress,
        success: success ? 1 : 0,
        user_agent: userAgent || null,
      }
    );
  } catch (error) {
    console.error('记录IP注册尝试异常:', error);
  }
}
