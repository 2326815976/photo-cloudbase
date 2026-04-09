interface CompatError {
  message: string;
  code?: string;
}

type DbClient = {
  from(table: string): any;
};

export interface AppReleaseCompatRecord {
  id: number;
  version: string;
  platform: string;
  download_url: string;
  storage_provider: string;
  storage_file_id: string;
  update_log: string;
  force_update: boolean;
  created_at: string;
}

const APP_RELEASE_FULL_COLUMNS =
  'id, version, platform, download_url, storage_provider, storage_file_id, update_log, force_update, created_at';
const APP_RELEASE_LEGACY_COLUMNS =
  'id, version, platform, download_url, update_log, force_update, created_at';
const APP_RELEASE_LEGACY_OPTIONAL_COLUMNS = ['storage_provider', 'storage_file_id'] as const;
const APP_RELEASE_LEGACY_ONLY_MESSAGE = '当前数据库结构较旧，请先执行最新数据库迁移后再重试当前操作';

function toText(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

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

export function isReleaseLegacyColumnMissing(error: unknown, columnName: string): boolean {
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

function getReleaseLegacyMissingColumns(error: unknown, candidateColumns?: string[]): string[] {
  const allowedColumns = Array.isArray(candidateColumns)
    ? new Set(candidateColumns.map((column) => String(column || '').trim()).filter(Boolean))
    : null;

  return APP_RELEASE_LEGACY_OPTIONAL_COLUMNS.filter((column) => {
    if (allowedColumns && !allowedColumns.has(column)) {
      return false;
    }
    return isReleaseLegacyColumnMissing(error, column);
  });
}

function normalizeReleaseRecord(row: unknown): AppReleaseCompatRecord {
  const source = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};

  return {
    id: Number(source.id || 0),
    version: toText(source.version),
    platform: toText(source.platform),
    download_url: toText(source.download_url),
    storage_provider: toText(source.storage_provider),
    storage_file_id: toText(source.storage_file_id),
    update_log: toText(source.update_log),
    force_update: Boolean(source.force_update),
    created_at: toText(source.created_at),
  };
}

function normalizeReleaseRows(rows: unknown): AppReleaseCompatRecord[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row) => normalizeReleaseRecord(row));
}

function buildReleaseListQuery(
  dbClient: DbClient,
  columns: string,
  options?: {
    platform?: string;
    limit?: number;
  }
) {
  let query = dbClient.from('app_releases').select(columns);

  if (options?.platform) {
    query = query.eq('platform', options.platform);
  }

  query = query.order('created_at', { ascending: false });

  if (typeof options?.limit === 'number' && options.limit > 0) {
    query = query.limit(options.limit);
  }

  return query;
}

export async function listReleasesWithCompat(
  dbClient: DbClient,
  options?: {
    platform?: string;
    limit?: number;
    fallbackMessage?: string;
  }
): Promise<{
  data: AppReleaseCompatRecord[] | null;
  error: CompatError | null;
}> {
  let result = await buildReleaseListQuery(dbClient, APP_RELEASE_FULL_COLUMNS, options);

  if (result.error && getReleaseLegacyMissingColumns(result.error).length > 0) {
    result = await buildReleaseListQuery(dbClient, APP_RELEASE_LEGACY_COLUMNS, options);
  }

  if (result.error) {
    return {
      data: null,
      error: normalizeCompatError(result.error, options?.fallbackMessage ?? '加载发布版本失败'),
    };
  }

  return {
    data: normalizeReleaseRows(result.data),
    error: null,
  };
}

async function executeReleaseInsertWithCompat(
  dbClient: DbClient,
  values: Record<string, unknown>,
  fallbackMessage: string
): Promise<{
  data: { id?: number } | null;
  error: CompatError | null;
}> {
  const nextValues: Record<string, unknown> = { ...values };

  while (true) {
    const result = await dbClient.from('app_releases').insert(nextValues).select('id').maybeSingle();
    if (!result.error) {
      return {
        data: result.data as { id?: number } | null,
        error: null,
      };
    }

    const missingColumns = getReleaseLegacyMissingColumns(result.error, Object.keys(nextValues));
    if (missingColumns.length === 0) {
      return {
        data: null,
        error: normalizeCompatError(result.error, fallbackMessage),
      };
    }

    missingColumns.forEach((column) => {
      delete nextValues[column];
    });

    if (Object.keys(nextValues).length === 0) {
      return {
        data: null,
        error: normalizeCompatError({ message: APP_RELEASE_LEGACY_ONLY_MESSAGE }, fallbackMessage),
      };
    }
  }
}

export async function insertReleaseWithCompat(
  dbClient: DbClient,
  values: Record<string, unknown>,
  fallbackMessage?: string
) {
  return executeReleaseInsertWithCompat(
    dbClient,
    values,
    fallbackMessage ?? '创建发布版本失败'
  );
}

export async function getReleaseByIdWithCompat(
  dbClient: DbClient,
  releaseId: number,
  fallbackMessage?: string
): Promise<{
  data: AppReleaseCompatRecord | null;
  error: CompatError | null;
}> {
  let result = await dbClient
    .from('app_releases')
    .select(APP_RELEASE_FULL_COLUMNS)
    .eq('id', releaseId)
    .maybeSingle();

  if (result.error && getReleaseLegacyMissingColumns(result.error).length > 0) {
    result = await dbClient
      .from('app_releases')
      .select(APP_RELEASE_LEGACY_COLUMNS)
      .eq('id', releaseId)
      .maybeSingle();
  }

  if (result.error) {
    return {
      data: null,
      error: normalizeCompatError(result.error, fallbackMessage ?? '获取发布版本失败'),
    };
  }

  return {
    data: result.data ? normalizeReleaseRecord(result.data) : null,
    error: null,
  };
}
