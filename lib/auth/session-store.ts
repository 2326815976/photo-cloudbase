import 'server-only';

import { createHash, randomBytes, randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { AuthUser } from './types';

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function formatDateTime(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
  const result = await executeSQL(
    `
      SELECT
        u.id,
        u.email,
        u.phone,
        COALESCE(p.role, u.role, 'user') AS role,
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

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  await executeSQL(
    `
      UPDATE user_sessions
      SET last_seen_at = UTC_TIMESTAMP()
      WHERE token_hash = {{token_hash}}
    `,
    {
      token_hash: tokenHash,
    }
  );

  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    phone: row.phone ? String(row.phone) : null,
    role: row.role === 'admin' ? 'admin' : 'user',
    name: row.name ? String(row.name) : null,
  };
}

export async function cleanupExpiredSessions(): Promise<void> {
  await executeSQL(
    `
      DELETE FROM user_sessions
      WHERE expires_at <= UTC_TIMESTAMP() OR is_revoked = 1
    `
  );
}
