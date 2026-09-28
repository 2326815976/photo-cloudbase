import { createClient } from '@/lib/cloudbase/client';

type DbClient = ReturnType<typeof createClient>;

interface CompatError {
  message: string;
  code?: string;
}

export interface AboutSettingsCompatRecord {
  id: number | null;
  author_name: string;
  phone: string;
  wechat: string;
  email: string;
  donation_qr_code: string;
  author_message: string;
}

const ABOUT_SETTINGS_SELECT_COLUMNS = 'id, author_name, phone, wechat, email, donation_qr_code, author_message';

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

function isColumnMissingError(error: unknown, columnName: string): boolean {
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

function toText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  const normalized = text.toLowerCase();
  return normalized === 'null' || normalized === 'undefined' ? '' : text;
}

function toMessageText(value: unknown): string {
  const raw = String(value ?? '');
  const text = raw.trim();
  if (!text) {
    return '';
  }

  const normalized = text.toLowerCase();
  return normalized === 'null' || normalized === 'undefined' ? '' : raw.replace(/\r\n/g, '\n');
}

function normalizeImageUrlText(value: unknown): string {
  const text = toText(value);
  if (!text) {
    return '';
  }

  if (
    text.startsWith('https://') ||
    text.startsWith('http://') ||
    text.startsWith('cloud://') ||
    text.startsWith('/') ||
    text.startsWith('data:image/')
  ) {
    return text;
  }

  return '';
}

export function normalizeAboutSettingsRecord(row: unknown): AboutSettingsCompatRecord {
  const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
  const rawId = Number(source.id ?? 0);

  return {
    id: Number.isFinite(rawId) && rawId > 0 ? rawId : null,
    author_name: toText(source.author_name),
    phone: toText(source.phone),
    wechat: toText(source.wechat),
    email: toText(source.email),
    donation_qr_code: normalizeImageUrlText(source.donation_qr_code),
    author_message: toMessageText(source.author_message),
  };
}

export async function loadLatestAboutSettingsWithCompat(dbClient: DbClient): Promise<{
  data: AboutSettingsCompatRecord | null;
  error: CompatError | null;
}> {
  let result = await dbClient
    .from('about_settings')
    .select(ABOUT_SETTINGS_SELECT_COLUMNS)
    .order('updated_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (result.error && isColumnMissingError(result.error, 'updated_at')) {
    result = await dbClient
      .from('about_settings')
      .select(ABOUT_SETTINGS_SELECT_COLUMNS)
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
  }

  if (result.error) {
    return {
      data: null,
      error: normalizeCompatError(result.error, '加载关于设置失败'),
    };
  }

  return {
    data: result.data ? normalizeAboutSettingsRecord(result.data) : null,
    error: null,
  };
}
