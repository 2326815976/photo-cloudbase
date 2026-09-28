import 'server-only';

import { revokeSessionsByUserId } from '@/lib/auth/session-store';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';

export const ADMIN_USERS_MIGRATION_REQUIRED_MESSAGE =
  '用户禁用能力尚未完成数据库升级，请先执行 photo/sql/migrations/30_admin_user_disable_flag.sql';
const NOW_UTC8_EXPR = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)';
const DISABLED_AT_UTC8_EXPR = 'DATE_ADD(u.disabled_at, INTERVAL 8 HOUR)';

export interface AdminUserListItem {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  wechat: string | null;
  role: 'user' | 'admin';
  isDisabled: boolean;
  disabledAt: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  lastSessionAt: string | null;
  albumCount: number;
  bookingCount: number;
}

export interface AdminManagedUserBrief {
  id: string;
  role: 'user' | 'admin';
  isDisabled: boolean;
}

function toTextOrNull(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function toSafeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDbBoolean(value: unknown): boolean {
  return Number(value ?? 0) > 0;
}

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

function buildAdminUserListQuery(includeDisabledField: boolean): string {
  return `
    SELECT
      u.id,
      p.name,
      COALESCE(NULLIF(TRIM(p.email), ''), NULLIF(TRIM(u.email), '')) AS email,
      COALESCE(NULLIF(TRIM(p.phone), ''), NULLIF(TRIM(u.phone), '')) AS phone,
      p.wechat,
      CASE
        WHEN p.role = 'admin' AND u.role = 'admin' THEN 'admin'
        ELSE 'user'
      END AS role,
      ${includeDisabledField ? 'COALESCE(u.is_disabled, 0)' : '0'} AS is_disabled,
      ${includeDisabledField ? `CASE WHEN u.disabled_at <=> NULL THEN NULL ELSE ${DISABLED_AT_UTC8_EXPR} END` : 'NULL'} AS disabled_at,
      u.created_at,
      p.last_active_at,
      session_stats.last_session_at,
      COALESCE(album_stats.album_count, 0) AS album_count,
      COALESCE(booking_stats.booking_count, 0) AS booking_count
    FROM users u
    LEFT JOIN profiles p ON p.id = u.id
    LEFT JOIN (
      SELECT user_id, DATE_ADD(MAX(last_seen_at), INTERVAL 8 HOUR) AS last_session_at
      FROM user_sessions
      WHERE is_revoked = 0
      GROUP BY user_id
    ) AS session_stats ON session_stats.user_id = u.id
    LEFT JOIN (
      SELECT created_by AS user_id, COUNT(*) AS album_count
      FROM albums
      GROUP BY created_by
    ) AS album_stats ON album_stats.user_id = u.id
    LEFT JOIN (
      SELECT user_id, COUNT(*) AS booking_count
      FROM bookings
      GROUP BY user_id
    ) AS booking_stats ON booking_stats.user_id = u.id
    WHERE u.deleted_at <=> NULL
    ORDER BY
      CASE
        WHEN p.role = 'admin' AND u.role = 'admin' THEN 0
        ELSE 1
      END ASC,
      COALESCE(session_stats.last_session_at, p.last_active_at, u.created_at) DESC,
      u.created_at DESC
  `;
}

function buildAdminManagedUserQuery(includeDisabledField: boolean): string {
  return `
    SELECT
      u.id,
      CASE
        WHEN p.role = 'admin' AND u.role = 'admin' THEN 'admin'
        ELSE 'user'
      END AS role,
      ${includeDisabledField ? 'COALESCE(u.is_disabled, 0)' : '0'} AS is_disabled
    FROM users u
    LEFT JOIN profiles p ON p.id = u.id
    WHERE u.id = {{user_id}}
      AND u.deleted_at <=> NULL
    LIMIT 1
  `;
}

function mapAdminUserRow(row: Record<string, unknown>): AdminUserListItem {
  return {
    id: String(row.id ?? ''),
    name: toTextOrNull(row.name),
    email: toTextOrNull(row.email),
    phone: toTextOrNull(row.phone),
    wechat: toTextOrNull(row.wechat),
    role: row.role === 'admin' ? 'admin' : 'user',
    isDisabled: toDbBoolean(row.is_disabled),
    disabledAt: toTextOrNull(row.disabled_at),
    createdAt: toTextOrNull(row.created_at),
    lastActiveAt: toTextOrNull(row.last_active_at),
    lastSessionAt: toTextOrNull(row.last_session_at),
    albumCount: toSafeNumber(row.album_count),
    bookingCount: toSafeNumber(row.booking_count),
  };
}

function mapAdminManagedUserRow(row: Record<string, unknown>): AdminManagedUserBrief {
  return {
    id: String(row.id ?? ''),
    role: row.role === 'admin' ? 'admin' : 'user',
    isDisabled: toDbBoolean(row.is_disabled),
  };
}

async function collectUserStorageTargets(userId: string): Promise<string[]> {
  const [profileAssetsResult, photoAssetsResult, albumAssetsResult] = await Promise.all([
    executeSQL(
      `
        SELECT avatar
        FROM profiles
        WHERE id = {{user_id}}
        LIMIT 1
      `,
      { user_id: userId }
    ),
    executeSQL(
      `
        SELECT p.url, p.thumbnail_url, p.preview_url, p.original_url
        FROM album_photos p
        JOIN albums a ON a.id = p.album_id
        WHERE a.created_by = {{user_id}}
      `,
      { user_id: userId }
    ),
    executeSQL(
      `
        SELECT cover_url, donation_qr_code_url
        FROM albums
        WHERE created_by = {{user_id}}
      `,
      { user_id: userId }
    ),
  ]);

  const targets = new Set<string>();
  const profileRow = profileAssetsResult.rows[0] ?? {};

  [profileRow.avatar]
    .concat(
      photoAssetsResult.rows.flatMap((row) => [row.url, row.thumbnail_url, row.preview_url, row.original_url]),
      albumAssetsResult.rows.flatMap((row) => [row.cover_url, row.donation_qr_code_url])
    )
    .forEach((value) => {
      const normalized = String(value ?? '').trim();
      if (normalized) {
        targets.add(normalized);
      }
    });

  return Array.from(targets);
}

export async function listAdminUsers(): Promise<AdminUserListItem[]> {
  let result;
  try {
    result = await executeSQL(buildAdminUserListQuery(true));
  } catch (error) {
    if (!isMissingColumnError(error, 'is_disabled')) {
      throw error;
    }
    result = await executeSQL(buildAdminUserListQuery(false));
  }

  return (Array.isArray(result.rows) ? result.rows : [])
    .map((row) => mapAdminUserRow(row as Record<string, unknown>))
    .filter((item) => item.id);
}

export async function findAdminManagedUser(userId: string): Promise<AdminManagedUserBrief | null> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    return null;
  }

  let result;
  try {
    result = await executeSQL(buildAdminManagedUserQuery(true), { user_id: normalizedUserId });
  } catch (error) {
    if (!isMissingColumnError(error, 'is_disabled')) {
      throw error;
    }
    result = await executeSQL(buildAdminManagedUserQuery(false), { user_id: normalizedUserId });
  }

  const row = result.rows[0];
  return row ? mapAdminManagedUserRow(row as Record<string, unknown>) : null;
}

