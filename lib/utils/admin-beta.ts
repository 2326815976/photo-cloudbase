import { formatDateTimeUTC8, parseDateTimeUTC8 } from '@/lib/utils/date-helpers';

export const BETA_FEATURE_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const BETA_FEATURE_CODE_LENGTH = 8;

export const BETA_PRESET_ROUTE_OPTIONS = [
  { route_path: '/pages/index/index', route_title: '摆姿推荐' },
  { route_path: '/pages/gallery/index', route_title: '照片墙' },
  { route_path: '/pages/album/index', route_title: '相册提取' },
  { route_path: '/pages/profile/index', route_title: '我的' },
  { route_path: '/pages/booking/index', route_title: '约拍' },
  { route_path: '/pages/admin/index', route_title: '后台管理' },
];

export function normalizeBetaRoutePath(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  return normalized.slice(0, 255);
}

export function normalizeBetaFeatureCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, BETA_FEATURE_CODE_LENGTH);
}

export function normalizeDbBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return Boolean(fallback);
  if (value === true || value === 1 || value === '1') return true;
  return String(value).toLowerCase() === 'true';
}

export function generateAdminBetaFeatureCode(length = BETA_FEATURE_CODE_LENGTH): string {
  const targetLength = Math.max(1, Math.floor(Number(length) || BETA_FEATURE_CODE_LENGTH));
  let result = '';
  for (let index = 0; index < targetLength; index += 1) {
    const randomIndex = Math.floor(Math.random() * BETA_FEATURE_CODE_CHARS.length);
    result += BETA_FEATURE_CODE_CHARS[randomIndex] ?? 'A';
  }
  return result;
}

export function normalizeBetaDescription(value: unknown, maxLength: number): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  return raw.slice(0, maxLength);
}

export function normalizeBetaExpiresAt(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const dateOnlyMatched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatched) {
    return `${dateOnlyMatched[1]}-${dateOnlyMatched[2]}-${dateOnlyMatched[3]} 23:59:59`;
  }

  const dateTimeMatched = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/);
  if (dateTimeMatched) {
    return `${dateTimeMatched[1]}-${dateTimeMatched[2]}-${dateTimeMatched[3]} ${dateTimeMatched[4]}:${dateTimeMatched[5]}:${dateTimeMatched[6]}`;
  }

  const parsed = parseDateTimeUTC8(raw);
  return parsed ? formatDateTimeUTC8(parsed) : null;
}

export function extractDateText(value: unknown): string {
  const raw = String(value ?? '').trim();
  const matched = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : '';
}

