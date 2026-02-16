import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { toTimestampUTC8 } from '@/lib/utils/date-helpers';

export const RATE_LIMIT_CONFIG = {
  MAX_ATTEMPTS_PER_HOUR: 3,
  MAX_ATTEMPTS_PER_DAY: 5,
  HOUR_WINDOW: 60 * 60 * 1000,
  DAY_WINDOW: 24 * 60 * 60 * 1000,
} as const;

const RATE_LIMIT_RETENTION_DAYS = 7;
const RATE_LIMIT_CLEANUP_BATCH = 2000;
const RATE_LIMIT_CLEANUP_COOLDOWN_MS = 10 * 60 * 1000;
const NOW_UTC8_EXPR = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)';

let lastRateLimitCleanupAt = 0;
let rateLimitCleanupInFlight = false;

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function triggerRateLimitCleanup(): void {
  const now = Date.now();
  if (now - lastRateLimitCleanupAt < RATE_LIMIT_CLEANUP_COOLDOWN_MS) {
    return;
  }

  if (rateLimitCleanupInFlight) {
    return;
  }

  lastRateLimitCleanupAt = now;
  rateLimitCleanupInFlight = true;

  void executeSQL(
    `
      DELETE FROM ip_registration_attempts
      WHERE attempted_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${RATE_LIMIT_RETENTION_DAYS} DAY)
      LIMIT ${RATE_LIMIT_CLEANUP_BATCH}
    `
  )
    .catch((error) => {
      console.error('清理IP限流历史记录失败:', error);
    })
    .finally(() => {
      rateLimitCleanupInFlight = false;
    });
}

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
    triggerRateLimitCleanup();

    const now = new Date();

    const result = await executeSQL(
      `
        SELECT
          COUNT(*) AS day_count,
          SUM(CASE WHEN attempted_at >= DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 1 HOUR) THEN 1 ELSE 0 END) AS hour_count,
          MIN(CASE WHEN attempted_at >= DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 1 HOUR) THEN attempted_at ELSE NULL END) AS oldest_in_hour,
          MIN(attempted_at) AS oldest_in_day
        FROM ip_registration_attempts
        WHERE ip_address = {{ip_address}}
          AND attempted_at >= DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 1 DAY)
      `,
      { ip_address: ipAddress }
    );

    const row = result.rows[0] ?? {};
    const dayCount = toNumber(row.day_count, 0);
    const hourCount = toNumber(row.hour_count, 0);

    if (hourCount >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_HOUR) {
      const oldestInHourMs = toTimestampUTC8(row.oldest_in_hour);
      if (!Number.isFinite(oldestInHourMs) || oldestInHourMs <= 0) {
        return {
          allowed: false,
          reason: '注册过于频繁，请稍后重试',
          retryAfter: 60,
        };
      }

      const retryAfter = Math.ceil(
        (oldestInHourMs + RATE_LIMIT_CONFIG.HOUR_WINDOW - now.getTime()) / 1000
      );

      return {
        allowed: false,
        reason: `注册过于频繁，请在${Math.max(1, Math.ceil(retryAfter / 60))}分钟后重试`,
        retryAfter: Math.max(1, retryAfter),
      };
    }

    if (dayCount >= RATE_LIMIT_CONFIG.MAX_ATTEMPTS_PER_DAY) {
      const oldestInDayMs = toTimestampUTC8(row.oldest_in_day);
      if (!Number.isFinite(oldestInDayMs) || oldestInDayMs <= 0) {
        return {
          allowed: false,
          reason: '今日注册次数已达上限，请稍后重试',
          retryAfter: 3600,
        };
      }

      const retryAfter = Math.ceil(
        (oldestInDayMs + RATE_LIMIT_CONFIG.DAY_WINDOW - now.getTime()) / 1000
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
    triggerRateLimitCleanup();

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
          ${NOW_UTC8_EXPR},
          {{success}},
          {{user_agent}},
          ${NOW_UTC8_EXPR}
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