export async function setAdminUserDisabled(userId: string, isDisabled: boolean) {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('用户 ID 非法');
  }

  try {
    const result = await executeSQL(
      `
        UPDATE users
        SET
          is_disabled = {{is_disabled}},
          disabled_at = CASE
            WHEN {{is_disabled}} = 1 THEN ${NOW_UTC8_EXPR}
            ELSE NULL
          END,
          updated_at = ${NOW_UTC8_EXPR}
        WHERE id = {{user_id}}
          AND deleted_at <=> NULL
      `,
      {
        user_id: normalizedUserId,
        is_disabled: isDisabled ? 1 : 0,
      }
    );

    if (result.affectedRows <= 0) {
      throw new Error('user_not_found');
    }
  } catch (error) {
    if (isMissingColumnError(error, 'is_disabled') || isMissingColumnError(error, 'disabled_at')) {
      throw new Error(ADMIN_USERS_MIGRATION_REQUIRED_MESSAGE);
    }
    throw error;
  }

  if (isDisabled) {
    await revokeSessionsByUserId(normalizedUserId);
  }

  return {
    id: normalizedUserId,
    isDisabled,
  };
}

export async function deleteAdminManagedUser(userId: string): Promise<{ warning: string | null }> {
  const normalizedUserId = String(userId || '').trim();
  if (!normalizedUserId) {
    throw new Error('用户 ID 非法');
  }

  let warning: string | null = null;
  let storageTargets: string[] = [];

  try {
    storageTargets = await collectUserStorageTargets(normalizedUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : '未知错误';
    warning = `账号已删除，但收集云存储清理列表失败：${message}`;
  }

  await revokeSessionsByUserId(normalizedUserId);

  await executeSQL(
    `
      DELETE FROM bookings
      WHERE user_id = {{user_id}}
    `,
    { user_id: normalizedUserId }
  );

  const deleteResult = await executeSQL(
    `
      DELETE FROM users
      WHERE id = {{user_id}}
        AND deleted_at <=> NULL
    `,
    { user_id: normalizedUserId }
  );

  if (deleteResult.affectedRows <= 0) {
    throw new Error('user_not_found');
  }

  if (storageTargets.length > 0) {
    try {
      await deleteCloudBaseObjects(storageTargets);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      warning = `账号已删除，但云存储清理失败：${message}`;
    }
  }

  return { warning };
}
