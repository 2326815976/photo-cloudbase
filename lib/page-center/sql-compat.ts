import { extractErrorMessage, executeSQL } from '@/lib/cloudbase/sql-executor';

interface SchemaCacheEntry {
  value: boolean;
  expiresAt: number;
}

const SCHEMA_CACHE_TTL_MS = 5 * 60 * 1000;
const SCHEMA_CACHE_NEGATIVE_TTL_MS = 30 * 1000;
const tableExistsCache = new Map<string, SchemaCacheEntry>();
const tableExistsPending = new Map<string, Promise<boolean>>();
const tableColumnsCache = new Map<string, SchemaCacheEntry>();
const tableColumnsPending = new Map<string, Promise<boolean>>();

function readSchemaCache(cache: Map<string, SchemaCacheEntry>, key: string): boolean | null {
  const cached = cache.get(key);
  if (!cached) {
    return null;
  }

  if (cached.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return cached.value;
}

function writeSchemaCache(cache: Map<string, SchemaCacheEntry>, key: string, value: boolean): boolean {
  cache.set(key, {
    value,
    expiresAt: Date.now() + (value ? SCHEMA_CACHE_TTL_MS : SCHEMA_CACHE_NEGATIVE_TTL_MS),
  });
  return value;
}

async function loadSchemaBoolean(
  cache: Map<string, SchemaCacheEntry>,
  pending: Map<string, Promise<boolean>>,
  key: string,
  loader: () => Promise<boolean>
): Promise<boolean> {
  const cached = readSchemaCache(cache, key);
  if (cached !== null) {
    return cached;
  }

  const inflight = pending.get(key);
  if (inflight) {
    return inflight;
  }

  const task = (async () => {
    try {
      const value = await loader();
      return writeSchemaCache(cache, key, value);
    } catch {
      return writeSchemaCache(cache, key, false);
    } finally {
      pending.delete(key);
    }
  })();

  pending.set(key, task);
  return task;
}

function normalizeSqlErrorMessage(error: unknown): string {
  return extractErrorMessage(error).toLowerCase();
}

export function isColumnMissingError(error: unknown, columnNames: string | string[]) {
  const message = normalizeSqlErrorMessage(error);
  const candidates = Array.isArray(columnNames) ? columnNames : [columnNames];
  if (!message || candidates.length === 0) {
    return false;
  }

  const isMissingColumnMessage =
    message.includes('unknown column') ||
    message.includes('does not exist') ||
    message.includes('could not find') ||
    (message.includes('column') && message.includes('not found'));

  if (!isMissingColumnMessage) {
    return false;
  }

  return candidates.some((columnName) => {
    const normalizedColumnName = String(columnName || '').trim().toLowerCase();
    return normalizedColumnName ? message.includes(normalizedColumnName) : false;
  });
}

export function isTableMissingError(error: unknown, tableNames: string | string[]) {
  const message = normalizeSqlErrorMessage(error);
  const candidates = Array.isArray(tableNames) ? tableNames : [tableNames];
  if (!message || candidates.length === 0) {
    return false;
  }

  const isMissingTableMessage =
    message.includes('table') &&
    (
      message.includes("doesn't exist") ||
      message.includes('does not exist') ||
      message.includes('not found') ||
      message.includes('missing')
    );

  if (!isMissingTableMessage) {
    return false;
  }

  return candidates.some((tableName) => {
    const normalizedTableName = String(tableName || '').trim().toLowerCase();
    return normalizedTableName ? message.includes(normalizedTableName) : false;
  });
}

export function isDuplicateEntryError(error: unknown) {
  const message = normalizeSqlErrorMessage(error);
  return (
    message.includes('duplicate entry') ||
    message.includes('er_dup_entry') ||
    message.includes('unique constraint') ||
    message.includes('duplicate key') ||
    message.includes('1062')
  );
}

export async function tableExists(tableName: string): Promise<boolean> {
  const normalizedTableName = String(tableName || '').trim();
  if (!normalizedTableName) {
    return false;
  }

  return loadSchemaBoolean(tableExistsCache, tableExistsPending, normalizedTableName, async () => {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS row_count
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = {{table_name}}
        LIMIT 1
      `,
      { table_name: normalizedTableName }
    );
    const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
    return Number(row?.row_count || 0) > 0;
  });
}

export async function hasTableColumns(tableName: string, columnNames: string[]): Promise<boolean> {
  const normalizedTableName = String(tableName || '').trim();
  const normalizedColumnNames = Array.from(
    new Set(
      (Array.isArray(columnNames) ? columnNames : [])
        .map((columnName) => String(columnName || '').trim())
        .filter(Boolean)
    )
  );

  if (!normalizedTableName || normalizedColumnNames.length === 0) {
    return false;
  }

  const cacheKey = `${normalizedTableName}:${normalizedColumnNames.join(',')}`;

  return loadSchemaBoolean(tableColumnsCache, tableColumnsPending, cacheKey, async () => {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS row_count
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = {{table_name}}
          AND column_name IN ({{column_names}})
        LIMIT 1
      `,
      {
        table_name: normalizedTableName,
        column_names: normalizedColumnNames,
      }
    );

    const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
    return Number(row?.row_count || 0) >= normalizedColumnNames.length;
  });
}
