import 'server-only';

import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { normalizeChinaMobile } from '@/lib/utils/phone';
import { hashPassword, verifyPassword } from './password';
import { createSession } from './session-store';
import { AuthUser } from './types';

const NOW_UTC8_EXPR = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)';
const TODAY_UTC8_EXPR = 'DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))';
const WECHAT_MINI_DEFAULT_NAME = '微信用户';
const WECHAT_MINI_EMAIL_DOMAIN = 'wechat.miniprogram.local';

interface WechatMiniProgramSessionPayload {
  openid?: string;
  unionid?: string;
  errcode?: number;
  errmsg?: string;
}

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function normalizePhone(input: string): string {
  return normalizeChinaMobile(input);
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
      SELECT u.id, u.email, u.phone, u.password_hash, COALESCE(p.role, u.role, 'user') AS role, p.name
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
      SELECT u.id, u.email, u.phone, u.password_hash, COALESCE(p.role, u.role, 'user') AS role, p.name
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

  try {
    await executeSQL(
      `
        INSERT INTO users (
          id, email, phone, password_hash, role, created_at, updated_at, deleted_at
        ) VALUES (
          {{id}}, NULL, {{phone}}, {{password_hash}}, 'user', ${NOW_UTC8_EXPR}, ${NOW_UTC8_EXPR}, NULL
        )
      `,
      {
        id: userId,
        phone: normalizedPhone,
        password_hash: passwordHash,
      }
    );

    await executeSQL(
      `
        INSERT INTO profiles (
          id, email, name, role, phone, created_at
        ) VALUES (
          {{id}}, NULL, '拾光者', 'user', {{phone}}, ${NOW_UTC8_EXPR}
        )
      `,
      {
        id: userId,
        phone: normalizedPhone,
      }
    );

    await executeSQL(
      `
        INSERT INTO analytics_daily (date, new_users_count, active_users_count)
        VALUES (${TODAY_UTC8_EXPR}, 1, 0)
        ON DUPLICATE KEY UPDATE new_users_count = new_users_count + 1
      `
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/duplicate entry|1062|er_dup_entry/i.test(message)) {
      return {
        user: null,
        error: 'already_registered',
      };
    }

    // 非幂等失败时尽量回滚已写入数据，避免 users/profiles 半成功。
    try {
      await executeSQL(
        `
          DELETE FROM users
          WHERE id = {{user_id}}
        `,
        { user_id: userId }
      );
    } catch {
      // ignore cleanup failure, keep original error semantics
    }

    throw error;
  }

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
  const userRecord = await findUserByPhone(phone);

  if (!userRecord) {
    return {
      user: null,
      sessionToken: null,
      error: 'invalid_login_credentials',
    };
  }

  const passwordHash = String(userRecord.password_hash ?? '');
  const isPasswordValid = verifyPassword(password, passwordHash);

  if (!passwordHash || !isPasswordValid) {
    return {
      user: null,
      sessionToken: null,
      error: 'invalid_login_credentials',
    };
  }

  const user = toAuthUser(userRecord);
  const sessionToken = await createSession(user.id, userAgent, ipAddress);

  return {
    user,
    sessionToken,
    error: null,
  };
}

function toWechatMiniEmail(openid: string): string {
  // 使用稳定的伪邮箱将小程序 openid 映射到现有 users 体系，避免额外建表。
  return normalizeEmail(`wx_mp_${openid}@${WECHAT_MINI_EMAIL_DOMAIN}`);
}

