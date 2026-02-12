import 'server-only';

import { getCloudBaseSqlModel } from './sdk';

export interface SqlExecuteResult {
  rows: Record<string, any>[];
  affectedRows: number;
  insertId: number | null;
  raw: any;
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
  const sqlModel = getCloudBaseSqlModel();

  const response: any = await sqlModel.$runSQL({
    sql,
    values,
  });

  const executeResult = response?.data?.executeResultList?.[0] ?? {};
  const rows = toRows(executeResult.records);

  let insertId: number | null = null;
  if (executeResult.insertId !== undefined && executeResult.insertId !== null) {
    insertId = toNumber(executeResult.insertId, 0);
  } else if (rows.length > 0 && rows[0].insertId !== undefined) {
    insertId = toNumber(rows[0].insertId, 0);
  }

  return {
    rows,
    affectedRows: toNumber(executeResult.count, 0),
    insertId,
    raw: response,
  };
}

