import 'server-only';

import { randomUUID } from 'crypto';
import { AuthContext } from '@/lib/auth/types';
import { executeSQL, escapeIdentifier } from './sql-executor';
import { enforceQueryPermissions } from './permissions';
import { DbQueryPayload, QueryFilter } from './query-types';
import { assertColumnAllowed, getTableMetadata } from './table-metadata';

export interface DbExecuteResult {
  data: any;
  error: { message: string; code?: string } | null;
  count: number | null;
}

function normalizeDbError(error: unknown, fallback: string): { message: string; code?: string } {
  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown; errno?: unknown }).code;
    const maybeErrno = (error as Error & { code?: unknown; errno?: unknown }).errno;
    const message = error.message || fallback;

    // MySQL 重复键：兼容旧调用方对 23505 的判断逻辑。
    if (
      maybeCode === 'ER_DUP_ENTRY' ||
      maybeCode === '1062' ||
      maybeErrno === 1062 ||
      /duplicate entry/i.test(message)
    ) {
      return {
        message,
        code: '23505',
      };
    }

    if (typeof maybeCode === 'string' && maybeCode.trim() !== '') {
      return {
        message,
        code: maybeCode,
      };
    }

    if (typeof maybeErrno === 'number' && Number.isFinite(maybeErrno)) {
      return {
        message,
        code: String(maybeErrno),
      };
    }

    return { message };
  }

  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    const maybeCode = (error as { code?: unknown }).code;
    const message = typeof maybeMessage === 'string' && maybeMessage.trim() !== '' ? maybeMessage : fallback;

    if (/duplicate entry/i.test(message)) {
      return {
        message,
        code: '23505',
      };
    }

    if (typeof maybeCode === 'string' && maybeCode.trim() !== '') {
      return {
        message,
        code: maybeCode,
      };
    }

    if (typeof maybeCode === 'number' && Number.isFinite(maybeCode)) {
      return {
        message,
        code: String(maybeCode),
      };
    }

    return { message };
  }

  return { message: fallback };
}

class SqlValueBuilder {
  private index = 0;
  private readonly values: Record<string, unknown> = {};

  add(value: unknown): string {
    const key = `v_${this.index++}`;
    this.values[key] = value;
    return `{{${key}}}`;
  }

  merge(input: Record<string, unknown>): void {
    Object.entries(input).forEach(([key, value]) => {
      this.values[key] = value;
    });
  }

  build(): Record<string, unknown> {
    return this.values;
  }
}

function normalizeBooleanLike(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  return value;
}

function normalizeWriteValue(value: unknown): unknown {
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }

  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return JSON.stringify(value);
  }

  return value;
}

const booleanColumnsByTable: Record<string, string[]> = {
  albums: ['enable_tipping', 'enable_welcome_letter'],
  album_photos: ['is_public'],
  booking_types: ['is_active'],
  allowed_cities: ['is_active'],
  app_releases: ['force_update'],
};

function normalizeRow(table: string, row: Record<string, any>): Record<string, any> {
  const normalized = { ...row };
  const booleanColumns = booleanColumnsByTable[table] ?? [];

  booleanColumns.forEach((column) => {
    if (normalized[column] === null || normalized[column] === undefined) {
      return;
    }
    normalized[column] = Boolean(Number(normalized[column]));
  });

  if (table === 'poses') {
    if (typeof normalized.tags === 'string') {
      try {
        const parsed = JSON.parse(normalized.tags);
        normalized.tags = Array.isArray(parsed) ? parsed : [];
      } catch {
        normalized.tags = [];
      }
    } else if (!Array.isArray(normalized.tags)) {
      normalized.tags = [];
    }

    if (normalized.rand_key !== null && normalized.rand_key !== undefined) {
      const randKey = Number(normalized.rand_key);
      normalized.rand_key = Number.isFinite(randKey) ? randKey : normalized.rand_key;
    }
  }

  return normalized;
}

function normalizeRows(table: string, rows: Array<Record<string, any>>): Array<Record<string, any>> {
  return rows.map((row) => normalizeRow(table, row));
}

