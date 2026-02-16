import 'server-only';

import { createHash, createHmac, randomBytes, randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { toTimestampUTC8 } from '@/lib/utils/date-helpers';

const CAPTCHA_EXPIRE_MS = 5 * 60 * 1000;
const VERIFY_TOKEN_EXPIRE_MS = 2 * 60 * 1000;
const CAPTCHA_EXPIRE_MINUTES = Math.floor(CAPTCHA_EXPIRE_MS / (60 * 1000));
const VERIFY_TOKEN_EXPIRE_MINUTES = Math.floor(VERIFY_TOKEN_EXPIRE_MS / (60 * 1000));
const NOW_UTC8_EXPR = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)';
const MAX_FAILED_ATTEMPTS = 5;
const ISSUE_LIMIT_WINDOW_MINUTES = 10;
const ISSUE_LIMIT_MAX_PER_WINDOW = 40;
const CLEANUP_COOLDOWN_MS = 90 * 1000;
const CLEANUP_BATCH_LIMIT = 400;
const EXPIRED_GRACE_MINUTES = 2;

let lastCleanupAt = 0;
let cleanupInFlight = false;

export interface SliderTrackPoint {
  position: number;
  timestamp: number;
}

export interface SliderVerifyPayload {
  captchaId: string;
  positionPercent: number;
  trajectory: SliderTrackPoint[];
  startTime: number;
  containerWidth: number;
  sliderWidth: number;
}

interface CaptchaIssueResult {
  ok: boolean;
  captchaId?: string;
  expiresAt?: number;
  reason?: string;
  retryAfter?: number;
}

interface CaptchaVerifyResult {
  valid: boolean;
  verificationToken?: string;
  error?: string;
  refreshCaptcha?: boolean;
}

interface CaptchaRecord {
  id: string;
  ipAddress: string;
  userAgentHash: string;
  expiresAtMs: number;
  verifiedAtMs: number | null;
  verifyTokenExpiresAtMs: number | null;
  consumedAtMs: number | null;
  failedAttempts: number;
  maxAttempts: number;
}

function getCaptchaSecret(): string {
  const key = process.env.CAPTCHA_SECRET_KEY?.trim() || '';

  if (key.length >= 32) {
    return key;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('CAPTCHA_SECRET_KEY 未配置或长度不足(>=32)');
  }

  return key || 'dev-only-insecure-captcha-secret-change-me';
}

function toNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function signToken(token: string): string {
  return createHmac('sha256', getCaptchaSecret()).update(token).digest('hex');
}

function normalizeUserAgent(userAgent?: string): string {
  return String(userAgent || 'unknown').slice(0, 300);
}

function hashUserAgent(userAgent?: string): string {
  return sha256Hex(normalizeUserAgent(userAgent));
}

function isFiniteNumber(input: unknown): input is number {
  return typeof input === 'number' && Number.isFinite(input);
}

function stdDev(samples: number[]): number {
  if (samples.length <= 1) return 0;

  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  return Math.sqrt(variance);
}

function parseCaptchaRecord(row: Record<string, unknown> | undefined): CaptchaRecord | null {
  if (!row) return null;

  return {
    id: String(row.id ?? ''),
    ipAddress: String(row.ip_address ?? ''),
    userAgentHash: String(row.user_agent_hash ?? ''),
    expiresAtMs: toTimestampUTC8(row.expires_at),
    verifiedAtMs: row.verified_at ? toTimestampUTC8(row.verified_at) : null,
    verifyTokenExpiresAtMs: row.verify_token_expires_at ? toTimestampUTC8(row.verify_token_expires_at) : null,
    consumedAtMs: row.consumed_at ? toTimestampUTC8(row.consumed_at) : null,
    failedAttempts: toNumber(row.failed_attempts),
    maxAttempts: toNumber(row.max_attempts, MAX_FAILED_ATTEMPTS),
  };
}

function triggerCleanupCaptchaRows(force = false): void {
  const now = Date.now();
  if (!force && now - lastCleanupAt < CLEANUP_COOLDOWN_MS) {
    return;
  }

  if (cleanupInFlight) {
    return;
  }

  lastCleanupAt = now;
  cleanupInFlight = true;

  void executeSQL(
    `
      DELETE FROM slider_captcha_challenges
      WHERE !(consumed_at <=> NULL)
         OR expires_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${EXPIRED_GRACE_MINUTES} MINUTE)
         OR (!(verify_token_expires_at <=> NULL) AND verify_token_expires_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${EXPIRED_GRACE_MINUTES} MINUTE))
         OR created_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 1 DAY)
      LIMIT ${CLEANUP_BATCH_LIMIT}
    `
  )
    .catch((error) => {
      console.error('[滑块验证码] 清理过期数据失败:', error);
    })
    .finally(() => {
      cleanupInFlight = false;
    });
}

