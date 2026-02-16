import 'server-only';

import { randomUUID } from 'crypto';
import { AuthContext } from '@/lib/auth/types';
import { hydrateCloudBaseTempUrlsInRows } from '@/lib/cloudbase/storage-url';
import { formatDateTimeUTC8, getDateAfterDaysUTC8 } from '@/lib/utils/date-helpers';
import { isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';
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

const storageUrlColumnsByTable: Record<string, string[]> = {
  poses: ['image_url'],
  albums: ['cover_url', 'donation_qr_code_url'],
  album_photos: ['url', 'thumbnail_url', 'preview_url', 'original_url'],
  app_releases: ['download_url'],
  profiles: ['avatar', 'payment_qr_code'],
};

const VALID_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'in_progress', 'finished', 'cancelled']);
const ACTIVE_BOOKING_STATUSES = ['pending', 'confirmed', 'in_progress'];
const ACTIVE_BOOKING_STATUS_SET = new Set(ACTIVE_BOOKING_STATUSES);

function toTrimmedString(value: unknown): string {
  return String(value ?? '').trim();
}

function isValidDateYmd(dateValue: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return false;
  }

  const [year, month, day] = dateValue.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed.toISOString().slice(0, 10) === dateValue;
}

function normalizeCityForMatch(name: string): string {
  return name
    .replace(/市$/, '')
    .replace(/自治区$/, '')
    .replace(/特别行政区$/, '')
    .trim();
}

function isCityAllowed(cityName: string, allowedCityName: string): boolean {
  const userCity = normalizeCityForMatch(cityName);
  const allowedCity = normalizeCityForMatch(allowedCityName);

  if (userCity === allowedCity || cityName === allowedCityName) {
    return true;
  }

  if (userCity.length >= 2 && allowedCity.length >= 2) {
    return userCity.includes(allowedCity) || allowedCity.includes(userCity);
  }

  return false;
}

function buildInClauseParams(values: ReadonlyArray<unknown>, prefix: string): { clause: string; params: Record<string, unknown> } {
  const params: Record<string, unknown> = {};
  const placeholders = values.map((value, index) => {
    const key = `${prefix}_${index}`;
    params[key] = value;
    return `{{${key}}}`;
  });

  return {
    clause: placeholders.join(', '),
    params,
  };
}

