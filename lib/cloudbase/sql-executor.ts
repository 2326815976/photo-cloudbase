import 'server-only';

import { env } from '@/lib/env';
import { getCloudBaseSqlModel, resetCloudBaseApp } from './sdk';

export interface SqlExecuteResult {
  rows: Record<string, any>[];
  affectedRows: number;
  insertId: number | null;
  raw: any;
}

export const TRANSIENT_BACKEND_ERROR_CODE = 'TRANSIENT_BACKEND';
export const TRANSIENT_BACKEND_ERROR_MESSAGE = '数据库服务暂时不可用，请稍后重试';
export const SQL_CONFIGURATION_ERROR_CODE = 'SQL_CONFIGURATION_ERROR';
export const SQL_CONFIGURATION_ERROR_MESSAGE =
  'CloudBase SQL 配置无效，请检查 CLOUDBASE_SQL_DB_NAME 是否指向正确的数据库名。';

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const SQL_EXECUTE_RETRY_TIMES = parseNonNegativeInt(process.env.CLOUDBASE_SQL_EXECUTE_RETRIES, 2);
const SQL_EXECUTE_RETRY_DELAY_MS = parseNonNegativeInt(process.env.CLOUDBASE_SQL_EXECUTE_RETRY_DELAY_MS, 250);
const SQL_TRANSIENT_OUTAGE_COOLDOWN_MS = parseNonNegativeInt(
  process.env.CLOUDBASE_SQL_TRANSIENT_OUTAGE_COOLDOWN_MS,
  3000
);
const SQL_TRANSIENT_OUTAGE_FAILURE_THRESHOLD = parseNonNegativeInt(
  process.env.CLOUDBASE_SQL_TRANSIENT_OUTAGE_FAILURE_THRESHOLD,
  2
);

type TransientBackendState = {
  until: number;
  cause: unknown;
  consecutiveFailures: number;
};

type SqlCommandConfig = {
  database?: string;
  instance?: string;
};

type ExecuteSqlOptions = {
  skipTransientOutageGuard?: boolean;
  suppressRetryableFailureMarking?: boolean;
  suppressRetryableFailureLog?: boolean;
};

declare global {
  var __photoTransientBackendState__: TransientBackendState | undefined;
  var __photoResolvedSqlCommandConfig__: SqlCommandConfig | undefined;
  var __photoWarnedInvalidSqlDatabaseConfig__: boolean | undefined;
}

const DEFAULT_CLOUDBASE_SQL_DATABASE = 'photo';

function getTransientBackendState(): TransientBackendState {
  if (!globalThis.__photoTransientBackendState__) {
    globalThis.__photoTransientBackendState__ = {
      until: 0,
      cause: null,
      consecutiveFailures: 0,
    };
  }

  return globalThis.__photoTransientBackendState__;
}

function normalizeSqlConfigValue(value: string | undefined): string {
  return String(value || '').trim();
}

function warnInvalidSqlDatabaseConfig(configuredDatabase: string, cloudbaseEnvId: string): void {
  if (globalThis.__photoWarnedInvalidSqlDatabaseConfig__ || process.env.NODE_ENV === 'production') {
    return;
  }

  globalThis.__photoWarnedInvalidSqlDatabaseConfig__ = true;

  console.warn('[cloudbase.executeSQL.database-config]', {
    configuredDatabase,
    cloudbaseEnvId,
    resolvedDatabase: DEFAULT_CLOUDBASE_SQL_DATABASE,
    message:
      'CLOUDBASE_SQL_DB_NAME 当前指向 CloudBase 环境 ID，已自动回退为默认 SQL 数据库名 photo。',
  });
}

function normalizeSqlCandidateDatabase(value: string | undefined, cloudbaseEnvId: string): string {
  const database = normalizeSqlConfigValue(value);
  if (!database || database === cloudbaseEnvId) {
    return '';
  }

  return database;
}