async function getCaptchaRecord(captchaId: string): Promise<CaptchaRecord | null> {
  const result = await executeSQL(
    `
      SELECT
        id,
        ip_address,
        user_agent_hash,
        expires_at,
        verified_at,
        verify_token_expires_at,
        consumed_at,
        failed_attempts,
        max_attempts
      FROM slider_captcha_challenges
      WHERE id = {{id}}
      LIMIT 1
    `,
    { id: captchaId }
  );

  return parseCaptchaRecord(result.rows[0]);
}

async function markCaptchaFailure(captchaId: string, reasonCode: string, nextFailedAttempts: number, maxAttempts: number): Promise<boolean> {
  await executeSQL(
    `
      UPDATE slider_captcha_challenges
      SET failed_attempts = LEAST(failed_attempts + 1, max_attempts),
          last_error_code = {{reason_code}},
          expires_at = CASE WHEN failed_attempts + 1 >= max_attempts THEN ${NOW_UTC8_EXPR} ELSE expires_at END
      WHERE id = {{id}}
        AND consumed_at <=> NULL
    `,
    {
      id: captchaId,
      reason_code: reasonCode,
    }
  );

  return nextFailedAttempts >= maxAttempts;
}

function validateSliderPayload(payload: SliderVerifyPayload): { valid: boolean; reason: string } {
  const { trajectory, startTime, positionPercent, containerWidth, sliderWidth } = payload;

  if (!Array.isArray(trajectory) || trajectory.length < 4 || trajectory.length > 600) {
    return { valid: false, reason: 'invalid_trajectory_length' };
  }

  if (!isFiniteNumber(startTime) || startTime <= 0) {
    return { valid: false, reason: 'invalid_start_time' };
  }

  if (!isFiniteNumber(positionPercent) || positionPercent < 0 || positionPercent > 100) {
    return { valid: false, reason: 'invalid_position_percent' };
  }

  if (!isFiniteNumber(containerWidth) || containerWidth < 180 || containerWidth > 1200) {
    return { valid: false, reason: 'invalid_container_width' };
  }

  if (!isFiniteNumber(sliderWidth) || sliderWidth < 36 || sliderWidth > 120 || sliderWidth >= containerWidth - 20) {
    return { valid: false, reason: 'invalid_slider_width' };
  }

  const maxPosition = containerWidth - sliderWidth;
  const first = trajectory[0];
  const last = trajectory[trajectory.length - 1];

  if (!isFiniteNumber(first.position) || !isFiniteNumber(first.timestamp)) {
    return { valid: false, reason: 'invalid_first_point' };
  }

  if (!isFiniteNumber(last.position) || !isFiniteNumber(last.timestamp)) {
    return { valid: false, reason: 'invalid_last_point' };
  }

  const firstPointDeltaFromStart = first.timestamp - startTime;
  if (firstPointDeltaFromStart < 0 || firstPointDeltaFromStart > 1500) {
    return { valid: false, reason: 'invalid_start_anchor' };
  }

  let previousTimestamp = 0;
  let previousPosition = 0;
  let backwardCount = 0;
  let maxBackwardDistance = 0;
  let maxSpeed = 0;
  let microPauseCount = 0;
  let invalidJump = false;
  const velocitySamples: number[] = [];
  const uniqueTimeBins = new Set<number>();
  const uniquePositionBins = new Set<number>();

  for (let index = 0; index < trajectory.length; index += 1) {
    const point = trajectory[index];

    if (!isFiniteNumber(point.position) || !isFiniteNumber(point.timestamp)) {
      return { valid: false, reason: 'invalid_point_shape' };
    }

    if (point.position < -4 || point.position > maxPosition + 4) {
      return { valid: false, reason: 'position_out_of_range' };
    }

    if (index > 0) {
      if (point.timestamp <= previousTimestamp) {
        return { valid: false, reason: 'non_increasing_timestamp' };
      }

      const deltaTime = point.timestamp - previousTimestamp;
      const deltaPosition = point.position - previousPosition;
      const absDistance = Math.abs(deltaPosition);
      const speed = deltaTime > 0 ? absDistance / deltaTime : Number.POSITIVE_INFINITY;

      if (absDistance > maxPosition * 0.55) {
        invalidJump = true;
      }

      if (deltaPosition < 0) {
        backwardCount += 1;
        maxBackwardDistance = Math.max(maxBackwardDistance, Math.abs(deltaPosition));
      }

      if (deltaTime >= 45 && absDistance <= 3) {
        microPauseCount += 1;
      }

      if (deltaTime >= 8) {
        if (speed > 4.5) {
          return { valid: false, reason: 'speed_too_fast' };
        }

        velocitySamples.push(deltaPosition / deltaTime);
        maxSpeed = Math.max(maxSpeed, speed);
      }

      uniqueTimeBins.add(Math.min(240, Math.floor(deltaTime / 8)));
    }

    uniquePositionBins.add(Math.floor(point.position / 3));
    previousTimestamp = point.timestamp;
    previousPosition = point.position;
  }

  if (invalidJump) {
    return { valid: false, reason: 'abnormal_jump' };
  }

  const totalDuration = last.timestamp - first.timestamp;
  if (totalDuration < 320 || totalDuration > 20000) {
    return { valid: false, reason: 'abnormal_duration' };
  }

  const progress = last.position - first.position;
  const endPercentByTrack = (last.position / maxPosition) * 100;

  if (progress < maxPosition * 0.85) {
    return { valid: false, reason: 'insufficient_progress' };
  }

  if (positionPercent < 96 || endPercentByTrack < 96) {
    return { valid: false, reason: 'position_not_reached' };
  }

  if (Math.abs(endPercentByTrack - positionPercent) > 7) {
    return { valid: false, reason: 'position_mismatch' };
  }

  const averageSpeed = progress / Math.max(totalDuration, 1);
  const backwardRatio = backwardCount / Math.max(trajectory.length - 1, 1);
  const velocityVariation = stdDev(velocitySamples);

  let riskScore = 0;

  if (trajectory.length < 6) riskScore += 20;
  if (uniqueTimeBins.size < 3) riskScore += 20;
  if (uniquePositionBins.size < 8) riskScore += 10;
  if (microPauseCount === 0) riskScore += 10;
  if (averageSpeed < 0.02 || averageSpeed > 1.8) riskScore += 15;
  if (backwardRatio > 0.35) riskScore += 20;
  if (maxBackwardDistance > 24) riskScore += 10;
  if (velocitySamples.length >= 2 && velocityVariation < 0.006) riskScore += 20;
  if (maxSpeed > 3.2) riskScore += 15;

  if (riskScore > 45) {
    return { valid: false, reason: 'trajectory_risk_high' };
  }

  return { valid: true, reason: 'ok' };
}