async function validateBookingsBeforeInsert(rows: Array<Record<string, unknown>>): Promise<void> {
  if (rows.length === 0) {
    return;
  }

  type PreparedBooking = {
    userId: string;
    typeId: number;
    bookingDate: string;
    cityName: string;
    status: string;
    isActive: boolean;
  };

  const preparedRows: PreparedBooking[] = rows.map((row, index) => {
    const rowNumber = index + 1;
    const userId = toTrimmedString(row.user_id);
    if (!userId) {
      throw new Error(`预约提交失败：第${rowNumber}条缺少用户标识`);
    }
    row.user_id = userId;

    const typeId = Number(row.type_id);
    if (!Number.isInteger(typeId) || typeId <= 0) {
      throw new Error(`预约提交失败：第${rowNumber}条约拍类型无效`);
    }
    row.type_id = typeId;

    const bookingDate = toTrimmedString(row.booking_date);
    if (!isValidDateYmd(bookingDate)) {
      throw new Error(`预约提交失败：第${rowNumber}条预约日期格式不正确`);
    }
    row.booking_date = bookingDate;

    const location = toTrimmedString(row.location);
    if (!location) {
      throw new Error(`预约提交失败：第${rowNumber}条预约地点不能为空`);
    }
    row.location = location;

    const wechat = toTrimmedString(row.wechat);
    if (!wechat) {
      throw new Error(`预约提交失败：第${rowNumber}条微信号不能为空`);
    }
    row.wechat = wechat;

    const phone = normalizeChinaMobile(toTrimmedString(row.phone));
    if (!isValidChinaMobile(phone)) {
      throw new Error(`预约提交失败：第${rowNumber}条手机号格式不正确`);
    }
    row.phone = phone;

    const cityName = toTrimmedString(row.city_name);
    row.city_name = cityName || null;

    const rawStatus = toTrimmedString(row.status);
    const status = rawStatus || 'pending';
    if (!VALID_BOOKING_STATUSES.has(status)) {
      throw new Error(`预约提交失败：第${rowNumber}条状态无效`);
    }
    row.status = status;

    return {
      userId,
      typeId,
      bookingDate,
      cityName,
      status,
      isActive: ACTIVE_BOOKING_STATUS_SET.has(status),
    };
  });

  const activeRows = preparedRows.filter((row) => row.isActive);
  if (activeRows.length === 0) {
    return;
  }

  const minDate = getDateAfterDaysUTC8(1);
  const maxDate = getDateAfterDaysUTC8(30);

  activeRows.forEach((row) => {
    if (row.bookingDate < minDate || row.bookingDate > maxDate) {
      throw new Error('预约日期超出可选范围（最早明天，最晚30天内）');
    }
    if (!row.cityName) {
      throw new Error('无法识别城市，请重新选择地点');
    }
  });

  const seenPayloadDates = new Set<string>();
  const seenPayloadUsers = new Set<string>();
  activeRows.forEach((row) => {
    if (seenPayloadDates.has(row.bookingDate)) {
      throw new Error('预约提交失败：同一批请求中存在重复预约日期');
    }
    seenPayloadDates.add(row.bookingDate);

    if (seenPayloadUsers.has(row.userId)) {
      throw new Error('预约提交失败：同一用户在同一批请求中存在多个活跃预约');
    }
    seenPayloadUsers.add(row.userId);
  });

  const activeTypeIds = Array.from(new Set(activeRows.map((row) => row.typeId)));
  if (activeTypeIds.length > 0) {
    const typeIn = buildInClauseParams(activeTypeIds, 'active_type_id');
    const activeTypesResult = await executeSQL(
      `
        SELECT id
        FROM booking_types
        WHERE is_active = 1
          AND id IN (${typeIn.clause})
      `,
      typeIn.params
    );
    const activeTypeSet = new Set(activeTypesResult.rows.map((item) => Number(item.id)));
    const hasInvalidType = activeTypeIds.some((typeId) => !activeTypeSet.has(typeId));
    if (hasInvalidType) {
      throw new Error('预约类型不可用，请刷新页面后重试');
    }
  }

  const allowedCitiesResult = await executeSQL(
    `
      SELECT city_name
      FROM allowed_cities
      WHERE is_active = 1
    `
  );
  const allowedCityNames = Array.from(
    new Set(
      allowedCitiesResult.rows
        .map((item) => toTrimmedString(item.city_name))
        .filter(Boolean)
    )
  );

  if (allowedCityNames.length === 0) {
    throw new Error('当前暂无可预约城市，请联系管理员');
  }

  for (const row of activeRows) {
    const matched = allowedCityNames.some((allowedCityName) => isCityAllowed(row.cityName, allowedCityName));
    if (!matched) {
      throw new Error(`抱歉，当前仅支持以下城市的预约：${allowedCityNames.join('、')}`);
    }
  }

  const activeBookingDates = Array.from(new Set(activeRows.map((row) => row.bookingDate)));
  if (activeBookingDates.length > 0) {
    const dateIn = buildInClauseParams(activeBookingDates, 'active_booking_date');
    const blackoutResult = await executeSQL(
      `
        SELECT date
        FROM booking_blackouts
        WHERE date IN (${dateIn.clause})
        LIMIT 1
      `,
      dateIn.params
    );
    if (blackoutResult.rows.length > 0) {
      throw new Error('抱歉，该日期不可预约（可能已被锁定或已有预约），请选择其他日期');
    }

    const bookingDateConflict = await executeSQL(
      `
        SELECT id
        FROM bookings
        WHERE booking_date IN (${dateIn.clause})
          AND status IN ('pending', 'confirmed', 'in_progress')
        LIMIT 1
      `,
      dateIn.params
    );
    if (bookingDateConflict.rows.length > 0) {
      throw new Error('抱歉，该日期已被预约，请选择其他日期');
    }
  }

  const activeUserIds = Array.from(new Set(activeRows.map((row) => row.userId)));
  if (activeUserIds.length > 0) {
    const userIn = buildInClauseParams(activeUserIds, 'active_user_id');
    const activeUserConflict = await executeSQL(
      `
        SELECT id
        FROM bookings
        WHERE user_id IN (${userIn.clause})
          AND status IN ('pending', 'confirmed', 'in_progress')
        LIMIT 1
      `,
      userIn.params
    );
    if (activeUserConflict.rows.length > 0) {
      throw new Error('您已有进行中的预约，请先取消或等待完成');
    }
  }
}

