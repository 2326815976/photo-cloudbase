import 'server-only';

import { getCloudBaseSqlModel, resetCloudBaseApp } from './sdk';

export interface SqlExecuteResult {
  rows: Record<string, any>[];
  affectedRows: number;
  insertId: number | null;
  raw: any;
}

function parseNonNegativeInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

const SQL_EXECUTE_RETRY_TIMES = parseNonNegativeInt(process.env.CLOUDBASE_SQL_EXECUTE_RETRIES, 1);
const SQL_EXECUTE_RETRY_DELAY_MS = parseNonNegativeInt(process.env.CLOUDBASE_SQL_EXECUTE_RETRY_DELAY_MS, 250);

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

function toRows(records: any): Record<string, any>[] {
  if (!records) {
    return [];
  }
  if (Array.isArray(records)) {
    return records.map((item) => toPlainObject(item));
  }
  return [toPlainObject(records)];
}

function toNumber(value: any, defaultValue: number = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

function extractErrorMessage(error: unknown): string {
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

function isRetryableSqlError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes('connect timeout') ||
    message.includes('request timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('esockettimedout') ||
    message.includes('econnreset') ||
    message.includes('network')
  );
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function escapeIdentifier(input: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(input)) {
    throw new Error(`非法 SQL 标识符：${input}`);
  }
  return `\`${input}\``;
}

export async function executeSQL(
  sql: string,
  values: Record<string, unknown> = {}
): Promise<SqlExecuteResult> {
  let response: any = null;
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= SQL_EXECUTE_RETRY_TIMES; attempt += 1) {
    try {
      const sqlModel = getCloudBaseSqlModel();
      response = await sqlModel.$runSQL(sql, values);
      lastError = null;
      break;
    } catch (error) {
      lastError = error;
      const canRetry = attempt < SQL_EXECUTE_RETRY_TIMES && isRetryableSqlError(error);
      if (!canRetry) {
        throw error;
      }

      // 重建 SDK 客户端，避免单连接状态异常持续影响后续请求
      resetCloudBaseApp();
      await wait(SQL_EXECUTE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  if (!response) {
    throw (lastError instanceof Error ? lastError : new Error('SQL 执行失败'));
  }

  const executeResultList = Array.isArray(response?.data?.executeResultList)
    ? response.data.executeResultList
    : [];

  // CloudBase返回的数据直接在executeResultList数组中,不是records字段
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