function resolveConfiguredSqlDatabase(configuredDatabase: string, cloudbaseEnvId: string): string {
  const normalizedConfiguredDatabase = normalizeSqlConfigValue(configuredDatabase);
  if (!normalizedConfiguredDatabase) {
    return DEFAULT_CLOUDBASE_SQL_DATABASE;
  }

  if (normalizedConfiguredDatabase === cloudbaseEnvId) {
    warnInvalidSqlDatabaseConfig(normalizedConfiguredDatabase, cloudbaseEnvId);
    return DEFAULT_CLOUDBASE_SQL_DATABASE;
  }

  return normalizedConfiguredDatabase;
}

function isDatabaseConnectionConfigError(error: unknown): boolean {
  if (
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === SQL_CONFIGURATION_ERROR_CODE
  ) {
    return true;
  }

  return false;
}

function isCloudBaseDatabaseConnectionFailure(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('database connection failed') ||
    (message.includes('invalidparameter') && message.includes('run query failed'))
  );
}

function buildSqlConfigurationError(error?: unknown): Error & { code: string; originError?: unknown } {
  const wrapped = new Error(SQL_CONFIGURATION_ERROR_MESSAGE) as Error & {
    code: string;
    originError?: unknown;
  };
  wrapped.code = SQL_CONFIGURATION_ERROR_CODE;

  if (error !== undefined) {
    wrapped.originError = sanitizeSqlError(error);
  }

  return wrapped;
}

function buildSqlCommandConfigCandidates(): SqlCommandConfig[] {
  const configuredDatabase = normalizeSqlConfigValue(env.CLOUDBASE_SQL_DB_NAME());
  const cloudbaseEnvId = normalizeSqlConfigValue(env.CLOUDBASE_ID());
  const cachedDatabase = normalizeSqlCandidateDatabase(
    globalThis.__photoResolvedSqlCommandConfig__?.database,
    cloudbaseEnvId
  );
  const resolvedConfiguredDatabase = resolveConfiguredSqlDatabase(
    configuredDatabase,
    cloudbaseEnvId
  );
  const instance = 'default';

  const databases = Array.from(
    new Set([cachedDatabase, resolvedConfiguredDatabase, DEFAULT_CLOUDBASE_SQL_DATABASE].filter(Boolean))
  );

  return databases.map((database) => ({
    database,
    instance,
  }));
}

async function runSqlWithResolvedConfig(
  sqlModel: any,
  sql: string,
  values: Record<string, unknown>
): Promise<any> {
  const candidates = buildSqlCommandConfigCandidates();
  let lastError: unknown = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const commandConfig = candidates[index];

    try {
      const result = await sqlModel.$runSQL(sql, values, commandConfig);
      globalThis.__photoResolvedSqlCommandConfig__ = commandConfig;
      return result;
    } catch (error) {
      const sanitizedError = sanitizeSqlError(error);
      lastError = sanitizedError;
      const canTryNext =
        index < candidates.length - 1 &&
        (isDatabaseConnectionConfigError(sanitizedError) || isCloudBaseDatabaseConnectionFailure(sanitizedError));
      if (!canTryNext) {
        break;
      }

      if (process.env.NODE_ENV !== 'production') {
        console.warn('[cloudbase.executeSQL.database-fallback]', {
          from: commandConfig.database,
          to: candidates[index + 1]?.database ?? null,
          message: extractErrorMessage(sanitizedError),
        });
      }
    }
  }

  if (isDatabaseConnectionConfigError(lastError)) {
    throw buildSqlConfigurationError(lastError);
  }

  throw (lastError instanceof Error ? lastError : new Error('SQL execution failed'));
}

function toPlainObject(record: any): Record<string, any> {
  if (!record) {
    return {};
  }

  if (typeof record === 'string') {
    try {
      return JSON.parse(record) as Record<string, any>;
    } catch {
      return { value: record };
    }
  }

  if (typeof record === 'object') {
    return record as Record<string, any>;
  }

  return { value: record };
}

