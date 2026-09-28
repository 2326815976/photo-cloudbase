import { extractErrorMessage } from '@/lib/cloudbase/sql-executor';
import { isColumnMissingError, isDuplicateEntryError, isTableMissingError } from '@/lib/page-center/sql-compat';

export const PAGE_CENTER_SCHEMA_ERROR_CODE = 'PAGE_CENTER_SCHEMA_INCOMPLETE';
const PAGE_CENTER_SCHEMA_FALLBACK_MESSAGE =
  'Page-center database schema is incomplete. Please run the latest database migrations first.';
const PAGE_CENTER_SCHEMA_TABLES = [
  'app_page_registry',
  'app_page_publish_rules',
  'app_page_beta_codes',
  'user_page_beta_bindings',
];
const PAGE_CENTER_SCHEMA_COLUMNS = ['is_nav_candidate_web', 'header_title', 'header_subtitle'];

export class PageCenterSchemaError extends Error {
  code = PAGE_CENTER_SCHEMA_ERROR_CODE;

  constructor(message: string) {
    super(message);
    this.name = 'PageCenterSchemaError';
  }
}

export function createPageCenterSchemaError(message: string) {
  return new PageCenterSchemaError(message || PAGE_CENTER_SCHEMA_FALLBACK_MESSAGE);
}

export function isPageCenterSchemaError(error: unknown): error is PageCenterSchemaError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (
    error instanceof PageCenterSchemaError ||
    (error as { code?: unknown }).code === PAGE_CENTER_SCHEMA_ERROR_CODE ||
    (error as { name?: unknown }).name === 'PageCenterSchemaError'
  );
}

export function resolvePageCenterAdminError(
  error: unknown,
  options?: {
    fallbackMessage?: string;
    duplicateMessage?: string;
    defaultClientStatus?: number;
  }
) {
  const fallbackMessage = options?.fallbackMessage || 'Page-center operation failed';
  const rawMessage = extractErrorMessage(error).trim();

  if (
    isPageCenterSchemaError(error) ||
    isTableMissingError(error, PAGE_CENTER_SCHEMA_TABLES) ||
    isColumnMissingError(error, PAGE_CENTER_SCHEMA_COLUMNS)
  ) {
    return {
      status: 503,
      message: rawMessage || PAGE_CENTER_SCHEMA_FALLBACK_MESSAGE,
    };
  }

  if (isDuplicateEntryError(error)) {
    return {
      status: 400,
      message: options?.duplicateMessage || 'Duplicate data detected. Please adjust and retry.',
    };
  }

  if (error instanceof Error && error.message.trim()) {
    const message = error.message.trim();
    const normalized = message.toLowerCase();
    if (normalized.includes('not found')) {
      return { status: 404, message };
    }
    return {
      status: options?.defaultClientStatus ?? 400,
      message,
    };
  }

  return {
    status: 500,
    message: fallbackMessage,
  };
}
