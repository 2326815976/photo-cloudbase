import 'server-only';

import { createHash, randomBytes, randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { AuthUser } from './types';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_CACHE_TTL_MS = 15 * 1000;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;

function isMissingColumnError(error: unknown, columnName: string): boolean {
  const message = String(error instanceof Error ? error.message : error ?? '')
    .trim()
    .toLowerCase();
  const normalizedColumn = String(columnName || '').trim().toLowerCase();
  if (!message || !normalizedColumn) {
    return false;
  }

  return (
    message.includes(normalizedColumn) &&
    (message.includes('unknown column') ||
      message.includes('does not exist') ||
      (message.includes('column') && message.includes('not found')))
  );
}

interface SessionCacheEntry {
  user: AuthUser | null;
  expiresAt: number;
  lastTouchedAt: number;
}

const sessionCache = new Map<string, SessionCacheEntry>();
const sessionLookupPending = new Map<string, Promise<AuthUser | null>>();
const sessionTouchPending = new Map<string, Promise<void>>();

function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function readSessionCache(tokenHash: string): SessionCacheEntry | null {
  const cached = sessionCache.get(tokenHash);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    sessionCache.delete(tokenHash);
    return null;
  }

  return cached;
}

function writeSessionCache(tokenHash: string, user: AuthUser | null, lastTouchedAt: number): SessionCacheEntry {
  const entry: SessionCacheEntry = {
    user,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
    lastTouchedAt,
  };
  sessionCache.set(tokenHash, entry);
  return entry;
}

function clearSessionCache(tokenHash: string): void {
  sessionCache.delete(tokenHash);
  sessionLookupPending.delete(tokenHash);
  sessionTouchPending.delete(tokenHash);
}

function clearUserSessionCache(userId: string): void {
  for (const [tokenHash, entry] of sessionCache.entries()) {
    if (entry.user?.id === userId) {
      clearSessionCache(tokenHash);
    }
  }
}

export function clearSessionCacheByUserId(userId: string): void {
  clearUserSessionCache(userId);
}

function touchSessionLastSeen(tokenHash: string, cacheEntry: SessionCacheEntry): void {
  if (sessionTouchPending.has(tokenHash)) {
    return;
  }

  cacheEntry.lastTouchedAt = Date.now();
  const task = executeSQL(
    `
      UPDATE user_sessions
      SET last_seen_at = UTC_TIMESTAMP()
      WHERE token_hash = {{token_hash}}
    `,
    {
      token_hash: tokenHash,
    },
    {
      suppressRetryableFailureMarking: true,
      suppressRetryableFailureLog: true,
    }
  )
    .then(() => undefined)
    .catch(() => {
      cacheEntry.lastTouchedAt = 0;
    })
    .finally(() => {
      sessionTouchPending.delete(tokenHash);
    });

  sessionTouchPending.set(tokenHash, task);
}

export function createSessionToken(): string {
  return randomBytes(48).toString('hex');
}

export async function createSession(userId: string, userAgent?: string, ipAddress?: string): Promise<string> {
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const sessionId = randomUUID();
  const expiresAt = formatDateTime(new Date(Date.now() + SESSION_DURATION_MS));

  await executeSQL(
    `
      INSERT INTO user_sessions (
        id, user_id, token_hash, expires_at, user_agent, ip_address, is_revoked, created_at, last_seen_at
      )
      VALUES (
        {{id}}, {{user_id}}, {{token_hash}}, {{expires_at}}, {{user_agent}}, {{ip_address}}, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP()
      )
    `,
    {
      id: sessionId,
      user_id: userId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      user_agent: userAgent ?? null,
      ip_address: ipAddress ?? null,
    }
  );

  return token;
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const tokenHash = hashSessionToken(token);
  clearSessionCache(tokenHash);
  await executeSQL(
    `
      UPDATE user_sessions
      SET is_revoked = 1, last_seen_at = UTC_TIMESTAMP()
      WHERE token_hash = {{token_hash}}
    `,
    {
      token_hash: tokenHash,
    }
  );
}

export async function revokeSessionsByUserId(userId: string): Promise<void> {
  clearUserSessionCache(userId);
  await executeSQL(
    `
      UPDATE user_sessions
      SET is_revoked = 1, last_seen_at = UTC_TIMESTAMP()
      WHERE user_id = {{user_id}}
    `,
    {
      user_id: userId,
    }
  );
}

export async function findSessionUser(token: string): Promise<AuthUser | null> {
  const tokenHash = hashSessionToken(token);
  const cached = readSessionCache(tokenHash);
  if (cached) {
    if (cached.user && Date.now() - cached.lastTouchedAt >= SESSION_TOUCH_INTERVAL_MS) {
      touchSessionLastSeen(tokenHash, cached);
    }
    return cached.user;
  }

  const inflight = sessionLookupPending.get(tokenHash);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    const previous = sessionCache.get(tokenHash) ?? null;
    let result;
    try {
      result = await executeSQL(
        `
          SELECT
            u.id,
            u.email,
            u.phone,
            CASE
              WHEN p.role = 'admin' AND u.role = 'admin' THEN 'admin'
              ELSE 'user'
            END AS role,
            p.name
          FROM user_sessions s
          JOIN users u ON u.id = s.user_id
          LEFT JOIN profiles p ON p.id = u.id
          WHERE s.token_hash = {{token_hash}}
            AND s.is_revoked = 0
            AND s.expires_at > UTC_TIMESTAMP()
            AND u.deleted_at <=> NULL
            AND COALESCE(u.is_disabled, 0) = 0
          LIMIT 1
        `,
        {
          token_hash: tokenHash,
        }
      );
    } catch (error) {
      if (!isMissingColumnError(error, 'is_disabled')) {
        throw error;
      }

      result = await executeSQL(
        `
          SELECT
            u.id,
            u.email,
            u.phone,
            CASE
              WHEN p.role = 'admin' AND u.role = 'admin' THEN 'admin'
              ELSE 'user'
            END AS role,
            p.name
          FROM user_sessions s
          JOIN users u ON u.id = s.user_id
          LEFT JOIN profiles p ON p.id = u.id
          WHERE s.token_hash = {{token_hash}}
            AND s.is_revoked = 0
            AND s.expires_at > UTC_TIMESTAMP()
            AND u.deleted_at <=> NULL
          LIMIT 1
        `,
        {
          token_hash: tokenHash,
        }
      );
    }

    const row = result.rows[0];
    const user: AuthUser | null = row
      ? {
          id: String(row.id),
          email: String(row.email ?? ''),
          phone: row.phone ? String(row.phone) : null,
          role: row.role === 'admin' ? 'admin' : 'user',
          name: row.name ? String(row.name) : null,
        }
      : null;

    const lastTouchedAt = previous?.lastTouchedAt ?? 0;
    const cacheEntry = writeSessionCache(tokenHash, user, lastTouchedAt);

    if (user && Date.now() - cacheEntry.lastTouchedAt >= SESSION_TOUCH_INTERVAL_MS) {
      touchSessionLastSeen(tokenHash, cacheEntry);
    }

    return user;
  })().finally(() => {
    sessionLookupPending.delete(tokenHash);
  });

  sessionLookupPending.set(tokenHash, task);
  return task;
}

export async function cleanupExpiredSessions(): Promise<void> {
  await executeSQL(
    `
      DELETE FROM user_sessions
      WHERE expires_at <= UTC_TIMESTAMP() OR is_revoked = 1
    `
  );
}