export async function issueSliderCaptcha(ipAddress: string, userAgent?: string): Promise<CaptchaIssueResult> {
  triggerCleanupCaptchaRows();

  const rateCheck = await executeSQL(
    `
      SELECT COUNT(*) AS total
      FROM slider_captcha_challenges
      WHERE ip_address = {{ip_address}}
        AND created_at >= DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${ISSUE_LIMIT_WINDOW_MINUTES} MINUTE)
    `,
    { ip_address: ipAddress }
  );

  const total = toNumber(rateCheck.rows[0]?.total, 0);
  if (total >= ISSUE_LIMIT_MAX_PER_WINDOW) {
    return {
      ok: false,
      reason: '操作过于频繁，请稍后再试',
      retryAfter: 60,
    };
  }

  const captchaId = randomUUID();

  await executeSQL(
    `
      INSERT INTO slider_captcha_challenges (
        id,
        ip_address,
        user_agent_hash,
        max_attempts,
        failed_attempts,
        created_at,
        expires_at
      )
      VALUES (
        {{id}},
        {{ip_address}},
        {{user_agent_hash}},
        {{max_attempts}},
        0,
        ${NOW_UTC8_EXPR},
        DATE_ADD(${NOW_UTC8_EXPR}, INTERVAL ${CAPTCHA_EXPIRE_MINUTES} MINUTE)
      )
    `,
    {
      id: captchaId,
      ip_address: ipAddress,
      user_agent_hash: hashUserAgent(userAgent),
      max_attempts: MAX_FAILED_ATTEMPTS,
    }
  );

  return {
    ok: true,
    captchaId,
    expiresAt: Date.now() + CAPTCHA_EXPIRE_MS,
  };
}