function toNumber(value: any, defaultValue: number = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

function normalizeErrorUrl(value: string): string {
  return String(value || '').replace(/^([a-z]+):+\/\//i, '$1://');
}

function sanitizeSqlErrorInner(error: unknown, seen: WeakSet<object>): unknown {
  if (!error || typeof error !== 'object') {
    return error;
  }

  const target = error as {
    url?: unknown;
    originError?: unknown;
    cause?: unknown;
  };

  if (seen.has(target)) {
    return error;
  }
  seen.add(target);

  if (typeof target.url === 'string') {
    target.url = normalizeErrorUrl(target.url);
  }

  if (target.originError && typeof target.originError === 'object') {
    sanitizeSqlErrorInner(target.originError, seen);
  }

  if (target.cause && typeof target.cause === 'object') {
    sanitizeSqlErrorInner(target.cause, seen);
  }

  return error;
}

function findErrorUrl(error: unknown, seen: WeakSet<object>): string {
  if (!error || typeof error !== 'object') {
    return '';
  }

  const target = error as {
    url?: unknown;
    originError?: unknown;
    cause?: unknown;
  };

  if (seen.has(target)) {
    return '';
  }
  seen.add(target);

  if (typeof target.url === 'string') {
    return normalizeErrorUrl(target.url);
  }

  return (
    findErrorUrl(target.originError, seen) ||
    findErrorUrl(target.cause, seen)
  );
}

export function sanitizeSqlError(error: unknown): unknown {
  return sanitizeSqlErrorInner(error, new WeakSet<object>());
}

export function buildSqlErrorLogPayload(error: unknown): {
  code: string | null;
  message: string;
  url: string | null;
} {
  const sanitized = sanitizeSqlError(error);
  const code =
    sanitized && typeof sanitized === 'object' && typeof (sanitized as { code?: unknown }).code === 'string'
      ? String((sanitized as { code?: unknown }).code)
      : null;
  const url = findErrorUrl(sanitized, new WeakSet<object>()) || null;

  return {
    code,
    message: extractErrorMessage(sanitized),
    url,
  };
}

export function logSqlError(label: string, error: unknown): void {
  const payload = buildSqlErrorLogPayload(error);

  if (isRetryableSqlError(error)) {
    console.warn(label, payload);
    return;
  }

  console.error(label, sanitizeSqlError(error));
}

export function extractErrorMessage(error: unknown): string {
  if (!error) {
    return '';
  }

  if (error instanceof Error) {
    return error.message || '';
  }

  if (typeof error === 'string') {
    return error;
  }

  if (typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    const originError = (error as { originError?: unknown }).originError;
    const code = (error as { code?: unknown }).code;

    return [
      typeof message === 'string' ? message : '',
      typeof code === 'string' ? code : '',
      extractErrorMessage(originError),
    ]
      .filter(Boolean)
      .join(' ');
  }

  return '';
}

export function isMissingDefinerSqlError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes('the user specified as a definer') && message.includes('does not exist');
}

export function isRetryableSqlError(error: unknown): boolean {
  if (isDatabaseConnectionConfigError(error)) {
    return false;
  }

  if (isMissingDefinerSqlError(error)) {
    return false;
  }

  if (isCloudBaseDatabaseConnectionFailure(error)) {
    return true;
  }

  const code = (() => {
    if (error && typeof error === 'object') {
      const value = (error as { code?: unknown }).code;
      return typeof value === 'string' ? value.toLowerCase() : '';
    }

    return '';
  })();

  const message = extractErrorMessage(error).toLowerCase();

  return (
    code === TRANSIENT_BACKEND_ERROR_CODE.toLowerCase() ||
    message.includes('connect timeout') ||
    message.includes('request timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('esockettimedout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up') ||
    message.includes('network')
  );
}

function isWeDaIsKeywordError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return message.includes('does not support the is keyword');
}

function rewriteNullPredicatesForWeDa(sql: string): string {
  let rewritten = String(sql || '');

  rewritten = rewritten.replace(/([`A-Za-z0-9_.]+)\s+IS\s+NOT\s+NULL/gi, '!($1 <=> NULL)');
  rewritten = rewritten.replace(/([`A-Za-z0-9_.]+)\s+IS\s+NULL/gi, '($1 <=> NULL)');

  return rewritten;
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function hasTransientBackendOutage(): boolean {
  const state = getTransientBackendState();
  if (state.until <= Date.now()) {
    state.until = 0;
    return false;
  }

  return true;
}

function clearTransientBackendOutage(): void {
  const state = getTransientBackendState();
  state.until = 0;
  state.cause = null;
  state.consecutiveFailures = 0;
}

function markTransientBackendOutage(error: unknown): void {
  const state = getTransientBackendState();
  state.cause = sanitizeSqlError(error);
  state.consecutiveFailures += 1;

  if (
    SQL_TRANSIENT_OUTAGE_FAILURE_THRESHOLD <= 1 ||
    state.consecutiveFailures >= SQL_TRANSIENT_OUTAGE_FAILURE_THRESHOLD
  ) {
    state.until = Date.now() + SQL_TRANSIENT_OUTAGE_COOLDOWN_MS;
  }
}

function buildTransientBackendError(error?: unknown): Error & { code: string; originError?: unknown } {
  const wrapped = new Error(TRANSIENT_BACKEND_ERROR_MESSAGE) as Error & {
    code: string;
    originError?: unknown;
  };
  wrapped.code = TRANSIENT_BACKEND_ERROR_CODE;

  if (error !== undefined) {
    wrapped.originError = sanitizeSqlError(error);
  }

  return wrapped;
}

export function escapeIdentifier(input: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input)) {
    throw new Error(`非法 SQL 标识符：${input}`);
  }

  return `\`${input}\``;
}

