import { createClient } from '@/lib/cloudbase/client';

type DbClient = ReturnType<typeof createClient>;
type WelcomeLetterMode = 'envelope' | 'stamp' | 'none';

interface CompatError {
  message: string;
  code?: string;
}

export interface AdminAlbumCompatRecord {
  id: string;
  access_key: string;
  title: string;
  cover_url: string;
  welcome_letter: string;
  recipient_name: string;
  enable_tipping: boolean;
  enable_welcome_letter: boolean;
  welcome_letter_mode: WelcomeLetterMode;
  enable_freeze: boolean;
  donation_qr_code_url: string | null;
  created_at: string;
  expires_at: string | null;
}

const ADMIN_ALBUM_FULL_COLUMNS =
  'id, access_key, title, cover_url, welcome_letter, recipient_name, enable_tipping, enable_welcome_letter, welcome_letter_mode, enable_freeze, donation_qr_code_url, expires_at, created_at';
const ADMIN_ALBUM_LEGACY_COLUMNS = 'id, access_key, title, cover_url, enable_tipping, created_at';
const ADMIN_ALBUM_LEGACY_OPTIONAL_COLUMNS = [
  'welcome_letter',
  'recipient_name',
  'enable_welcome_letter',
  'welcome_letter_mode',
  'enable_freeze',
  'donation_qr_code_url',
  'expires_at',
] as const;
const ADMIN_ALBUM_LEGACY_ONLY_MESSAGE = '当前数据库结构较旧，请先执行最新数据库迁移后再重试当前操作';

function normalizeCompatError(error: unknown, fallback: string): CompatError {
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') {
      return {
        message: maybeMessage,
        code: typeof maybeCode === 'string' ? maybeCode : undefined,
      };
    }
  }

  if (error instanceof Error && error.message.trim() !== '') {
    return { message: error.message };
  }

  return { message: fallback };
}

export function isAlbumLegacyColumnMissing(error: unknown, columnName: string): boolean {
  const message = normalizeCompatError(error, '').message.toLowerCase();
  const column = String(columnName || '').trim().toLowerCase();
  if (!message || !column) {
    return false;
  }

  return (
    message.includes(column) &&
    (
      message.includes('unknown column') ||
      message.includes('does not exist') ||
      message.includes('could not find') ||
      (message.includes('column') && message.includes('not found'))
    )
  );
}

function getAlbumLegacyMissingColumns(error: unknown, candidateColumns?: string[]): string[] {
  const allowedColumns = Array.isArray(candidateColumns)
    ? new Set(candidateColumns.map((column) => String(column || '').trim()).filter(Boolean))
    : null;

  return ADMIN_ALBUM_LEGACY_OPTIONAL_COLUMNS.filter((column) => {
    if (allowedColumns && !allowedColumns.has(column)) {
      return false;
    }
    return isAlbumLegacyColumnMissing(error, column);
  });
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function normalizeWelcomeLetterMode(value: unknown, enabledFallback = true): WelcomeLetterMode {
  const normalized = normalizeString(value).trim().toLowerCase();
  if (normalized === 'envelope' || normalized === 'stamp' || normalized === 'none') {
    return normalized;
  }
  return enabledFallback ? 'envelope' : 'none';
}

export function normalizeAdminAlbumRecord(row: unknown): AdminAlbumCompatRecord {
  const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
  const donationQrCodeUrl = normalizeString(source.donation_qr_code_url).trim();
  const expiresAt = normalizeString(source.expires_at).trim();
  const welcomeLetterMode = normalizeWelcomeLetterMode(
    source.welcome_letter_mode,
    source.enable_welcome_letter !== false
  );

  return {
    id: normalizeString(source.id).trim(),
    access_key: normalizeString(source.access_key).trim(),
    title: normalizeString(source.title),
    cover_url: normalizeString(source.cover_url).trim(),
    welcome_letter: normalizeString(source.welcome_letter),
    recipient_name: normalizeString(source.recipient_name).trim() || '拾光者',
    enable_tipping: Boolean(source.enable_tipping),
    enable_welcome_letter: welcomeLetterMode !== 'none',
    welcome_letter_mode: welcomeLetterMode,
    enable_freeze: source.enable_freeze !== false,
    donation_qr_code_url: donationQrCodeUrl || null,
    created_at: normalizeString(source.created_at).trim(),
    expires_at: expiresAt || null,
  };
}

function normalizeAdminAlbumRows(rows: unknown): AdminAlbumCompatRecord[] {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => normalizeAdminAlbumRecord(row));
}

