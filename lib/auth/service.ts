import 'server-only';

import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { hashPassword, verifyPassword } from './password';
import { createSession } from './session-store';
import { AuthUser } from './types';

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function normalizePhone(input: string): string {
  return input.trim();
}

function toAuthUser(row: Record<string, any>): AuthUser {
  return {
    id: String(row.id),
    email: String(row.email ?? ''),
    phone: row.phone ? String(row.phone) : null,
    role: row.role === 'admin' ? 'admin' : 'user',
    name: row.name ? String(row.name) : null,
  };
}

export async function findUserByEmail(email: string): Promise<Record<string, any> | null> {
  const result = await executeSQL(
    `
      SELECT u.id, u.email, u.phone, u.password_hash, u.role, p.name
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE u.email = {{email}} AND u.deleted_at <=> NULL
      LIMIT 1
    `,
    {
      email: normalizeEmail(email),
    }
  );

  return result.rows[0] ?? null;
}

export async function findUserByPhone(phone: string): Promise<Record<string, any> | null> {
  const result = await executeSQL(
    `
      SELECT u.id, u.email, u.phone, u.password_hash, p.role, p.name
      FROM users u
      LEFT JOIN profiles p ON p.id = u.id
      WHERE u.phone = {{phone}} AND u.deleted_at <=> NULL
      LIMIT 1
    `,
    {
      phone: normalizePhone(phone),
    }
  );

  return result.rows[0] ?? null;
}

export async function registerUserWithPhone(phone: string, password: string): Promise<{ user: AuthUser | null; error: string | null }> {
  const normalizedPhone = normalizePhone(phone);

  const existingUser = await findUserByPhone(normalizedPhone);
  if (existingUser) {
    return {
      user: null,
      error: 'already_registered',
    };
  }

  const userId = randomUUID();
  const passwordHash = hashPassword(password);
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  await executeSQL(
    `
      INSERT INTO users (
        id, email, phone, password_hash, role, created_at, updated_at, deleted_at
      ) VALUES (
        {{id}}, NULL, {{phone}}, {{password_hash}}, 'user', {{created_at}}, {{updated_at}}, NULL
      )
    `,
    {
      id: userId,
      phone: normalizedPhone,
      password_hash: passwordHash,
      created_at: now,
      updated_at: now,
    }
  );

  await executeSQL(
    `
      INSERT INTO profiles (
        id, email, name, role, phone, created_at
      ) VALUES (
        {{id}}, NULL, '拾光者', 'user', {{phone}}, {{created_at}}
      )
    `,
    {
      id: userId,
      phone: normalizedPhone,
      created_at: now,
    }
  );

  await executeSQL(
    `
      INSERT INTO analytics_daily (date, new_users_count, active_users_count)
      VALUES (CURRENT_DATE(), 1, 0)
      ON DUPLICATE KEY UPDATE new_users_count = new_users_count + 1
    `
  );

  return {
    user: {
      id: userId,
      email: null,
      phone: normalizedPhone,
      role: 'user',
      name: '拾光者',
    },
    error: null,
  };
}

export async function signInWithPassword(
  phone: string,
  password: string,
  userAgent?: string,
  ipAddress?: string
): Promise<{ user: AuthUser | null; sessionToken: string | null; error: string | null }> {
  console.log('[SignIn Debug] 查询手机号:', phone);
  const userRecord = await findUserByPhone(phone);

  if (!userRecord) {
    console.log('[SignIn Debug] 未找到用户');
    return {
      user: null,
      sessionToken: null,
      error: 'invalid_login_credentials',
    };
  }

  console.log('[SignIn Debug] 找到用户:', userRecord.id);
  const passwordHash = String(userRecord.password_hash ?? '');
  console.log('[SignIn Debug] 密码哈希存在:', !!passwordHash);
  console.log('[SignIn Debug] 密码哈希前缀:', passwordHash.substring(0, 20));

  const isPasswordValid = verifyPassword(password, passwordHash);
  console.log('[SignIn Debug] 密码验证结果:', isPasswordValid);

  if (!passwordHash || !isPasswordValid) {
    console.log('[SignIn Debug] 密码验证失败');
    return {
      user: null,
      sessionToken: null,
      error: 'invalid_login_credentials',
    };
  }

  const user = toAuthUser(userRecord);
  const sessionToken = await createSession(user.id, userAgent, ipAddress);

  console.log('[SignIn Debug] 登录成功');
  return {
    user,
    sessionToken,
    error: null,
  };
}

export async function updateUserPassword(userId: string, newPassword: string): Promise<{ error: string | null }> {
  const result = await executeSQL(
    `
      SELECT password_hash
      FROM users
      WHERE id = {{user_id}} AND deleted_at <=> NULL
      LIMIT 1
    `,
    { user_id: userId }
  );

  const row = result.rows[0];
  if (!row) {
    return { error: 'user_not_found' };
  }

  const currentHash = String(row.password_hash ?? '');
  if (currentHash && verifyPassword(newPassword, currentHash)) {
    return { error: 'new password should be different from the old password' };
  }

  const newHash = hashPassword(newPassword);
  await executeSQL(
    `
      UPDATE users
      SET password_hash = {{password_hash}}, updated_at = NOW()
      WHERE id = {{user_id}} AND deleted_at <=> NULL
    `,
    {
      password_hash: newHash,
      user_id: userId,
    }
  );

  return { error: null };
}

export async function createPasswordResetToken(email: string): Promise<{ token: string | null; error: string | null }> {
  const userRecord = await findUserByEmail(email);
  if (!userRecord) {
    return { token: null, error: 'user not found' };
  }

  const token = randomUUID().replace(/-/g, '');
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');

  await executeSQL(
    `
      INSERT INTO password_reset_tokens (
        id, user_id, token_hash, expires_at, created_at
      ) VALUES (
        {{id}}, {{user_id}}, {{token_hash}}, {{expires_at}}, NOW()
      )
    `,
    {
      id: tokenId,
      user_id: String(userRecord.id),
      token_hash: token,
      expires_at: expiresAt,
    }
  );

  return { token, error: null };
}

export async function consumePasswordResetToken(tokenHash: string): Promise<{ user: AuthUser | null; sessionToken: string | null; error: string | null }> {
  const tokenResult = await executeSQL(
    `
      SELECT prt.id, prt.user_id, u.email, u.phone, COALESCE(p.role, u.role, 'user') AS role, p.name
      FROM password_reset_tokens prt
      JOIN users u ON u.id = prt.user_id
      LEFT JOIN profiles p ON p.id = u.id
      WHERE prt.token_hash = {{token_hash}}
        AND prt.used_at <=> NULL
        AND prt.expires_at > NOW()
        AND u.deleted_at <=> NULL
      LIMIT 1
    `,
    {
      token_hash: tokenHash,
    }
  );

  const row = tokenResult.rows[0];
  if (!row) {
    return {
      user: null,
      sessionToken: null,
      error: 'invalid_or_expired_token',
    };
  }

  await executeSQL(
    `
      UPDATE password_reset_tokens
      SET used_at = NOW()
      WHERE id = {{id}}
    `,
    {
      id: String(row.id),
    }
  );

  const user = toAuthUser(row);
  const sessionToken = await createSession(user.id);

  return {
    user,
    sessionToken,
    error: null,
  };
}