async function exchangeWechatMiniCode(code: string): Promise<{ openid: string; unionid: string | null }> {
  const appId = String(process.env.WX_MINI_APPID || '').trim();
  const appSecret = String(process.env.WX_MINI_SECRET || '').trim();

  if (!appId || !appSecret) {
    throw new Error('wx_mini_config_missing');
  }

  const requestUrl = new URL('https://api.weixin.qq.com/sns/jscode2session');
  requestUrl.searchParams.set('appid', appId);
  requestUrl.searchParams.set('secret', appSecret);
  requestUrl.searchParams.set('js_code', code);
  requestUrl.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(requestUrl.toString(), {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = (await response.json()) as WechatMiniProgramSessionPayload;

  if (!response.ok || payload.errcode || !payload.openid) {
    const errorCode = Number(payload.errcode || response.status || 0);
    const errorMessage = String(payload.errmsg || response.statusText || 'unknown').trim();
    throw new Error(`wx_mini_code_exchange_failed:${errorCode}:${errorMessage}`);
  }

  return {
    openid: String(payload.openid),
    unionid: payload.unionid ? String(payload.unionid) : null,
  };
}

async function syncWechatMiniProfile(userId: string, nickName?: string, avatarUrl?: string): Promise<void> {
  const normalizedName = String(nickName || '').trim();
  const normalizedAvatar = String(avatarUrl || '').trim();
  if (!normalizedName && !normalizedAvatar) {
    return;
  }

  const profileResult = await executeSQL(
    `
      SELECT name, avatar
      FROM profiles
      WHERE id = {{user_id}}
      LIMIT 1
    `,
    { user_id: userId }
  );
  const currentProfile = profileResult.rows[0] ?? null;

  const updates: string[] = [];
  const values: Record<string, unknown> = { user_id: userId };

  const currentName = String((currentProfile && currentProfile.name) || '').trim();
  if (normalizedName && (!currentName || currentName === WECHAT_MINI_DEFAULT_NAME)) {
    updates.push('name = {{name}}');
    values.name = normalizedName;
  }

  const currentAvatar = String((currentProfile && currentProfile.avatar) || '').trim();
  if (normalizedAvatar && !currentAvatar) {
    updates.push('avatar = {{avatar}}');
    values.avatar = normalizedAvatar;
  }

  if (!updates.length) {
    return;
  }

  await executeSQL(
    `
      UPDATE profiles
      SET ${updates.join(', ')}
      WHERE id = {{user_id}}
    `,
    values
  );
}

async function ensureWechatMiniUser(openid: string, nickName?: string, avatarUrl?: string): Promise<AuthUser> {
  const normalizedOpenid = String(openid || '').trim();
  if (!normalizedOpenid) {
    throw new Error('wx_mini_openid_missing');
  }

  const loginEmail = toWechatMiniEmail(normalizedOpenid);
  const normalizedName = String(nickName || '').trim() || WECHAT_MINI_DEFAULT_NAME;
  const normalizedAvatar = String(avatarUrl || '').trim();

  const existingUser = await findUserByEmail(loginEmail);
  if (existingUser) {
    await syncWechatMiniProfile(String(existingUser.id), normalizedName, normalizedAvatar || undefined);
    const row = {
      ...existingUser,
      name:
        existingUser.name && String(existingUser.name).trim() && String(existingUser.name).trim() !== WECHAT_MINI_DEFAULT_NAME
          ? existingUser.name
          : normalizedName,
    };
    return toAuthUser(row);
  }

  const userId = randomUUID();
  const passwordHash = hashPassword(randomUUID().replace(/-/g, ''));

  try {
    await executeSQL(
      `
        INSERT INTO users (
          id, email, phone, password_hash, role, created_at, updated_at, deleted_at
        ) VALUES (
          {{id}}, {{email}}, NULL, {{password_hash}}, 'user', ${NOW_UTC8_EXPR}, ${NOW_UTC8_EXPR}, NULL
        )
      `,
      {
        id: userId,
        email: loginEmail,
        password_hash: passwordHash,
      }
    );

    await executeSQL(
      `
        INSERT INTO profiles (
          id, email, name, avatar, role, phone, created_at
        ) VALUES (
          {{id}}, {{email}}, {{name}}, {{avatar}}, 'user', NULL, ${NOW_UTC8_EXPR}
        )
      `,
      {
        id: userId,
        email: loginEmail,
        name: normalizedName,
        avatar: normalizedAvatar || null,
      }
    );

    await executeSQL(
      `
        INSERT INTO analytics_daily (date, new_users_count, active_users_count)
        VALUES (${TODAY_UTC8_EXPR}, 1, 0)
        ON DUPLICATE KEY UPDATE new_users_count = new_users_count + 1
      `
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? '');
    if (/duplicate entry|1062|er_dup_entry/i.test(message)) {
      const fallbackUser = await findUserByEmail(loginEmail);
      if (fallbackUser) {
        await syncWechatMiniProfile(String(fallbackUser.id), normalizedName, normalizedAvatar || undefined);
        return toAuthUser(fallbackUser);
      }
    }

    throw error;
  }

  return {
    id: userId,
    email: loginEmail,
    phone: null,
    role: 'user',
    name: normalizedName,
  };
}

export async function signInWithWechatMiniProgram(
  code: string,
  options: {
    nickName?: string;
    avatarUrl?: string;
    userAgent?: string;
    ipAddress?: string;
  } = {}
): Promise<{ user: AuthUser | null; sessionToken: string | null; openid: string | null; error: string | null }> {
  const normalizedCode = String(code || '').trim();
  if (!normalizedCode) {
    return {
      user: null,
      sessionToken: null,
      openid: null,
      error: 'invalid_code',
    };
  }

  try {
    const { openid } = await exchangeWechatMiniCode(normalizedCode);
    const user = await ensureWechatMiniUser(openid, options.nickName, options.avatarUrl);
    const sessionToken = await createSession(user.id, options.userAgent, options.ipAddress);

    return {
      user,
      sessionToken,
      openid,
      error: null,
    };
  } catch (error) {
    return {
      user: null,
      sessionToken: null,
      openid: null,
      error: error instanceof Error ? error.message : 'wx_mini_login_failed',
    };
  }
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
      SET password_hash = {{password_hash}}
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
        {{id}}, {{user_id}}, {{token_hash}}, {{expires_at}}, UTC_TIMESTAMP()
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
        AND prt.expires_at > UTC_TIMESTAMP()
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
      SET used_at = UTC_TIMESTAMP()
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