export async function listAlbumsWithCompat(dbClient: DbClient): Promise<{
  data: AdminAlbumCompatRecord[] | null;
  error: CompatError | null;
}> {
  const isTransientAlbumError = (error: unknown): boolean => {
    const normalized = normalizeCompatError(error, '');
    const message = normalized.message.toLowerCase();
    const code = normalized.code?.trim().toUpperCase() ?? '';

    return (
      code === 'TRANSIENT_BACKEND' ||
      message.includes('connect timeout') ||
      message.includes('request timeout') ||
      message.includes('timed out') ||
      message.includes('etimedout') ||
      message.includes('esockettimedout') ||
      message.includes('network')
    );
  };

  const waitForRetry = async (attempt: number): Promise<void> => {
    const delayMs = 800 * Math.max(1, attempt + 1);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  };

  let lastError: unknown = null;

  for (let attempt = 0; attempt <= 2; attempt += 1) {
    let result = await dbClient
      .from('albums')
      .select(ADMIN_ALBUM_FULL_COLUMNS)
      .order('created_at', { ascending: false });

    if (result.error && getAlbumLegacyMissingColumns(result.error).length > 0) {
      result = await dbClient
        .from('albums')
        .select(ADMIN_ALBUM_LEGACY_COLUMNS)
        .order('created_at', { ascending: false });
    }

    if (!result.error) {
      return {
        data: normalizeAdminAlbumRows(result.data),
        error: null,
      };
    }

    lastError = result.error;
    if (!isTransientAlbumError(result.error) || attempt >= 2) {
      break;
    }

    await waitForRetry(attempt);
  }

  return {
    data: null,
    error: normalizeCompatError(lastError, '加载专属空间失败'),
  };
}

async function executeAlbumMutationWithCompat(
  dbClient: DbClient,
  operation: 'insert' | 'update',
  values: Record<string, unknown>,
  options?: {
    albumId?: string;
    fallbackMessage?: string;
  }
): Promise<{
  data: { id?: string } | null;
  error: CompatError | null;
}> {
  const nextValues: Record<string, unknown> = { ...values };

  while (true) {
    let query = operation === 'insert'
      ? dbClient.from('albums').insert(nextValues)
      : dbClient.from('albums').update(nextValues).eq('id', options?.albumId ?? '');

    const result = await query.select('id').maybeSingle();
    if (!result.error) {
      return {
        data: result.data as { id?: string } | null,
        error: null,
      };
    }

    const missingColumns = getAlbumLegacyMissingColumns(result.error, Object.keys(nextValues));
    if (missingColumns.length === 0) {
      return {
        data: null,
        error: normalizeCompatError(result.error, options?.fallbackMessage ?? '专属空间写入失败'),
      };
    }

    if (missingColumns.includes('welcome_letter_mode')) {
      return {
        data: null,
        error: normalizeCompatError(
          { message: ADMIN_ALBUM_LEGACY_ONLY_MESSAGE },
          options?.fallbackMessage ?? '专属空间写入失败'
        ),
      };
    }

    missingColumns.forEach((column) => {
      delete nextValues[column];
    });

    if (Object.keys(nextValues).length === 0) {
      return {
        data: null,
        error: normalizeCompatError(
          { message: ADMIN_ALBUM_LEGACY_ONLY_MESSAGE },
          options?.fallbackMessage ?? '专属空间写入失败'
        ),
      };
    }
  }
}

export async function updateAlbumWithCompat(
  dbClient: DbClient,
  albumId: string,
  values: Record<string, unknown>,
  fallbackMessage?: string
) {
  return executeAlbumMutationWithCompat(dbClient, 'update', values, {
    albumId,
    fallbackMessage: fallbackMessage ?? '更新专属空间失败',
  });
}

export async function insertAlbumWithCompat(
  dbClient: DbClient,
  values: Record<string, unknown>,
  fallbackMessage?: string
) {
  return executeAlbumMutationWithCompat(dbClient, 'insert', values, {
    fallbackMessage: fallbackMessage ?? '创建专属空间失败',
  });
}