export async function executeSQL(
  sql: string,
  values: Record<string, unknown> = {},
  options: ExecuteSqlOptions = {}
): Promise<SqlExecuteResult> {
  if (!options.skipTransientOutageGuard && hasTransientBackendOutage()) {
    throw buildTransientBackendError(getTransientBackendState().cause);
  }

  let sqlText = String(sql || '');
  let hasAppliedWeDaRewrite = false;
  let response: any = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SQL_EXECUTE_RETRY_TIMES; attempt += 1) {
    try {
      const sqlModel = getCloudBaseSqlModel();
      response = await runSqlWithResolvedConfig(sqlModel, sqlText, values);
      lastError = null;
      clearTransientBackendOutage();
      break;
    } catch (error) {
      const sanitizedError = sanitizeSqlError(error);
      lastError = sanitizedError;

      if (!hasAppliedWeDaRewrite && isWeDaIsKeywordError(sanitizedError)) {
        const rewritten = rewriteNullPredicatesForWeDa(sqlText);
        if (rewritten !== sqlText) {
          sqlText = rewritten;
          hasAppliedWeDaRewrite = true;
          continue;
        }
      }

      const retryable = isRetryableSqlError(sanitizedError);
      const canRetry = retryable && attempt < SQL_EXECUTE_RETRY_TIMES;
      if (!canRetry) {
        if (retryable && !options.suppressRetryableFailureMarking) {
          markTransientBackendOutage(sanitizedError);
        }

        if (
          process.env.NODE_ENV !== 'production' &&
          retryable &&
          !options.suppressRetryableFailureLog
        ) {
          console.warn('[cloudbase.executeSQL.transient]', {
            attempt: attempt + 1,
            message: extractErrorMessage(sanitizedError),
            sql: sqlText.replace(/\s+/g, ' ').trim().slice(0, 280),
          });
        }

        throw (retryable ? buildTransientBackendError(sanitizedError) : sanitizedError);
      }

      resetCloudBaseApp();
      await wait(SQL_EXECUTE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  if (!response) {
    throw (lastError instanceof Error ? lastError : new Error('SQL execution failed'));
  }

  const executeResultList = Array.isArray(response?.data?.executeResultList)
    ? response.data.executeResultList
    : [];

  const rows = executeResultList.map((item: any) => toPlainObject(item));

  let insertId: number | null = null;
  const firstResult = executeResultList[0];
  if (firstResult?.insertId !== undefined && firstResult?.insertId !== null) {
    insertId = toNumber(firstResult.insertId, 0);
  } else if (rows.length > 0 && rows[0].insertId !== undefined) {
    insertId = toNumber(rows[0].insertId, 0);
  }

  const hasAffectedRows = executeResultList.some(
    (item: any) => item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, 'affectedRows')
  );

  const affectedRows = hasAffectedRows
    ? executeResultList.reduce((sum: number, item: any) => sum + toNumber(item?.affectedRows, 0), 0)
    : toNumber(response?.data?.total ?? rows.length, 0);

  return {
    rows,
    affectedRows,
    insertId,
    raw: response,
  };
}