export async function verifySliderCaptcha(
  payload: SliderVerifyPayload,
  ipAddress: string,
  userAgent?: string
): Promise<CaptchaVerifyResult> {
  triggerCleanupCaptchaRows();

  const captchaRecord = await getCaptchaRecord(payload.captchaId);
  if (!captchaRecord) {
    return { valid: false, error: '验证码无效或已过期', refreshCaptcha: true };
  }

  if (captchaRecord.consumedAtMs) {
    return { valid: false, error: '验证码已使用，请刷新', refreshCaptcha: true };
  }

  if (captchaRecord.expiresAtMs <= Date.now()) {
    return { valid: false, error: '验证码已过期，请刷新', refreshCaptcha: true };
  }

  if (captchaRecord.failedAttempts >= captchaRecord.maxAttempts) {
    return { valid: false, error: '验证失败次数过多，请刷新重试', refreshCaptcha: true };
  }

  const currentUAHash = hashUserAgent(userAgent);
  if (captchaRecord.ipAddress !== ipAddress || captchaRecord.userAgentHash !== currentUAHash) {
    const refreshCaptcha = await markCaptchaFailure(
      payload.captchaId,
      'fingerprint_mismatch',
      captchaRecord.failedAttempts + 1,
      captchaRecord.maxAttempts
    );

    return {
      valid: false,
      error: '验证码校验失败，请刷新重试',
      refreshCaptcha,
    };
  }

  const trajectoryCheck = validateSliderPayload(payload);
  if (!trajectoryCheck.valid) {
    const refreshCaptcha = await markCaptchaFailure(
      payload.captchaId,
      trajectoryCheck.reason,
      captchaRecord.failedAttempts + 1,
      captchaRecord.maxAttempts
    );

    return {
      valid: false,
      error: '滑块轨迹验证失败，请重试',
      refreshCaptcha,
    };
  }

  const verificationToken = randomBytes(24).toString('base64url');

  const updateResult = await executeSQL(
    `
      UPDATE slider_captcha_challenges
      SET verified_at = ${NOW_UTC8_EXPR},
          verify_token_hash = {{verify_token_hash}},
          verify_token_expires_at = DATE_ADD(${NOW_UTC8_EXPR}, INTERVAL ${VERIFY_TOKEN_EXPIRE_MINUTES} MINUTE),
          last_error_code = NULL
      WHERE id = {{id}}
        AND consumed_at <=> NULL
        AND expires_at > ${NOW_UTC8_EXPR}
    `,
    {
      id: payload.captchaId,
      verify_token_hash: signToken(verificationToken),
    }
  );

  if (updateResult.affectedRows !== 1) {
    return {
      valid: false,
      error: '验证码状态已变化，请刷新后重试',
      refreshCaptcha: true,
    };
  }

  return {
    valid: true,
    verificationToken,
  };
}

export async function consumeSliderCaptchaToken(
  captchaId: string,
  verificationToken: string,
  ipAddress: string,
  userAgent?: string
): Promise<boolean> {
  triggerCleanupCaptchaRows();

  if (!captchaId || !verificationToken) {
    return false;
  }

  const updateResult = await executeSQL(
    `
      UPDATE slider_captcha_challenges
      SET consumed_at = ${NOW_UTC8_EXPR},
          expires_at = ${NOW_UTC8_EXPR}
      WHERE id = {{id}}
        AND ip_address = {{ip_address}}
        AND user_agent_hash = {{user_agent_hash}}
        AND verify_token_hash = {{verify_token_hash}}
        AND verify_token_expires_at > ${NOW_UTC8_EXPR}
        AND !(verified_at <=> NULL)
        AND consumed_at <=> NULL
        AND expires_at > ${NOW_UTC8_EXPR}
    `,
    {
      id: captchaId,
      ip_address: ipAddress,
      user_agent_hash: hashUserAgent(userAgent),
      verify_token_hash: signToken(verificationToken),
    }
  );

  if (updateResult.affectedRows !== 1) {
    return false;
  }

  // 非阻塞触发清理，避免把删除开销叠加到注册接口时延上。
  triggerCleanupCaptchaRows(true);

  return true;
}