async function hydrateStorageUrls(table: string, rows: Array<Record<string, any>>): Promise<void> {
  const fields = storageUrlColumnsByTable[table] ?? [];
  if (fields.length === 0) {
    return;
  }

  // best-effort：即使 CloudBase 临时 URL 生成失败也不应影响主查询。
  try {
    await hydrateCloudBaseTempUrlsInRows(rows, fields);
  } catch {
    // ignore
  }
}

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
  await hydrateStorageUrls(payload.table, rows);

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

function shouldAutoFillRandKey(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
}

function toPoseTagList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item ?? ''))
      .filter((item) => item !== '');
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item ?? ''))
          .filter((item) => item !== '');
      }
    } catch {
      return [];
    }
  }

  return [];
}

function preparePoseRowsForInsert(rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return rows.map((row) => {
    const nextRow = { ...row };
    if (shouldAutoFillRandKey(nextRow.rand_key)) {
      nextRow.rand_key = Math.random();
      return nextRow;
    }

    const numericRandKey = Number(nextRow.rand_key);
    nextRow.rand_key = Number.isFinite(numericRandKey) ? numericRandKey : Math.random();
    return nextRow;
  });
}

async function rebuildPoseTagUsageCounts(): Promise<void> {
  await executeSQL(`
    UPDATE pose_tags t
    SET usage_count = (
      SELECT COUNT(*)
      FROM poses p
      WHERE p.tags IS NOT NULL
        AND JSON_SEARCH(p.tags, 'one', t.name) IS NOT NULL
    )
  `);
}

async function fetchPoseTagNamesByWhereClause(whereClause: string, params: Record<string, unknown>): Promise<string[]> {
  if (!whereClause) {
    return [];
  }

  const result = await executeSQL(
    `
      SELECT name
      FROM pose_tags
      ${whereClause}
    `,
    params
  );

  return Array.from(
    new Set(
      result.rows
        .map((row) => String(row.name ?? ''))
        .filter((name) => name !== '')
    )
  );
}

async function fetchPosesContainingTag(tagName: string): Promise<Array<{ id: number; tags: string[] }>> {
  const result = await executeSQL(
    `
      SELECT id, tags
      FROM poses
      WHERE tags IS NOT NULL
        AND JSON_SEARCH(tags, 'one', {{tag_name}}) IS NOT NULL
    `,
    { tag_name: tagName }
  );

  return result.rows
    .map((row) => {
      const id = Number(row.id);
      if (!Number.isFinite(id)) {
        return null;
      }
      return {
        id,
        tags: toPoseTagList(row.tags),
      };
    })
    .filter((row): row is { id: number; tags: string[] } => row !== null);
}

async function writePoseTagsById(id: number, tags: string[]): Promise<void> {
  await executeSQL(
    `
      UPDATE poses
      SET tags = CAST({{tags_json}} AS JSON)
      WHERE id = {{pose_id}}
    `,
    {
      tags_json: JSON.stringify(tags),
      pose_id: id,
    }
  );
}

