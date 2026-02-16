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
  const response: any = await sqlModel.$runSQL(sql, values);

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