function parseSelectedColumns(table: string, rawColumns: string | undefined): string {
  if (!rawColumns || rawColumns.trim() === '' || rawColumns.trim() === '*') {
    return '*';
  }

  const tokens = rawColumns
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const columns: string[] = [];

  for (const token of tokens) {
    if (token === '*') {
      return '*';
    }

    // 跳过关系字段写法（例如 booking_types(name)），这类会在业务层改为显式查询
    if (token.includes('(') || token.includes(')')) {
      continue;
    }

    const sanitized = token.replace(/"/g, '');
    assertColumnAllowed(table, sanitized);
    columns.push(escapeIdentifier(sanitized));
  }

  if (columns.length === 0) {
    return '*';
  }

  return columns.join(', ');
}

function buildWhereClause(table: string, filters: QueryFilter[] | undefined, builder: SqlValueBuilder): string {
  if (!filters || filters.length === 0) {
    return '';
  }

  const clauses: string[] = [];

  for (const filter of filters) {
    assertColumnAllowed(table, filter.column);
    const columnExpr = escapeIdentifier(filter.column);

    switch (filter.operator) {
      case 'eq': {
        const placeholder = builder.add(normalizeBooleanLike(filter.value));
        clauses.push(`${columnExpr} = ${placeholder}`);
        break;
      }
      case 'neq': {
        const placeholder = builder.add(normalizeBooleanLike(filter.value));
        clauses.push(`${columnExpr} <> ${placeholder}`);
        break;
      }
      case 'gt': {
        const placeholder = builder.add(filter.value);
        clauses.push(`${columnExpr} > ${placeholder}`);
        break;
      }
      case 'gte': {
        const placeholder = builder.add(filter.value);
        clauses.push(`${columnExpr} >= ${placeholder}`);
        break;
      }
      case 'lt': {
        const placeholder = builder.add(filter.value);
        clauses.push(`${columnExpr} < ${placeholder}`);
        break;
      }
      case 'lte': {
        const placeholder = builder.add(filter.value);
        clauses.push(`${columnExpr} <= ${placeholder}`);
        break;
      }
      case 'in': {
        const values = Array.isArray(filter.value) ? filter.value : [];
        if (values.length === 0) {
          clauses.push('1 = 0');
          break;
        }
        const placeholders = values.map((value) => builder.add(normalizeBooleanLike(value)));
        clauses.push(`${columnExpr} IN (${placeholders.join(', ')})`);
        break;
      }
      case 'contains': {
        const input = Array.isArray(filter.value) ? filter.value : [filter.value];
        const placeholder = builder.add(JSON.stringify(input));
        clauses.push(`JSON_CONTAINS(${columnExpr}, CAST(${placeholder} AS JSON))`);
        break;
      }
      case 'overlaps': {
        const input = Array.isArray(filter.value) ? filter.value : [filter.value];
        if (input.length === 0) {
          break;
        }
        const placeholder = builder.add(JSON.stringify(input));
        clauses.push(`JSON_OVERLAPS(${columnExpr}, CAST(${placeholder} AS JSON))`);
        break;
      }
      default:
        throw new Error(`不支持的过滤操作：${(filter as QueryFilter).operator}`);
    }
  }

  if (clauses.length === 0) {
    return '';
  }

  return `WHERE ${clauses.join(' AND ')}`;
}

function buildOrderClause(table: string, orders: DbQueryPayload['orders']): string {
  if (!orders || orders.length === 0) {
    return '';
  }

  const items = orders.map((orderItem) => {
    assertColumnAllowed(table, orderItem.column);
    const direction = orderItem.ascending ? 'ASC' : 'DESC';
    return `${escapeIdentifier(orderItem.column)} ${direction}`;
  });

  return `ORDER BY ${items.join(', ')}`;
}

function buildLimitClause(payload: DbQueryPayload): string {
  if (payload.range) {
    const from = Math.max(0, payload.range.from);
    const to = Math.max(from, payload.range.to);
    const size = to - from + 1;
    return `LIMIT ${size} OFFSET ${from}`;
  }

  if (typeof payload.limit === 'number' && payload.limit > 0) {
    return `LIMIT ${payload.limit}`;
  }

  if (payload.single || payload.maybeSingle) {
    return 'LIMIT 2';
  }

  return '';
}

function finalizeSingleResult(payload: DbQueryPayload, rows: any[]): DbExecuteResult {
  if (payload.single) {
    if (rows.length === 0) {
      return {
        data: null,
        error: { message: 'Expected a single row, but got none', code: 'PGRST116' },
        count: 0,
      };
    }
    if (rows.length > 1) {
      return {
        data: null,
        error: { message: 'Expected a single row, but got multiple', code: 'PGRST117' },
        count: rows.length,
      };
    }
    return {
      data: rows[0],
      error: null,
      count: 1,
    };
  }

  if (payload.maybeSingle) {
    if (rows.length === 0) {
      return {
        data: null,
        error: null,
        count: 0,
      };
    }
    if (rows.length > 1) {
      return {
        data: null,
        error: { message: 'Expected at most one row, but got multiple', code: 'PGRST117' },
        count: rows.length,
      };
    }
    return {
      data: rows[0],
      error: null,
      count: 1,
    };
  }

  return {
    data: rows,
    error: null,
    count: rows.length,
  };
}

async function runSelect(payload: DbQueryPayload): Promise<DbExecuteResult> {
  const builder = new SqlValueBuilder();
  const whereClause = buildWhereClause(payload.table, payload.filters, builder);
  const orderClause = buildOrderClause(payload.table, payload.orders);
  const limitClause = buildLimitClause(payload);
  const columnsExpr = parseSelectedColumns(payload.table, payload.columns);

  const sql = `
    SELECT ${columnsExpr}
    FROM ${escapeIdentifier(payload.table)}
    ${whereClause}
    ${orderClause}
    ${limitClause}
  `;

  const result = await executeSQL(sql, builder.build());
  const rows = normalizeRows(payload.table, result.rows);

  let count: number | null = null;
  if (payload.count === 'exact') {
    const countSql = `
      SELECT COUNT(*) AS total
      FROM ${escapeIdentifier(payload.table)}
      ${whereClause}
    `;
    const countResult = await executeSQL(countSql, builder.build());
    count = Number(countResult.rows[0]?.total ?? 0);
  }

  const finalized = finalizeSingleResult(payload, rows);
  return {
    data: finalized.data,
    error: finalized.error,
    count: count ?? finalized.count,
  };
}

function normalizeWriteRows(payload: DbQueryPayload): Array<Record<string, unknown>> {
  if (!payload.values) {
    return [];
  }
  if (Array.isArray(payload.values)) {
    return payload.values.map((row) => ({ ...row }));
  }
  return [{ ...payload.values }];
}

function attachGeneratedPrimaryKey(payload: DbQueryPayload, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const metadata = getTableMetadata(payload.table);
  if (!metadata.primaryKey || metadata.primaryKeyKind !== 'uuid') {
    return rows;
  }

  return rows.map((row) => {
    if (row[metadata.primaryKey!] !== undefined && row[metadata.primaryKey!] !== null && row[metadata.primaryKey!] !== '') {
      return row;
    }
    return {
      ...row,
      [metadata.primaryKey!]: randomUUID(),
    };
  });
}

async function fetchRowsAfterInsert(
  payload: DbQueryPayload,
  insertedRows: Array<Record<string, unknown>>,
  insertId: number | null
): Promise<any[]> {
  const metadata = getTableMetadata(payload.table);
  const columnsExpr = parseSelectedColumns(payload.table, payload.columns);

  if (metadata.primaryKey && metadata.primaryKeyKind === 'uuid') {
    const ids = insertedRows
      .map((row) => row[metadata.primaryKey!])
      .filter((value) => value !== null && value !== undefined && value !== '');

    if (ids.length > 0) {
      const builder = new SqlValueBuilder();
      const placeholders = ids.map((value) => builder.add(value));
      const sql = `
        SELECT ${columnsExpr}
        FROM ${escapeIdentifier(payload.table)}
        WHERE ${escapeIdentifier(metadata.primaryKey)} IN (${placeholders.join(', ')})
      `;
      const result = await executeSQL(sql, builder.build());
      return result.rows;
    }
  }

  if (metadata.primaryKey && metadata.primaryKeyKind === 'auto' && insertId !== null) {
    const builder = new SqlValueBuilder();
    const firstIdPlaceholder = builder.add(insertId);
    let conditionSql = `${escapeIdentifier(metadata.primaryKey)} >= ${firstIdPlaceholder}`;

    if (insertedRows.length > 1) {
      const lastIdPlaceholder = builder.add(insertId + insertedRows.length - 1);
      conditionSql = `${conditionSql} AND ${escapeIdentifier(metadata.primaryKey)} <= ${lastIdPlaceholder}`;
    }

    const sql = `
      SELECT ${columnsExpr}
      FROM ${escapeIdentifier(payload.table)}
      WHERE ${conditionSql}
      ORDER BY ${escapeIdentifier(metadata.primaryKey)} ASC
    `;
    const result = await executeSQL(sql, builder.build());
    return result.rows;
  }

  return [];
}

async function runInsert(payload: DbQueryPayload): Promise<DbExecuteResult> {
  const rows = attachGeneratedPrimaryKey(payload, normalizeWriteRows(payload));
  if (rows.length === 0) {
    return {
      data: null,
      error: { message: '插入数据不能为空' },
      count: null,
    };
  }

  const metadata = getTableMetadata(payload.table);
  const allColumns = Array.from(
    rows.reduce((set, row) => {
      Object.keys(row).forEach((key) => {
        assertColumnAllowed(payload.table, key);
        set.add(key);
      });
      return set;
    }, new Set<string>())
  );

  if (allColumns.length === 0) {
    return {
      data: null,
      error: { message: '插入字段不能为空' },
      count: null,
    };
  }

  const builder = new SqlValueBuilder();
  const valuesSql = rows
    .map((row) => {
      const placeholders = allColumns.map((column) => {
        const value = row[column] ?? null;
        return builder.add(normalizeWriteValue(value));
      });
      return `(${placeholders.join(', ')})`;
    })
    .join(', ');

  const sql = `
    INSERT INTO ${escapeIdentifier(payload.table)} (${allColumns.map((column) => escapeIdentifier(column)).join(', ')})
    VALUES ${valuesSql}
  `;

  const insertResult = await executeSQL(sql, builder.build());

  if (!payload.selectAfterWrite) {
    return {
      data: null,
      error: null,
      count: null,
    };
  }

  const selectedRows = normalizeRows(
    payload.table,
    await fetchRowsAfterInsert(payload, rows, insertResult.insertId)
  );
  const finalized = finalizeSingleResult(payload, selectedRows);
  return {
    data: finalized.data,
    error: finalized.error,
    count: finalized.count,
  };
}

async function runUpdate(payload: DbQueryPayload): Promise<DbExecuteResult> {
  if (!payload.values || Array.isArray(payload.values)) {
    return {
      data: null,
      error: { message: '更新数据格式错误' },
      count: null,
    };
  }

  const builder = new SqlValueBuilder();
  const setClauses: string[] = [];
  Object.entries(payload.values).forEach(([column, value]) => {
    assertColumnAllowed(payload.table, column);
    const placeholder = builder.add(normalizeWriteValue(value));
    setClauses.push(`${escapeIdentifier(column)} = ${placeholder}`);
  });

  if (setClauses.length === 0) {
    return {
      data: null,
      error: { message: '更新字段不能为空' },
      count: null,
    };
  }

  const whereClause = buildWhereClause(payload.table, payload.filters, builder);
  if (!whereClause) {
    return {
      data: null,
      error: { message: '更新操作必须包含过滤条件' },
      count: null,
    };
  }

  const sql = `
    UPDATE ${escapeIdentifier(payload.table)}
    SET ${setClauses.join(', ')}
    ${whereClause}
  `;
  await executeSQL(sql, builder.build());

  if (!payload.selectAfterWrite) {
    return {
      data: null,
      error: null,
      count: null,
    };
  }

  const selected = await runSelect({
    ...payload,
    action: 'select',
    selectAfterWrite: false,
  });
  return selected;
}

async function runDelete(payload: DbQueryPayload): Promise<DbExecuteResult> {
  const whereBuilder = new SqlValueBuilder();
  const whereClause = buildWhereClause(payload.table, payload.filters, whereBuilder);
  if (!whereClause) {
    return {
      data: null,
      error: { message: '删除操作必须包含过滤条件' },
      count: null,
    };
  }

  const sql = `
    DELETE FROM ${escapeIdentifier(payload.table)}
    ${whereClause}
  `;

  await executeSQL(sql, whereBuilder.build());

  return {
    data: null,
    error: null,
    count: null,
  };
}

export async function executeQuery(payload: DbQueryPayload, context: AuthContext): Promise<DbExecuteResult> {
  try {
    const scopedPayload = enforceQueryPermissions(payload, context);

    switch (scopedPayload.action) {
      case 'select':
        return await runSelect(scopedPayload);
      case 'insert':
        return await runInsert(scopedPayload);
      case 'update':
        return await runUpdate(scopedPayload);
      case 'delete':
        return await runDelete(scopedPayload);
      default:
        return {
          data: null,
          error: { message: `不支持的操作：${(scopedPayload as DbQueryPayload).action}` },
          count: null,
        };
    }
  } catch (error) {
    const normalizedError = normalizeDbError(error, '数据库查询失败');
    return {
      data: null,
      error: normalizedError,
      count: null,
    };
  }
}