async function replacePoseTagNameInPoses(oldName: string, newName: string): Promise<void> {
  if (!oldName || oldName === newName) {
    return;
  }

  const poses = await fetchPosesContainingTag(oldName);
  for (const pose of poses) {
    const nextTags = pose.tags.map((tag) => (tag === oldName ? newName : tag));
    if (JSON.stringify(nextTags) === JSON.stringify(pose.tags)) {
      continue;
    }
    await writePoseTagsById(pose.id, nextTags);
  }
}

async function removePoseTagFromPoses(tagName: string): Promise<void> {
  if (!tagName) {
    return;
  }

  const poses = await fetchPosesContainingTag(tagName);
  for (const pose of poses) {
    const nextTags = pose.tags.filter((tag) => tag !== tagName);
    if (JSON.stringify(nextTags) === JSON.stringify(pose.tags)) {
      continue;
    }
    await writePoseTagsById(pose.id, nextTags);
  }
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

function shouldApplyAutoTimestampValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim() === '';
  }
  return false;
}

function attachDefaultAuditTimestamps(payload: DbQueryPayload, rows: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const metadata = getTableMetadata(payload.table);
  const hasCreatedAtColumn = metadata.columns.includes('created_at');
  const hasUpdatedAtColumn = metadata.columns.includes('updated_at');

  if (!hasCreatedAtColumn && !hasUpdatedAtColumn) {
    return rows;
  }

  const nowUtc8 = formatDateTimeUTC8(new Date());

  return rows.map((row) => {
    const next = { ...row };

    if (hasCreatedAtColumn && shouldApplyAutoTimestampValue(next.created_at)) {
      next.created_at = nowUtc8;
    }

    if (hasUpdatedAtColumn && shouldApplyAutoTimestampValue(next.updated_at)) {
      next.updated_at = nowUtc8;
    }

    return next;
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

async function fetchMatchedPrimaryKeysForUpdate(
  payload: DbQueryPayload,
  whereClause: string,
  whereValues: Record<string, unknown>
): Promise<unknown[] | null> {
  const metadata = getTableMetadata(payload.table);
  if (!metadata.primaryKey) {
    return null;
  }

  const primaryKeyExpr = escapeIdentifier(metadata.primaryKey);
  const sql = `
    SELECT ${primaryKeyExpr} AS pk
    FROM ${escapeIdentifier(payload.table)}
    ${whereClause}
  `;

  const result = await executeSQL(sql, whereValues);
  const keys = Array.from(
    new Set(
      result.rows
        .map((row) => row.pk)
        .filter((value) => value !== null && value !== undefined)
    )
  );

  return keys;
}

async function fetchRowsByPrimaryKeys(payload: DbQueryPayload, primaryKeys: unknown[]): Promise<any[]> {
  const metadata = getTableMetadata(payload.table);
  if (!metadata.primaryKey || primaryKeys.length === 0) {
    return [];
  }

  const columnsExpr = parseSelectedColumns(payload.table, payload.columns);
  const primaryKeyExpr = escapeIdentifier(metadata.primaryKey);
  const builder = new SqlValueBuilder();
  const placeholders = primaryKeys.map((value) => builder.add(value));

  const sql = `
    SELECT ${columnsExpr}
    FROM ${escapeIdentifier(payload.table)}
    WHERE ${primaryKeyExpr} IN (${placeholders.join(', ')})
  `;

  const result = await executeSQL(sql, builder.build());
  return result.rows;
}

async function runInsert(payload: DbQueryPayload): Promise<DbExecuteResult> {
  let rows = attachDefaultAuditTimestamps(
    payload,
    attachGeneratedPrimaryKey(payload, normalizeWriteRows(payload))
  );
  if (payload.table === 'poses') {
    rows = preparePoseRowsForInsert(rows);
  }
  if (rows.length === 0) {
    return {
      data: null,
      error: { message: '插入数据不能为空' },
      count: null,
    };
  }

  if (payload.table === 'bookings') {
    await validateBookingsBeforeInsert(rows);
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
  if (payload.table === 'poses' || payload.table === 'pose_tags') {
    await rebuildPoseTagUsageCounts();
  }

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
  await hydrateStorageUrls(payload.table, selectedRows);
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

  const whereBuilder = new SqlValueBuilder();
  const whereClause = buildWhereClause(payload.table, payload.filters, whereBuilder);
  if (!whereClause) {
    return {
      data: null,
      error: { message: '更新操作必须包含过滤条件' },
      count: null,
    };
  }

  const shouldSyncPoseTagRename =
    payload.table === 'pose_tags' &&
    Object.prototype.hasOwnProperty.call(payload.values, 'name');
  const poseTagNamesBeforeUpdate = shouldSyncPoseTagRename
    ? await fetchPoseTagNamesByWhereClause(whereClause, whereBuilder.build())
    : [];

  const matchedPrimaryKeys = payload.selectAfterWrite
    ? await fetchMatchedPrimaryKeysForUpdate(payload, whereClause, whereBuilder.build())
    : null;

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

  const updateWhereClause = buildWhereClause(payload.table, payload.filters, builder);

  const sql = `
    UPDATE ${escapeIdentifier(payload.table)}
    SET ${setClauses.join(', ')}
    ${updateWhereClause}
  `;
  const updateResult = await executeSQL(sql, builder.build());

  if (updateResult.affectedRows > 0) {
    if (shouldSyncPoseTagRename) {
      const nextName = String(payload.values.name ?? '');
      for (const oldName of poseTagNamesBeforeUpdate) {
        await replacePoseTagNameInPoses(oldName, nextName);
      }
    }

    if (payload.table === 'poses' || payload.table === 'pose_tags') {
      await rebuildPoseTagUsageCounts();
    }
  }

  if (!payload.selectAfterWrite) {
    return {
      data: null,
      error: null,
      count: null,
    };
  }

  if (matchedPrimaryKeys !== null) {
    const selectedRows = normalizeRows(
      payload.table,
      await fetchRowsByPrimaryKeys(payload, matchedPrimaryKeys)
    );
    await hydrateStorageUrls(payload.table, selectedRows);
    const finalized = finalizeSingleResult(payload, selectedRows);
    return {
      data: finalized.data,
      error: finalized.error,
      count: finalized.count,
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

  const poseTagNamesBeforeDelete =
    payload.table === 'pose_tags'
      ? await fetchPoseTagNamesByWhereClause(whereClause, whereBuilder.build())
      : [];

  let rowsBeforeDelete: Array<Record<string, any>> = [];
  if (payload.selectAfterWrite) {
    const selectBuilder = new SqlValueBuilder();
    const selectWhereClause = buildWhereClause(payload.table, payload.filters, selectBuilder);
    const orderClause = buildOrderClause(payload.table, payload.orders);
    const limitClause = buildLimitClause(payload);
    const columnsExpr = parseSelectedColumns(payload.table, payload.columns);

    const selectSql = `
      SELECT ${columnsExpr}
      FROM ${escapeIdentifier(payload.table)}
      ${selectWhereClause}
      ${orderClause}
      ${limitClause}
    `;
    const selectResult = await executeSQL(selectSql, selectBuilder.build());
    rowsBeforeDelete = normalizeRows(payload.table, selectResult.rows);
    await hydrateStorageUrls(payload.table, rowsBeforeDelete);
  }

  const sql = `
    DELETE FROM ${escapeIdentifier(payload.table)}
    ${whereClause}
  `;

  const deleteResult = await executeSQL(sql, whereBuilder.build());

  if (deleteResult.affectedRows > 0) {
    if (payload.table === 'pose_tags') {
      for (const tagName of poseTagNamesBeforeDelete) {
        await removePoseTagFromPoses(tagName);
      }
    }

    if (payload.table === 'poses' || payload.table === 'pose_tags') {
      await rebuildPoseTagUsageCounts();
    }
  }

  if (payload.selectAfterWrite) {
    const finalized = finalizeSingleResult(payload, rowsBeforeDelete);
    return {
      data: finalized.data,
      error: finalized.error,
      count: finalized.count,
    };
  }

  return {
    data: null,
    error: null,
    count: deleteResult.affectedRows,
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
