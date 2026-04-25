import 'server-only';

import { Buffer } from 'buffer';
import { createHash, randomUUID } from 'crypto';
import { AuthContext } from '@/lib/auth/types';
import { deleteCloudBaseObjects, uploadFileToCloudBase } from '@/lib/cloudbase/storage';
import {
  WALL_PREVIEW_MAX_WIDTH,
  WALL_PREVIEW_QUALITY,
  WALL_THUMBNAIL_MAX_WIDTH,
  WALL_THUMBNAIL_QUALITY,
} from '@/lib/gallery/wall-image-config';
import { hydrateCloudBaseTempUrlsInRows } from '@/lib/cloudbase/storage-url';
import { normalizeAccessKey } from '@/lib/utils/access-key';
import {
  executeSQL,
  extractErrorMessage,
  isMissingDefinerSqlError,
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from './sql-executor';

interface RpcExecuteResult {
  data: any;
  error: { message: string; code?: string } | null;
}

const BETA_FEATURE_CODE_LENGTH = 8;

function normalizeRpcError(error: unknown, fallback: string): { message: string; code?: string } {
  if (isRetryableSqlError(error)) {
    return {
      message: TRANSIENT_BACKEND_ERROR_MESSAGE,
      code: TRANSIENT_BACKEND_ERROR_CODE,
    };
  }

  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown; errno?: unknown }).code;
    const maybeErrno = (error as Error & { code?: unknown; errno?: unknown }).errno;
    const message = error.message || fallback;

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

function isDuplicateEntryError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (error instanceof Error) {
    const maybeCode = (error as Error & { code?: unknown; errno?: unknown }).code;
    const maybeErrno = (error as Error & { code?: unknown; errno?: unknown }).errno;
    if (maybeCode === 'ER_DUP_ENTRY' || maybeCode === '1062' || maybeErrno === 1062) {
      return true;
    }
    return /duplicate entry/i.test(String(error.message || ''));
  }

  if (typeof error === 'object') {
    const maybeCode = (error as { code?: unknown }).code;
    const maybeErrno = (error as { errno?: unknown }).errno;
    const maybeMessage = (error as { message?: unknown }).message;
    if (maybeCode === 'ER_DUP_ENTRY' || maybeCode === '1062' || maybeErrno === 1062) {
      return true;
    }
    return /duplicate entry/i.test(String(maybeMessage || ''));
  }

  return /duplicate entry/i.test(String(error));
}

function toNumber(value: any, defaultValue: number = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : defaultValue;
}

function toBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  return Number(value) > 0;
}

function normalizeTags(value: any): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      // ignore
    }
  }
  return [];
}

function resolveBooleanArg(value: unknown, defaultValue: boolean): boolean {
  if (value === undefined || value === null) {
    return defaultValue;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  const normalized = String(value).trim().toLowerCase();
  if (normalized === '') {
    return defaultValue;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return defaultValue;
}

function normalizeMaybeUrlText(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const lowered = raw.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') {
    return null;
  }
  return raw;
}

function normalizeMaybeStoryText(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const lowered = raw.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'none' || lowered === 'nil') {
    return null;
  }
  return raw;
}

function normalizeMaybeShotDate(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) {
    return null;
  }

  const shotDate = `${matched[1]}-${matched[2]}-${matched[3]}`;
  const parsed = new Date(`${shotDate}T00:00:00+08:00`);
  if (!Number.isFinite(parsed.getTime())) {
    return null;
  }

  return shotDate;
}

function normalizeMaybeShotLocation(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const raw = String(value).trim();
  if (!raw) {
    return null;
  }

  const lowered = raw.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') {
    return null;
  }

  return raw.slice(0, 255);
}

function normalizeBetaFeatureCode(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, BETA_FEATURE_CODE_LENGTH);
}

function normalizeBetaRoutePath(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return '';
  }
  if (raw.startsWith('/')) {
    return raw;
  }
  return `/${raw}`;
}

function normalizeMaybeBetaDescription(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  return raw ? raw : null;
}

function getTodayDateUTC8(): string {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getDateTextUTC8(daysAgo: number = 0): string {
  const safeDaysAgo = Math.max(0, Math.floor(Number(daysAgo) || 0));
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000 - safeDaysAgo * 24 * 60 * 60 * 1000);
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function resolveAlbumFolderFilter(folderIdInput: unknown): {
  clause: string;
  params: Record<string, unknown>;
  normalizedFolderId: string | null;
} {
  const rawFolderId = String(folderIdInput ?? '').trim();
  const normalizedLower = rawFolderId.toLowerCase();
  const isRootFolder = !rawFolderId || rawFolderId === '__ROOT__' || normalizedLower === 'root';

  if (isRootFolder) {
    return {
      clause: `(p.folder_id <=> NULL OR p.folder_id = '')`,
      params: {},
      normalizedFolderId: null,
    };
  }

  return {
    clause: `p.folder_id = {{folder_id}}`,
    params: { folder_id: rawFolderId },
    normalizedFolderId: rawFolderId,
  };
}

function mapAlbumPhotoRow(
  row: Record<string, any>,
  commentsByPhotoId?: Map<string, Array<Record<string, any>>>
): Record<string, any> {
  const photoId = String(row.id);
  const storyText = normalizeMaybeStoryText(row.story_text);
  const legacyUrl = normalizeMaybeUrlText(
    row.url ?? row.original_url ?? row.preview_url ?? row.thumbnail_url
  );
  return {
    id: photoId,
    folder_id: row.folder_id ? String(row.folder_id) : null,
    url: legacyUrl,
    thumbnail_url: row.thumbnail_url ?? null,
    preview_url: row.preview_url ?? null,
    original_url: row.original_url ?? null,
    story_text: storyText,
    has_story: Boolean(storyText),
    is_highlight: toBoolean(row.is_highlight),
    sort_order: toNumber(row.sort_order, 2147483647),
    shot_date: normalizeMaybeShotDate(row.shot_date),
    shot_location: normalizeMaybeShotLocation(row.shot_location),
    width: toNumber(row.width, 0),
    height: toNumber(row.height, 0),
    blurhash: row.blurhash ?? null,
    is_public: toBoolean(row.is_public),
    like_count: toNumber(row.like_count, 0),
    view_count: toNumber(row.view_count, 0),
    download_count: toNumber(row.download_count, 0),
    rating: toNumber(row.rating, 0),
    created_at: row.created_at ?? null,
    comments: commentsByPhotoId ? commentsByPhotoId.get(photoId) ?? [] : [],
  };
}

function requireUser(context: AuthContext): string {
  const userId = context.user?.id;
  if (!userId) {
    throw new Error('请先登录');
  }
  return userId;
}

function requireAdmin(context: AuthContext): void {
  if (!(context.role === 'admin' || context.role === 'system')) {
    throw new Error('无权访问：仅管理员可执行该操作');
  }
}

// 统一按 UTC+8（Asia/Shanghai）计算“当前时间/当天日期”，避免依赖 DB 会话时区
const NOW_UTC8_EXPR = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)';
const TODAY_UTC8_EXPR = 'DATE(DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR))';
const SYSTEM_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';
const SYSTEM_WALL_ALBUM_ACCESS_KEY = 'WALL0000';
const SYSTEM_WALL_FREEZE_FOLDER_NAME = '定格';
const SYSTEM_WALL_FREEZE_FOLDER_ID = '00000000-0000-0000-0000-000000000001';
const SHOT_DATE_COLUMN_CACHE_TTL_MS = 60 * 1000;

let albumPhotoShotDateColumnCache: {
  value: boolean;
  expiresAt: number;
} | null = null;

let albumPhotoShotLocationColumnCache: {
  value: boolean;
  expiresAt: number;
} | null = null;

let albumPhotoDownloadCountColumnCache: {
  value: boolean;
  expiresAt: number;
} | null = null;

let albumEnableFreezeColumnCache: {
  value: boolean;
  expiresAt: number;
} | null = null;

let albumWelcomeLetterModeColumnCache: {
  value: boolean;
  expiresAt: number;
} | null = null;

let albumFolderHiddenColumnCache: {
  value: boolean;
  expiresAt: number;
} | null = null;

const tableExistenceCache = new Map<string, {
  value: boolean;
  expiresAt: number;
}>();

async function hasTable(tableName: string): Promise<boolean> {
  const now = Date.now();
  const cacheKey = `table:${tableName}`;
  const cached = tableExistenceCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = {{table_name}}
        LIMIT 1
      `,
      {
        table_name: tableName,
      }
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  tableExistenceCache.set(cacheKey, {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  });
  return exists;
}

let sharpModulePromise: Promise<any> | null = null;
const PHOTO_DIMENSION_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PHOTO_DIMENSION_PROBE_CONCURRENCY = 6;
const PHOTO_DIMENSION_EAGER_LIMIT = 48;
const photoDimensionCache = new Map<string, { width: number; height: number; expiresAt: number }>();

async function hasAlbumPhotoShotDateColumn(): Promise<boolean> {
  const now = Date.now();
  if (albumPhotoShotDateColumnCache && albumPhotoShotDateColumnCache.expiresAt > now) {
    return albumPhotoShotDateColumnCache.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'album_photos'
          AND column_name = 'shot_date'
        LIMIT 1
      `
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  albumPhotoShotDateColumnCache = {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  };
  return exists;
}

async function hasAlbumPhotoShotLocationColumn(): Promise<boolean> {
  const now = Date.now();
  if (albumPhotoShotLocationColumnCache && albumPhotoShotLocationColumnCache.expiresAt > now) {
    return albumPhotoShotLocationColumnCache.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'album_photos'
          AND column_name = 'shot_location'
        LIMIT 1
      `
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  albumPhotoShotLocationColumnCache = {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  };
  return exists;
}

async function hasAlbumPhotoDownloadCountColumn(): Promise<boolean> {
  const now = Date.now();
  if (albumPhotoDownloadCountColumnCache && albumPhotoDownloadCountColumnCache.expiresAt > now) {
    return albumPhotoDownloadCountColumnCache.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'album_photos'
          AND column_name = 'download_count'
        LIMIT 1
      `
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  albumPhotoDownloadCountColumnCache = {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  };
  return exists;
}

async function hasAlbumFolderHiddenColumn(): Promise<boolean> {
  const now = Date.now();
  if (albumFolderHiddenColumnCache && albumFolderHiddenColumnCache.expiresAt > now) {
    return albumFolderHiddenColumnCache.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'album_folders'
          AND column_name = 'is_hidden'
        LIMIT 1
      `
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  albumFolderHiddenColumnCache = {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  };
  return exists;
}

async function hasAlbumEnableFreezeColumn(): Promise<boolean> {
  const now = Date.now();
  if (albumEnableFreezeColumnCache && albumEnableFreezeColumnCache.expiresAt > now) {
    return albumEnableFreezeColumnCache.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'albums'
          AND column_name = 'enable_freeze'
        LIMIT 1
      `
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  albumEnableFreezeColumnCache = {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  };
  return exists;
}

function normalizeWelcomeLetterMode(value: unknown, enabledFallback = true): 'envelope' | 'stamp' | 'none' {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'envelope' || normalized === 'stamp' || normalized === 'none') {
    return normalized;
  }
  return enabledFallback ? 'envelope' : 'none';
}

async function hasAlbumWelcomeLetterModeColumn(): Promise<boolean> {
  const now = Date.now();
  if (albumWelcomeLetterModeColumnCache && albumWelcomeLetterModeColumnCache.expiresAt > now) {
    return albumWelcomeLetterModeColumnCache.value;
  }

  let exists = false;
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS value
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = 'albums'
          AND column_name = 'welcome_letter_mode'
        LIMIT 1
      `
    );
    exists = toNumber(result.rows[0]?.value, 0) > 0;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    exists = false;
  }

  albumWelcomeLetterModeColumnCache = {
    value: exists,
    expiresAt: now + SHOT_DATE_COLUMN_CACHE_TTL_MS,
  };
  return exists;
}

function getSafeWallSourceToken(photoId: string): string {
  const safe = String(photoId ?? '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '');
  return safe || randomUUID().replace(/-/g, '').slice(0, 16);
}

type GalleryClientSource = 'web' | 'mini' | 'unknown';

function normalizeGalleryClientSource(value: unknown): GalleryClientSource {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'web' || raw === 'h5') {
    return 'web';
  }
  if (raw === 'mini' || raw === 'miniprogram' || raw === 'wechat' || raw === 'wechat-mini') {
    return 'mini';
  }
  return 'unknown';
}

async function findWallFolderByName(folderName: string): Promise<Record<string, any> | null> {
  const normalizedName = String(folderName ?? '').trim();
  if (!normalizedName) {
    return null;
  }

  const result = await executeSQL(
    `
      SELECT id, name, sort_order
      FROM album_folders
      WHERE album_id = {{wall_album_id}}
        AND name = {{folder_name}}
      ORDER BY sort_order ASC, created_at ASC
      LIMIT 1
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
      folder_name: normalizedName,
    }
  );

  return result.rows[0] ?? null;
}

async function ensureWallFolderByName(folderName: string): Promise<string> {
  const normalizedName = String(folderName ?? '').trim();
  if (!normalizedName) {
    throw new Error('缺少照片墙文件夹名称');
  }

  const existing = await findWallFolderByName(normalizedName);
  if (existing?.id) {
    return String(existing.id);
  }

  const folderId =
    normalizedName === SYSTEM_WALL_FREEZE_FOLDER_NAME
      ? SYSTEM_WALL_FREEZE_FOLDER_ID
      : randomUUID();

  try {
    await executeSQL(
      `
        INSERT INTO album_folders (
          id,
          album_id,
          name,
          created_at
        ) VALUES (
          {{id}},
          {{wall_album_id}},
          {{folder_name}},
          ${NOW_UTC8_EXPR}
        )
      `,
      {
        id: folderId,
        wall_album_id: SYSTEM_WALL_ALBUM_ID,
        folder_name: normalizedName,
      }
    );

    return folderId;
  } catch (error) {
    if (!isDuplicateEntryError(error)) {
      throw error;
    }

    const duplicated = await findWallFolderByName(normalizedName);
    if (duplicated?.id) {
      return String(duplicated.id);
    }

    return folderId;
  }
}

function buildWallStorageKey(sourcePhotoId: string, kind: 'thumb' | 'preview'): string {
  const token = getSafeWallSourceToken(sourcePhotoId);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  return `wall/${token}_${Date.now()}_${suffix}_${kind}.webp`;
}

function buildDeterministicWallPhotoId(sourcePhotoId: string): string {
  const normalizedId = String(sourcePhotoId ?? '').trim();
  const digest = createHash('md5').update(`wall:${normalizedId}`).digest('hex');
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
}

function extractWallSourceTokenFromUrl(value: unknown): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }

  const marker = '/wall/';
  const markerIndex = raw.toLowerCase().lastIndexOf(marker);
  if (markerIndex < 0) {
    return null;
  }

  const tail = raw.slice(markerIndex + marker.length);
  const underscoreIndex = tail.indexOf('_');
  if (underscoreIndex <= 0) {
    return null;
  }

  const token = tail.slice(0, underscoreIndex).trim();
  return token || null;
}

function resolveWallPhotoSourceToken(row: Record<string, any>): string | null {
  return extractWallSourceTokenFromUrl(
    row.original_url ?? row.preview_url ?? row.thumbnail_url ?? row.url
  );
}

function splitWallPhotoDuplicates<T extends Record<string, any>>(rows: T[]) {
  const uniqueRows: T[] = [];
  const duplicateRows: T[] = [];
  const seenTokens = new Set<string>();

  rows.forEach((row) => {
    const token = resolveWallPhotoSourceToken(row);
    if (!token) {
      uniqueRows.push(row);
      return;
    }

    if (seenTokens.has(token)) {
      duplicateRows.push(row);
      return;
    }

    seenTokens.add(token);
    uniqueRows.push(row);
  });

  return {
    uniqueRows,
    duplicateRows,
  };
}

async function deleteWallPhotoRows(
  rows: Array<Record<string, any>>,
  options?: {
    strictStorageCleanup?: boolean;
  }
) {
  const strictStorageCleanup = Boolean(options?.strictStorageCleanup);
  const targets = Array.from(
    new Set(
      rows
        .flatMap((row) => [
          String(row.url ?? '').trim(),
          String(row.thumbnail_url ?? '').trim(),
          String(row.preview_url ?? '').trim(),
          String(row.original_url ?? '').trim(),
        ])
        .filter(Boolean)
    )
  );

  if (targets.length > 0) {
    try {
      await deleteCloudBaseObjects(targets);
    } catch (error) {
      if (strictStorageCleanup) {
        const message = error instanceof Error ? error.message : 'unknown error';
        throw new Error(`删除照片墙对象存储失败：${message}`);
      }
      console.warn('delete wall photo assets failed:', error);
    }
  }

  for (const row of rows) {
    const wallPhotoId = String(row.id ?? '').trim();
    if (!wallPhotoId) {
      continue;
    }

    await executeSQL(
      `
        DELETE FROM album_photos
        WHERE id = {{id}}
        LIMIT 1
      `,
      {
        id: wallPhotoId,
      }
    );
  }
}

async function getSharp() {
  if (!sharpModulePromise) {
    sharpModulePromise = import('sharp').then((mod: any) => mod.default || mod);
  }
  return sharpModulePromise;
}

async function downloadImageBuffer(url: string): Promise<Buffer> {
  const target = String(url ?? '').trim();
  if (!target) {
    throw new Error('缺少源图片地址');
  }

  const response = await fetch(target);
  if (!response.ok) {
    throw new Error(`下载源图失败（${response.status}）`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function resolvePhotoDimensionProbeUrl(row: Record<string, any>): string {
  const candidates = [
    row.thumbnail_url,
    row.preview_url,
    row.original_url,
    row.url,
  ];

  for (let index = 0; index < candidates.length; index += 1) {
    const value = normalizeMaybeUrlText(candidates[index]);
    if (value) {
      return value;
    }
  }

  return '';
}

function buildPhotoDimensionCacheKeys(row: Record<string, any>): string[] {
  const keys: string[] = [];
  const photoId = String(row.id ?? '').trim();
  if (photoId) {
    keys.push(`photo:${photoId}`);
  }

  const probeUrl = resolvePhotoDimensionProbeUrl(row);
  if (probeUrl) {
    keys.push(`url:${createHash('sha1').update(probeUrl).digest('hex')}`);
  }

  return keys;
}

function readCachedPhotoDimensions(row: Record<string, any>): { width: number; height: number } | null {
  const now = Date.now();
  const cacheKeys = buildPhotoDimensionCacheKeys(row);

  for (let index = 0; index < cacheKeys.length; index += 1) {
    const cacheKey = cacheKeys[index];
    const cached = photoDimensionCache.get(cacheKey);
    if (!cached) {
      continue;
    }
    if (cached.expiresAt <= now) {
      photoDimensionCache.delete(cacheKey);
      continue;
    }
    return {
      width: cached.width,
      height: cached.height,
    };
  }

  return null;
}

function writeCachedPhotoDimensions(row: Record<string, any>, dimensions: { width: number; height: number }) {
  const width = toNumber(dimensions.width, 0);
  const height = toNumber(dimensions.height, 0);
  if (!(width > 0 && height > 0)) {
    return;
  }

  const expiresAt = Date.now() + PHOTO_DIMENSION_CACHE_TTL_MS;
  buildPhotoDimensionCacheKeys(row).forEach((cacheKey) => {
    photoDimensionCache.set(cacheKey, { width, height, expiresAt });
  });
}

function resolveOrientedImageDimensions(width: number, height: number, orientation: number): { width: number; height: number } {
  if (orientation >= 5 && orientation <= 8) {
    return {
      width: height,
      height: width,
    };
  }

  return { width, height };
}

async function probePhotoDimensionsFromUrl(url: string): Promise<{ width: number; height: number } | null> {
  const target = String(url || '').trim();
  if (!target) {
    return null;
  }

  const buffer = await downloadImageBuffer(target);
  const sharp = await getSharp();
  const metadata = await sharp(buffer).metadata();
  const safeWidth = toNumber(metadata.width, 0);
  const safeHeight = toNumber(metadata.height, 0);
  if (!(safeWidth > 0 && safeHeight > 0)) {
    return null;
  }

  const oriented = resolveOrientedImageDimensions(
    safeWidth,
    safeHeight,
    toNumber((metadata as { orientation?: unknown }).orientation, 1)
  );
  if (!(oriented.width > 0 && oriented.height > 0)) {
    return null;
  }

  return oriented;
}

async function persistAlbumPhotoDimensions(photoId: string, dimensions: { width: number; height: number }) {
  const normalizedPhotoId = String(photoId || '').trim();
  const width = toNumber(dimensions.width, 0);
  const height = toNumber(dimensions.height, 0);
  if (!normalizedPhotoId || !(width > 0 && height > 0)) {
    return;
  }

  try {
    await executeSQL(
      `
        UPDATE album_photos
        SET width = {{width}},
            height = {{height}}
        WHERE id = {{photo_id}}
          AND (COALESCE(width, 0) <= 0 OR COALESCE(height, 0) <= 0)
      `,
      {
        photo_id: normalizedPhotoId,
        width,
        height,
      }
    );
  } catch {
    // ignore dimension backfill persistence failures
  }
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
) {
  const queue = Array.isArray(items) ? items : [];
  if (queue.length <= 0) {
    return;
  }

  const safeConcurrency = Math.max(1, Math.min(queue.length, Math.floor(Number(concurrency) || 1)));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: safeConcurrency }, async () => {
      while (cursor < queue.length) {
        const currentIndex = cursor;
        cursor += 1;
        try {
          await worker(queue[currentIndex]);
        } catch {
          // ignore single-row probe failures
        }
      }
    })
  );
}

async function ensurePhotoRowsHaveDimensions(
  rows: Record<string, any>[],
  options?: { maxProbeCount?: number }
) {
  const photoRows = Array.isArray(rows) ? rows : [];
  if (photoRows.length <= 0) {
    return;
  }

  const missingRows = photoRows.filter((row) => {
    const width = toNumber(row?.width, 0);
    const height = toNumber(row?.height, 0);
    return !(width > 0 && height > 0);
  });
  if (missingRows.length <= 0) {
    return;
  }

  const rawMaxProbeCount = Number(options?.maxProbeCount);
  const maxProbeCount = Number.isFinite(rawMaxProbeCount) && rawMaxProbeCount > 0
    ? Math.floor(rawMaxProbeCount)
    : missingRows.length;
  const targetRows = missingRows.slice(0, maxProbeCount);
  if (targetRows.length <= 0) {
    return;
  }

  await runWithConcurrency(targetRows, PHOTO_DIMENSION_PROBE_CONCURRENCY, async (row) => {
    const cached = readCachedPhotoDimensions(row);
    if (cached) {
      row.width = cached.width;
      row.height = cached.height;
      return;
    }

    const probeUrl = resolvePhotoDimensionProbeUrl(row);
    if (!probeUrl) {
      return;
    }

    const dimensions = await probePhotoDimensionsFromUrl(probeUrl);
    if (!dimensions) {
      return;
    }

    row.width = dimensions.width;
    row.height = dimensions.height;
    writeCachedPhotoDimensions(row, dimensions);

    const photoId = String(row.id ?? '').trim();
    if (photoId) {
      await persistAlbumPhotoDimensions(photoId, dimensions);
    }
  });
}

async function buildWallImageVariantsFromSource(sourceUrl: string): Promise<{
  thumbnailBuffer: Buffer;
  previewBuffer: Buffer;
  width: number;
  height: number;
}> {
  const sourceBuffer = await downloadImageBuffer(sourceUrl);
  const sharp = await getSharp();

  const thumbnailBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: WALL_THUMBNAIL_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WALL_THUMBNAIL_QUALITY })
    .toBuffer();
  const previewBuffer = await sharp(sourceBuffer)
    .rotate()
    .resize({ width: WALL_PREVIEW_MAX_WIDTH, withoutEnlargement: true })
    .webp({ quality: WALL_PREVIEW_QUALITY })
    .toBuffer();

  const thumbnailMeta = await sharp(thumbnailBuffer).metadata();
  return {
    thumbnailBuffer,
    previewBuffer,
    width: toNumber(thumbnailMeta.width, 0),
    height: toNumber(thumbnailMeta.height, 0),
  };
}

function resolveSourcePhotoBestUrl(source: Record<string, any>): string {
  const candidates = [
    source.original_url,
    source.preview_url,
    source.thumbnail_url,
  ];
  for (let i = 0; i < candidates.length; i += 1) {
    const value = String(candidates[i] ?? '').trim();
    if (value) {
      return value;
    }
  }
  return '';
}

async function rpcGetPublicGallery(args: Record<string, unknown>, context: AuthContext) {
  const pageNo = Math.max(1, Number(args.page_no ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(args.page_size ?? 20)));
  const offset = (pageNo - 1) * pageSize;
  const clientSource = String(args.client_source ?? '').trim();
  if (clientSource === '__mini__') {
    throw new Error('微信小程序暂不支持定格照片，请在 Web 端操作');
  }
  const hasShotDateColumn = await hasAlbumPhotoShotDateColumn();
  const hasShotLocationColumn = await hasAlbumPhotoShotLocationColumn();
  const hasDownloadCountColumn = await hasAlbumPhotoDownloadCountColumn();
  const hasFolderHiddenColumn = await hasAlbumFolderHiddenColumn();
  const shotDateSelect = hasShotDateColumn ? 'p.shot_date AS shot_date' : 'NULL AS shot_date';
  const shotLocationSelect = hasShotLocationColumn
    ? 'p.shot_location AS shot_location'
    : 'NULL AS shot_location';
  const downloadCountSelect = hasDownloadCountColumn
    ? 'p.download_count AS download_count'
    : '0 AS download_count';
  const folderHiddenSelect = hasFolderHiddenColumn ? 'is_hidden' : '0 AS is_hidden';
  const photoOrderBy = hasShotDateColumn
    ? 'COALESCE(p.sort_order, 2147483647) ASC, COALESCE(p.shot_date, DATE(p.created_at)) DESC, p.created_at DESC'
    : 'COALESCE(p.sort_order, 2147483647) ASC, p.created_at DESC';

  const wallMetaResult = await executeSQL(
    `
      SELECT root_folder_name
      FROM albums
      WHERE id = {{wall_album_id}}
      LIMIT 1
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
    }
  );
  const wallMetaRow = wallMetaResult.rows[0];

  const foldersResult = await executeSQL(
    `
      SELECT id, name, sort_order, ${folderHiddenSelect}
      FROM album_folders
      WHERE album_id = {{wall_album_id}}
      ORDER BY sort_order ASC, created_at ASC
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
    }
  );
  const folderRows = Array.isArray(foldersResult.rows) ? foldersResult.rows : [];
  const hiddenFolderIds = new Set(
    folderRows
      .filter((row) => toBoolean(row?.is_hidden))
      .map((row) => String(row?.id ?? '').trim())
      .filter(Boolean)
  );
  const requestedFolderFilter = resolveAlbumFolderFilter(args.folder_id);
  const folderFilter =
    requestedFolderFilter.normalizedFolderId && hiddenFolderIds.has(requestedFolderFilter.normalizedFolderId)
      ? resolveAlbumFolderFilter(null)
      : requestedFolderFilter;
  const wallValues: Record<string, unknown> = {
    wall_album_id: SYSTEM_WALL_ALBUM_ID,
    ...folderFilter.params,
  };

  const fetchWallPhotosPage = async (): Promise<Record<string, any>[]> => {
    if (context.user?.id) {
      const result = await executeSQL(
        `
          SELECT
            p.id,
            COALESCE(p.url, p.original_url, p.preview_url, p.thumbnail_url) AS url,
            COALESCE(p.thumbnail_url, p.preview_url, p.original_url, p.url) AS thumbnail_url,
            COALESCE(p.preview_url, p.original_url, p.thumbnail_url, p.url) AS preview_url,
            COALESCE(p.original_url, p.preview_url, p.thumbnail_url, p.url) AS original_url,
            p.width,
            p.height,
            p.blurhash,
            p.like_count,
            p.view_count,
            ${downloadCountSelect},
            p.story_text,
            p.is_highlight,
            p.sort_order,
            ${shotDateSelect},
            ${shotLocationSelect},
            p.created_at,
            p.folder_id,
            CASE WHEN pl.id <=> NULL THEN 0 ELSE 1 END AS is_liked
          FROM album_photos p
          LEFT JOIN photo_likes pl
            ON pl.photo_id = p.id
           AND pl.user_id = {{user_id}}
          WHERE p.album_id = {{wall_album_id}}
            AND ${folderFilter.clause}
          ORDER BY ${photoOrderBy}
          LIMIT {{limit}} OFFSET {{offset}}
        `,
        {
          user_id: context.user.id,
          ...wallValues,
          limit: pageSize,
          offset,
        }
      );
      return result.rows;
    }

    const result = await executeSQL(
      `
        SELECT
          p.id,
          COALESCE(p.url, p.original_url, p.preview_url, p.thumbnail_url) AS url,
          COALESCE(p.thumbnail_url, p.preview_url, p.original_url, p.url) AS thumbnail_url,
          COALESCE(p.preview_url, p.original_url, p.thumbnail_url, p.url) AS preview_url,
          COALESCE(p.original_url, p.preview_url, p.thumbnail_url, p.url) AS original_url,
          p.width,
          p.height,
          p.blurhash,
          p.like_count,
          p.view_count,
          ${downloadCountSelect},
          p.story_text,
          p.is_highlight,
          p.sort_order,
          ${shotDateSelect},
          ${shotLocationSelect},
          p.created_at,
          p.folder_id,
          0 AS is_liked
        FROM album_photos p
        WHERE p.album_id = {{wall_album_id}}
          AND ${folderFilter.clause}
        ORDER BY ${photoOrderBy}
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      {
        ...wallValues,
        limit: pageSize,
        offset,
      }
    );
    return result.rows;
  };

  let photos = await fetchWallPhotosPage();
  const { duplicateRows } = splitWallPhotoDuplicates(photos);
  if (duplicateRows.length > 0) {
    await deleteWallPhotoRows(duplicateRows);
    photos = await fetchWallPhotosPage();
  }

  const countResult = await executeSQL(
    `
      SELECT COUNT(*) AS total
      FROM album_photos p
      WHERE p.album_id = {{wall_album_id}}
        AND ${folderFilter.clause}
    `,
    wallValues
  );

  await hydrateCloudBaseTempUrlsInRows(photos, ['url', 'thumbnail_url', 'preview_url', 'original_url']);
  await ensurePhotoRowsHaveDimensions(photos);

  return {
    photos: photos.map((row) => ({
      ...row,
      url: normalizeMaybeUrlText(row.url ?? row.original_url ?? row.preview_url ?? row.thumbnail_url),
      story_text: normalizeMaybeStoryText(row.story_text),
      is_liked: toBoolean(row.is_liked),
      like_count: toNumber(row.like_count, 0),
      view_count: toNumber(row.view_count, 0),
      download_count: toNumber(row.download_count, 0),
      width: toNumber(row.width, 0),
      height: toNumber(row.height, 0),
      has_story: Boolean(normalizeMaybeStoryText(row.story_text)),
      is_highlight: toBoolean(row.is_highlight),
      sort_order: toNumber(row.sort_order, 2147483647),
      shot_date: normalizeMaybeShotDate(row.shot_date),
      shot_location: normalizeMaybeShotLocation(row.shot_location),
      folder_id: row.folder_id ? String(row.folder_id) : null,
    })),
    total: toNumber(countResult.rows[0]?.total, 0),
    folder_id: folderFilter.normalizedFolderId,
    root_folder_name:
      String(wallMetaRow?.root_folder_name ?? '').trim() || '根目录',
    folders: folderRows
      .filter((row) => !hiddenFolderIds.has(String(row?.id ?? '').trim()))
      .map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      sort_order: toNumber(row.sort_order, 2147483647),
    })),
  };
}

async function rpcGetAlbumContent(args: Record<string, unknown>) {
  const inputKey = normalizeAccessKey(args.input_key);
  if (!inputKey) {
    throw new Error('密钥错误');
  }
  const includePhotos = resolveBooleanArg(args.include_photos, true);
  const hasShotDateColumn = await hasAlbumPhotoShotDateColumn();
  const hasShotLocationColumn = await hasAlbumPhotoShotLocationColumn();
  const hasDownloadCountColumn = await hasAlbumPhotoDownloadCountColumn();
  const hasAlbumFreezeColumn = await hasAlbumEnableFreezeColumn();
  const hasAlbumWelcomeLetterMode = await hasAlbumWelcomeLetterModeColumn();
  const shotDateSelect = hasShotDateColumn ? 'shot_date' : 'NULL AS shot_date';
  const shotLocationSelect = hasShotLocationColumn
    ? 'shot_location'
    : 'NULL AS shot_location';
  const enableFreezeSelect = hasAlbumFreezeColumn ? 'enable_freeze' : '1 AS enable_freeze';
  const welcomeLetterModeSelect = hasAlbumWelcomeLetterMode
    ? 'welcome_letter_mode'
    : "CASE WHEN COALESCE(enable_welcome_letter, 1) = 0 THEN 'none' ELSE 'envelope' END AS welcome_letter_mode";
  const downloadCountSelect = hasDownloadCountColumn
    ? 'download_count'
    : '0 AS download_count';
  const photoOrderBy = 'COALESCE(sort_order, 2147483647) ASC, created_at DESC';

  const albumResult = await executeSQL(
    `
      SELECT
        id,
        title,
        root_folder_name,
        welcome_letter,
        cover_url,
        enable_tipping,
        enable_welcome_letter,
        ${welcomeLetterModeSelect},
        ${enableFreezeSelect},
        donation_qr_code_url,
        recipient_name,
        created_at,
        COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) AS effective_expires_at,
        CASE
          WHEN COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired
      FROM albums
      WHERE access_key = {{access_key}}
      LIMIT 1
    `,
    {
      access_key: inputKey,
    }
  );

  const album = albumResult.rows[0];
  if (!album) {
    throw new Error('密钥错误');
  }

  await hydrateCloudBaseTempUrlsInRows([album], ['cover_url', 'donation_qr_code_url']);

  const foldersResult = await executeSQL(
    `
      SELECT id, name, sort_order
      FROM album_folders
      WHERE album_id = {{album_id}}
      ORDER BY sort_order ASC, created_at ASC
    `,
    {
      album_id: album.id,
    }
  );

  let photoRows: Record<string, any>[] = [];
  const commentsByPhotoId = new Map<string, Array<Record<string, any>>>();

  if (includePhotos) {
    const photosResult = await executeSQL(
      `
        SELECT
          id,
          folder_id,
          COALESCE(url, original_url, preview_url, thumbnail_url) AS url,
          COALESCE(thumbnail_url, preview_url, original_url, url) AS thumbnail_url,
          COALESCE(preview_url, original_url, thumbnail_url, url) AS preview_url,
          COALESCE(original_url, preview_url, thumbnail_url, url) AS original_url,
          story_text,
          is_highlight,
          sort_order,
          ${shotDateSelect},
          ${shotLocationSelect},
          width,
          height,
          blurhash,
          is_public,
          like_count,
          view_count,
          ${downloadCountSelect},
          rating,
          created_at
        FROM album_photos
        WHERE album_id = {{album_id}}
        ORDER BY ${photoOrderBy}
      `,
      {
        album_id: album.id,
      }
    );

    photoRows = photosResult.rows;
    await hydrateCloudBaseTempUrlsInRows(photoRows, ['url', 'thumbnail_url', 'preview_url', 'original_url']);
    await ensurePhotoRowsHaveDimensions(photoRows, { maxProbeCount: PHOTO_DIMENSION_EAGER_LIMIT });

    const photoIds = photoRows.map((row) => String(row.id));
    if (photoIds.length > 0) {
      const placeholders: string[] = [];
      const values: Record<string, unknown> = {};
      photoIds.forEach((id, index) => {
        const key = `photo_id_${index}`;
        placeholders.push(`{{${key}}}`);
        values[key] = id;
      });

      const commentsResult = await executeSQL(
        `
          SELECT
            id,
            photo_id,
            nickname,
            content,
            is_admin_reply,
            created_at
          FROM photo_comments
          WHERE photo_id IN (${placeholders.join(', ')})
          ORDER BY created_at ASC
        `,
        values
      );

      commentsResult.rows.forEach((row) => {
        const key = String(row.photo_id);
        if (!commentsByPhotoId.has(key)) {
          commentsByPhotoId.set(key, []);
        }
        commentsByPhotoId.get(key)!.push({
          id: String(row.id),
          nickname: row.nickname ?? '访客',
          content: row.content ?? '',
          is_admin: toBoolean(row.is_admin_reply),
          created_at: row.created_at,
        });
      });
    }
  }

  return {
    album: {
      id: String(album.id),
      title: album.title ?? '',
      root_folder_name: String(album.root_folder_name ?? '').trim() || '根目录',
      welcome_letter: album.welcome_letter ?? '',
      cover_url: normalizeMaybeUrlText(album.cover_url),
      donation_qr_code_url: normalizeMaybeUrlText(album.donation_qr_code_url),
      created_at: album.created_at,
      expires_at: album.effective_expires_at,
      is_expired: toBoolean(album.is_expired),
      ...(() => {
        const welcomeLetterMode = normalizeWelcomeLetterMode(
          album.welcome_letter_mode,
          album.enable_welcome_letter === null ? true : toBoolean(album.enable_welcome_letter)
        );
        return {
          enable_tipping: toBoolean(album.enable_tipping),
          enable_welcome_letter: welcomeLetterMode !== 'none',
          welcome_letter_mode: welcomeLetterMode,
          enable_freeze: album.enable_freeze === null ? true : toBoolean(album.enable_freeze),
          recipient_name: album.recipient_name ?? '拾光者',
        };
      })(),
    },
    folders: foldersResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
      sort_order: toNumber(row.sort_order, 2147483647),
    })),
    photos: photoRows.map((row) => mapAlbumPhotoRow(row, commentsByPhotoId)),
  };
}

async function rpcGetAlbumPhotoPage(args: Record<string, unknown>) {
  const inputKey = normalizeAccessKey(args.input_key);
  if (!inputKey) {
    throw new Error('密钥错误');
  }
  const hasShotDateColumn = await hasAlbumPhotoShotDateColumn();
  const hasShotLocationColumn = await hasAlbumPhotoShotLocationColumn();
  const hasDownloadCountColumn = await hasAlbumPhotoDownloadCountColumn();
  const shotDateSelect = hasShotDateColumn ? 'p.shot_date AS shot_date' : 'NULL AS shot_date';
  const shotLocationSelect = hasShotLocationColumn
    ? 'p.shot_location AS shot_location'
    : 'NULL AS shot_location';
  const downloadCountSelect = hasDownloadCountColumn
    ? 'p.download_count AS download_count'
    : '0 AS download_count';
  const photoOrderBy = 'COALESCE(p.sort_order, 2147483647) ASC, p.created_at DESC';

  const pageNo = Math.max(1, Number(args.page_no ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(args.page_size ?? 20)));
  const offset = (pageNo - 1) * pageSize;

  const albumResult = await executeSQL(
    `
      SELECT id
      FROM albums
      WHERE access_key = {{access_key}}
      LIMIT 1
    `,
    {
      access_key: inputKey,
    }
  );
  const album = albumResult.rows[0];
  if (!album) {
    throw new Error('密钥错误');
  }

  const folderFilter = resolveAlbumFolderFilter(args.folder_id);
  const baseValues = {
    album_id: String(album.id),
    ...folderFilter.params,
  };

  const photosResult = await executeSQL(
    `
      SELECT
        p.id,
        p.folder_id,
        COALESCE(p.url, p.original_url, p.preview_url, p.thumbnail_url) AS url,
        COALESCE(p.thumbnail_url, p.preview_url, p.original_url, p.url) AS thumbnail_url,
        COALESCE(p.preview_url, p.original_url, p.thumbnail_url, p.url) AS preview_url,
        COALESCE(p.original_url, p.preview_url, p.thumbnail_url, p.url) AS original_url,
        p.story_text,
        p.is_highlight,
        p.sort_order,
        ${shotDateSelect},
        ${shotLocationSelect},
        p.width,
        p.height,
        p.blurhash,
        p.is_public,
        p.like_count,
        p.view_count,
        ${downloadCountSelect},
        p.rating,
        p.created_at
      FROM album_photos p
      WHERE p.album_id = {{album_id}}
        AND ${folderFilter.clause}
      ORDER BY ${photoOrderBy}
      LIMIT {{limit}} OFFSET {{offset}}
    `,
    {
      ...baseValues,
      limit: pageSize,
      offset,
    }
  );
  await hydrateCloudBaseTempUrlsInRows(photosResult.rows, ['url', 'thumbnail_url', 'preview_url', 'original_url']);
  await ensurePhotoRowsHaveDimensions(photosResult.rows);

  const countResult = await executeSQL(
    `
      SELECT COUNT(*) AS total
      FROM album_photos p
      WHERE p.album_id = {{album_id}}
        AND ${folderFilter.clause}
    `,
    baseValues
  );
  const total = toNumber(countResult.rows[0]?.total, 0);

  return {
    photos: photosResult.rows.map((row) => mapAlbumPhotoRow(row)),
    total,
    page_no: pageNo,
    page_size: pageSize,
    has_more: pageNo * pageSize < total,
    folder_id: folderFilter.normalizedFolderId,
  };
}

async function rpcBindUserToAlbum(args: Record<string, unknown>, context: AuthContext) {
  const userId = requireUser(context);
  const accessKey = normalizeAccessKey(args.p_access_key);
  if (!accessKey) {
    throw new Error('密钥错误');
  }

  const albumResult = await executeSQL(
    `
      SELECT id, title, cover_url, created_at
      FROM albums
      WHERE access_key = {{access_key}}
      LIMIT 1
    `,
    {
      access_key: accessKey,
    }
  );

  const album = albumResult.rows[0];
  if (!album) {
    throw new Error('密钥错误');
  }

  await hydrateCloudBaseTempUrlsInRows([album], ['cover_url']);

  await executeSQL(
    `
      INSERT IGNORE INTO user_album_bindings (id, user_id, album_id, created_at)
      VALUES ({{id}}, {{user_id}}, {{album_id}}, ${NOW_UTC8_EXPR})
    `,
    {
      id: randomUUID(),
      user_id: userId,
      album_id: String(album.id),
    }
  );

  return {
    id: String(album.id),
    title: album.title ?? '',
    cover_url: normalizeMaybeUrlText(album.cover_url),
    created_at: album.created_at,
  };
}

async function rpcGetUserBoundAlbums(context: AuthContext) {
  const userId = requireUser(context);

  const result = await executeSQL(
    `
      SELECT
        a.id,
        a.title,
        a.cover_url,
        a.created_at,
        a.access_key,
        b.created_at AS bound_at,
        COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) AS expires_at,
        CASE
          WHEN COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired
      FROM user_album_bindings b
      JOIN albums a ON a.id = b.album_id
      WHERE b.user_id = {{user_id}}
      ORDER BY b.created_at DESC
    `,
    {
      user_id: userId,
    }
  );

  await hydrateCloudBaseTempUrlsInRows(result.rows, ['cover_url']);

  return result.rows.map((row) => ({
    id: String(row.id),
    title: row.title ?? '',
    cover_url: normalizeMaybeUrlText(row.cover_url),
    created_at: row.created_at,
    access_key: row.access_key ?? '',
    bound_at: row.bound_at,
    expires_at: row.expires_at,
    is_expired: toBoolean(row.is_expired),
  }));
}

async function rpcUnbindUserFromAlbum(args: Record<string, unknown>, context: AuthContext) {
  const userId = requireUser(context);
  const albumId = String(args.p_album_id ?? '').trim();
  const accessKey = normalizeAccessKey(args.p_access_key);

  let targetAlbumId = albumId;
  if (!targetAlbumId) {
    if (!accessKey) {
      throw new Error('参数错误：缺少相册标识');
    }

    const albumResult = await executeSQL(
      `
        SELECT id
        FROM albums
        WHERE access_key = {{access_key}}
        LIMIT 1
      `,
      {
        access_key: accessKey,
      }
    );
    const album = albumResult.rows[0];
    if (!album) {
      throw new Error('密钥错误');
    }
    targetAlbumId = String(album.id);
  }

  const deleteResult = await executeSQL(
    `
      DELETE FROM user_album_bindings
      WHERE user_id = {{user_id}}
        AND album_id = {{album_id}}
      LIMIT 1
    `,
    {
      user_id: userId,
      album_id: targetAlbumId,
    }
  );

  return {
    album_id: targetAlbumId,
    unbound: deleteResult.affectedRows > 0,
  };
}

async function rpcBindUserToBetaFeature(args: Record<string, unknown>, context: AuthContext) {
  const userId = requireUser(context);
  const featureCode = normalizeBetaFeatureCode(args.p_feature_code);
  if (!featureCode) {
    throw new Error('请输入内测码');
  }
  if (featureCode.length !== BETA_FEATURE_CODE_LENGTH) {
    throw new Error(`内测码必须是 ${BETA_FEATURE_CODE_LENGTH} 位大写字母或数字`);
  }

  const featureResult = await executeSQL(
    `
      SELECT
        v.id AS feature_id,
        v.feature_name,
        v.feature_description,
        v.feature_code,
        v.is_active AS feature_is_active,
        v.expires_at,
        CASE
          WHEN !(v.expires_at <=> NULL) AND v.expires_at < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired,
        r.id AS route_id,
        r.route_path,
        r.route_title,
        r.route_description,
        r.is_active AS route_is_active
      FROM feature_beta_versions v
      JOIN feature_beta_routes r ON r.id = v.route_id
      WHERE LEFT(REPLACE(REPLACE(REPLACE(UPPER(v.feature_code), '-', ''), '_', ''), ' ', ''), ${BETA_FEATURE_CODE_LENGTH}) = {{feature_code}}
      LIMIT 1
    `,
    {
      feature_code: featureCode,
    }
  );

  const feature = featureResult.rows[0];
  if (!feature) {
    throw new Error('内测码无效');
  }

  const featureIsActive = toBoolean(feature.feature_is_active);
  const routeIsActive = toBoolean(feature.route_is_active);
  const expiresAtRaw = feature.expires_at;
  const isExpired = toBoolean(feature.is_expired);

  if (!featureIsActive) {
    throw new Error('该内测功能已下线');
  }
  if (!routeIsActive) {
    throw new Error('该内测功能入口已关闭');
  }
  if (isExpired) {
    throw new Error('该内测码已过期');
  }

  const bindResult = await executeSQL(
    `
      INSERT IGNORE INTO user_beta_feature_bindings (id, user_id, feature_id, created_at)
      VALUES ({{id}}, {{user_id}}, {{feature_id}}, ${NOW_UTC8_EXPR})
    `,
    {
      id: randomUUID(),
      user_id: userId,
      feature_id: String(feature.feature_id),
    }
  );

  return {
    feature_id: String(feature.feature_id),
    feature_name: String(feature.feature_name ?? ''),
    feature_description: normalizeMaybeBetaDescription(feature.feature_description),
    feature_code: normalizeBetaFeatureCode(feature.feature_code),
    route_id: toNumber(feature.route_id, 0),
    route_path: normalizeBetaRoutePath(feature.route_path),
    route_title: String(feature.route_title ?? ''),
    route_description: normalizeMaybeBetaDescription(feature.route_description),
    expires_at: expiresAtRaw ?? null,
    bound_newly: bindResult.affectedRows > 0,
  };
}

async function rpcGetUserBetaFeatures(context: AuthContext) {
  const userId = requireUser(context);
  const result = await executeSQL(
    `
      SELECT
        b.id AS binding_id,
        b.created_at AS bound_at,
        v.id AS feature_id,
        v.feature_name,
        v.feature_description,
        v.feature_code,
        v.expires_at,
        r.id AS route_id,
        r.route_path,
        r.route_title,
        r.route_description
      FROM user_beta_feature_bindings b
      JOIN feature_beta_versions v ON v.id = b.feature_id
      JOIN feature_beta_routes r ON r.id = v.route_id
      WHERE b.user_id = {{user_id}}
        AND v.is_active = 1
        AND r.is_active = 1
        AND ((v.expires_at <=> NULL) OR v.expires_at >= ${NOW_UTC8_EXPR})
      ORDER BY b.created_at DESC
    `,
    {
      user_id: userId,
    }
  );

  return result.rows.map((row) => ({
    binding_id: String(row.binding_id ?? ''),
    bound_at: row.bound_at ?? null,
    feature_id: String(row.feature_id ?? ''),
    feature_name: String(row.feature_name ?? ''),
    feature_description: normalizeMaybeBetaDescription(row.feature_description),
    feature_code: normalizeBetaFeatureCode(row.feature_code),
    expires_at: row.expires_at ?? null,
    route_id: toNumber(row.route_id, 0),
    route_path: normalizeBetaRoutePath(row.route_path),
    route_title: String(row.route_title ?? ''),
    route_description: normalizeMaybeBetaDescription(row.route_description),
  }));
}

async function rpcCheckUserBetaFeatureAccess(args: Record<string, unknown>, context: AuthContext) {
  const userId = requireUser(context);
  const featureId = String(args.p_feature_id ?? '').trim();
  if (!featureId) {
    throw new Error('参数错误：缺少功能标识');
  }

  const result = await executeSQL(
    `
      SELECT
        b.id AS binding_id,
        v.id AS feature_id,
        v.feature_name,
        v.feature_description,
        v.feature_code,
        v.is_active AS feature_is_active,
        v.expires_at,
        CASE
          WHEN !(v.expires_at <=> NULL) AND v.expires_at < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired,
        r.id AS route_id,
        r.route_path,
        r.route_title,
        r.route_description,
        r.is_active AS route_is_active
      FROM user_beta_feature_bindings b
      JOIN feature_beta_versions v ON v.id = b.feature_id
      JOIN feature_beta_routes r ON r.id = v.route_id
      WHERE b.user_id = {{user_id}}
        AND b.feature_id = {{feature_id}}
      LIMIT 1
    `,
    {
      user_id: userId,
      feature_id: featureId,
    }
  );

  const feature = result.rows[0];
  if (!feature) {
    throw new Error('该内测功能未绑定或已失效');
  }

  const featureIsActive = toBoolean(feature.feature_is_active);
  const routeIsActive = toBoolean(feature.route_is_active);
  const expiresAtRaw = feature.expires_at;
  const isExpired = toBoolean(feature.is_expired);

  if (!featureIsActive || !routeIsActive || isExpired) {
    await executeSQL(
      `
        DELETE FROM user_beta_feature_bindings
        WHERE user_id = {{user_id}}
          AND feature_id = {{feature_id}}
        LIMIT 1
      `,
      {
        user_id: userId,
        feature_id: featureId,
      }
    );

    if (!featureIsActive) {
      throw new Error('该内测功能已下线');
    }
    if (!routeIsActive) {
      throw new Error('该内测功能入口已关闭');
    }
    throw new Error('该内测功能已过期');
  }

  return {
    allowed: true,
    feature_id: String(feature.feature_id),
    feature_name: String(feature.feature_name ?? ''),
    feature_description: normalizeMaybeBetaDescription(feature.feature_description),
    feature_code: normalizeBetaFeatureCode(feature.feature_code),
    expires_at: expiresAtRaw ?? null,
    route_id: toNumber(feature.route_id, 0),
    route_path: normalizeBetaRoutePath(feature.route_path),
    route_title: String(feature.route_title ?? ''),
    route_description: normalizeMaybeBetaDescription(feature.route_description),
  };
}

async function rpcPinPhotoToWall(args: Record<string, unknown>) {
  const accessKey = normalizeAccessKey(args.p_access_key);
  const photoId = String(args.p_photo_id ?? '').trim();
  if (!accessKey || !photoId) {
    throw new Error('参数错误');
  }
  const hasShotDateColumn = await hasAlbumPhotoShotDateColumn();
  const hasShotLocationColumn = await hasAlbumPhotoShotLocationColumn();
  const hasAlbumFreezeColumn = await hasAlbumEnableFreezeColumn();
  const shotDateSelect = hasShotDateColumn ? 'p.shot_date AS shot_date' : 'NULL AS shot_date';
  const shotLocationSelect = hasShotLocationColumn
    ? 'p.shot_location AS shot_location'
    : 'NULL AS shot_location';
  const enableFreezeSelect = hasAlbumFreezeColumn ? 'a.enable_freeze AS enable_freeze' : '1 AS enable_freeze';

  const result = await executeSQL(
    `
      SELECT
        p.id,
        p.album_id,
        p.is_public,
        COALESCE(p.url, p.original_url, p.preview_url, p.thumbnail_url) AS url,
        COALESCE(p.thumbnail_url, p.preview_url, p.original_url, p.url) AS thumbnail_url,
        COALESCE(p.preview_url, p.original_url, p.thumbnail_url, p.url) AS preview_url,
        COALESCE(p.original_url, p.preview_url, p.thumbnail_url, p.url) AS original_url,
        p.width,
        p.height,
        p.blurhash,
        p.story_text,
        p.is_highlight,
        ${enableFreezeSelect},
        ${shotDateSelect},
        ${shotLocationSelect}
      FROM album_photos p
      JOIN albums a ON a.id = p.album_id
      WHERE a.access_key = {{access_key}}
        AND p.id = {{photo_id}}
      LIMIT 1
    `,
    {
      access_key: accessKey,
      photo_id: photoId,
    }
  );

  const sourcePhoto = result.rows[0];
  if (!sourcePhoto) {
    throw new Error('无权操作：密钥错误或照片不属于该空间');
  }

  if (sourcePhoto.enable_freeze === false || toBoolean(sourcePhoto.enable_freeze) === false) {
    throw new Error('当前专属空间未开启定格功能');
  }

  const sourceToken = getSafeWallSourceToken(photoId);
  const sourcePattern = `%/wall/${sourceToken}_%`;
  const wallPhotoId = buildDeterministicWallPhotoId(photoId);

  const existingWallResult = await executeSQL(
    `
      SELECT id, url, thumbnail_url, preview_url, original_url
      FROM album_photos
      WHERE album_id = {{wall_album_id}}
        AND (
          id = {{wall_photo_id}}
          OR url LIKE {{source_pattern}}
          OR thumbnail_url LIKE {{source_pattern}}
          OR preview_url LIKE {{source_pattern}}
          OR original_url LIKE {{source_pattern}}
        )
      ORDER BY created_at DESC, id DESC
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
      wall_photo_id: wallPhotoId,
      source_pattern: sourcePattern,
    }
  );
  const existingWallRows = Array.isArray(existingWallResult.rows) ? existingWallResult.rows : [];

  if (existingWallRows.length > 0) {
    await deleteWallPhotoRows(existingWallRows, {
      strictStorageCleanup: true,
    });
  }

  if (toBoolean(sourcePhoto.is_public)) {
    await executeSQL(
      `
        UPDATE album_photos
        SET is_public = 0
        WHERE id = {{photo_id}}
      `,
      {
        photo_id: photoId,
      }
    );

    return false;
  }

  const sourceUrl = resolveSourcePhotoBestUrl(sourcePhoto);
  if (!sourceUrl) {
    throw new Error('定格失败：缺少源图地址');
  }

  const freezeFolderId = await ensureWallFolderByName(SYSTEM_WALL_FREEZE_FOLDER_NAME);
  const wallVariant = await buildWallImageVariantsFromSource(sourceUrl);
  const thumbnailUpload = await uploadFileToCloudBase(
    wallVariant.thumbnailBuffer,
    buildWallStorageKey(photoId, 'thumb'),
    'gallery'
  );
  const previewUpload = await uploadFileToCloudBase(
    wallVariant.previewBuffer,
    buildWallStorageKey(photoId, 'preview'),
    'gallery'
  );

  try {
    const shotDateInsertColumn = hasShotDateColumn ? ',\n          shot_date' : '';
    const shotDateInsertValue = hasShotDateColumn ? ',\n          {{shot_date}}' : '';
    const shotLocationInsertColumn = hasShotLocationColumn ? ',\n          shot_location' : '';
    const shotLocationInsertValue = hasShotLocationColumn ? ',\n          {{shot_location}}' : '';
    const insertValues: Record<string, unknown> = {
      id: wallPhotoId,
      album_id: SYSTEM_WALL_ALBUM_ID,
      folder_id: freezeFolderId,
      thumbnail_url: thumbnailUpload.downloadUrl,
      preview_url: previewUpload.downloadUrl,
      original_url: previewUpload.downloadUrl,
      story_text: normalizeMaybeStoryText(sourcePhoto.story_text),
      is_highlight: toBoolean(sourcePhoto.is_highlight) ? 1 : 0,
      width: wallVariant.width || toNumber(sourcePhoto.width, 0),
      height: wallVariant.height || toNumber(sourcePhoto.height, 0),
      blurhash: String(sourcePhoto.blurhash ?? '').trim() || null,
    };
    if (hasShotDateColumn) {
      insertValues.shot_date = normalizeMaybeShotDate(sourcePhoto.shot_date) ?? getTodayDateUTC8();
    }
    if (hasShotLocationColumn) {
      insertValues.shot_location = normalizeMaybeShotLocation(sourcePhoto.shot_location);
    }

    await executeSQL(
      `
        INSERT INTO album_photos (
          id,
          album_id,
          folder_id,
          thumbnail_url,
          preview_url,
          original_url,
          story_text,
          is_highlight,
          sort_order,
          width,
          height,
          blurhash,
          is_public,
          view_count,
          like_count,
          rating${shotDateInsertColumn}${shotLocationInsertColumn},
          created_at
        ) VALUES (
          {{id}},
          {{album_id}},
          {{folder_id}},
          {{thumbnail_url}},
          {{preview_url}},
          {{original_url}},
          {{story_text}},
          {{is_highlight}},
          2147483647,
          {{width}},
          {{height}},
          {{blurhash}},
          1,
          0,
          0,
          0${shotDateInsertValue}${shotLocationInsertValue},
          ${NOW_UTC8_EXPR}
        )
      `,
      insertValues
    );
  } catch (insertError) {
    try {
      await deleteCloudBaseObjects([
        thumbnailUpload.downloadUrl,
        previewUpload.downloadUrl,
      ]);
    } catch (cleanupError) {
      console.warn('cleanup wall upload assets failed:', cleanupError);
    }

    if (!isDuplicateEntryError(insertError)) {
      throw insertError;
    }
  }

  await executeSQL(
    `
      UPDATE album_photos
      SET is_public = 1
      WHERE id = {{photo_id}}
    `,
    {
      photo_id: photoId,
    }
  );

  return true;
}

async function rpcDeleteAlbumPhoto(args: Record<string, unknown>) {
  const accessKey = normalizeAccessKey(args.p_access_key);
  const photoId = String(args.p_photo_id ?? '').trim();

  const result = await executeSQL(
    `
      SELECT p.id, p.url, p.thumbnail_url, p.preview_url, p.original_url
      FROM album_photos p
      JOIN albums a ON a.id = p.album_id
      WHERE a.access_key = {{access_key}}
        AND p.id = {{photo_id}}
      LIMIT 1
    `,
    {
      access_key: accessKey,
      photo_id: photoId,
    }
  );

  if (!result.rows[0]) {
    throw new Error('无权操作：密钥错误或照片不属于该空间');
  }

  const targetRow = result.rows[0];
  await executeSQL(
    `
      DELETE FROM album_photos
      WHERE id = {{photo_id}}
    `,
    {
      photo_id: photoId,
    }
  );

  const verifyResult = await executeSQL(
    `
      SELECT id
      FROM album_photos
      WHERE id = {{photo_id}}
      LIMIT 1
    `,
    {
      photo_id: photoId,
    }
  );
  if (verifyResult.rows.length > 0) {
    throw new Error('删除照片失败，请稍后重试');
  }

  const deleteTargets = [
    String(targetRow.url ?? '').trim(),
    String(targetRow.thumbnail_url ?? '').trim(),
    String(targetRow.preview_url ?? '').trim(),
    String(targetRow.original_url ?? '').trim(),
  ].filter(Boolean);

  let storageCleanupFailed = false;
  let warning: string | null = null;
  if (deleteTargets.length > 0) {
    try {
      await deleteCloudBaseObjects(deleteTargets);
    } catch (error) {
      storageCleanupFailed = true;
      warning = `照片记录已删除，但云存储清理失败：${error instanceof Error ? error.message : '未知错误'}`;
    }
  }

  return {
    deleted: true,
    storage_cleanup_failed: storageCleanupFailed,
    warning,
  };
}

async function rpcLikePhoto(args: Record<string, unknown>, context: AuthContext) {
  const userId = requireUser(context);
  const photoId = String(args.p_photo_id ?? '').trim();
  if (!photoId) {
    throw new Error('参数错误');
  }

  const existing = await executeSQL(
    `
      SELECT id
      FROM photo_likes
      WHERE user_id = {{user_id}} AND photo_id = {{photo_id}}
      LIMIT 1
    `,
    {
      user_id: userId,
      photo_id: photoId,
    }
  );

  if (existing.rows.length > 0) {
    await executeSQL(
      `
        DELETE FROM photo_likes
        WHERE user_id = {{user_id}} AND photo_id = {{photo_id}}
      `,
      {
        user_id: userId,
        photo_id: photoId,
      }
    );

    await executeSQL(
      `
        UPDATE album_photos
        SET like_count = GREATEST(0, like_count - 1)
        WHERE id = {{photo_id}}
      `,
      {
        photo_id: photoId,
      }
    );

    return { liked: false };
  }

  await executeSQL(
    `
      INSERT INTO photo_likes (user_id, photo_id, created_at)
      VALUES ({{user_id}}, {{photo_id}}, ${NOW_UTC8_EXPR})
    `,
    {
      user_id: userId,
      photo_id: photoId,
    }
  );

  await executeSQL(
    `
      UPDATE album_photos
      SET like_count = like_count + 1
      WHERE id = {{photo_id}}
    `,
    {
      photo_id: photoId,
    }
  );

  return { liked: true };
}

async function rpcIncrementPhotoView(args: Record<string, unknown>, context: AuthContext) {
  const photoId = String(args.p_photo_id ?? '').trim();
  const sessionId = args.p_session_id ? String(args.p_session_id).trim() : '';
  const userId = context.user?.id ? String(context.user.id).trim() : '';
  if (!photoId) {
    throw new Error('参数错误');
  }

  const hasViewerIdentity = Boolean(userId || sessionId);
  let alreadyViewed = false;
  if (userId && sessionId) {
    const viewed = await executeSQL(
      `
        SELECT id
        FROM photo_views
        WHERE photo_id = {{photo_id}}
          AND (user_id = {{user_id}} OR session_id = {{session_id}})
        LIMIT 1
      `,
      {
        photo_id: photoId,
        user_id: userId,
        session_id: sessionId,
      }
    );
    alreadyViewed = viewed.rows.length > 0;
  } else if (userId) {
    const viewed = await executeSQL(
      `
        SELECT id
        FROM photo_views
        WHERE photo_id = {{photo_id}} AND user_id = {{user_id}}
        LIMIT 1
      `,
      {
        photo_id: photoId,
        user_id: userId,
      }
    );
    alreadyViewed = viewed.rows.length > 0;
  } else if (sessionId) {
    const viewed = await executeSQL(
      `
        SELECT id
        FROM photo_views
        WHERE photo_id = {{photo_id}} AND session_id = {{session_id}}
        LIMIT 1
      `,
      {
        photo_id: photoId,
        session_id: sessionId,
      }
    );
    alreadyViewed = viewed.rows.length > 0;
  }

  let counted = false;
  let fallbackViewCount: number | null = null;
  if (hasViewerIdentity && !alreadyViewed) {
    try {
      if (userId && sessionId) {
        await executeSQL(
          `
            INSERT INTO photo_views (id, photo_id, user_id, session_id, viewed_at)
            VALUES ({{id}}, {{photo_id}}, {{user_id}}, {{session_id}}, ${NOW_UTC8_EXPR})
          `,
          {
            id: randomUUID(),
            photo_id: photoId,
            user_id: userId,
            session_id: sessionId,
          }
        );
      } else if (userId) {
        await executeSQL(
          `
            INSERT INTO photo_views (id, photo_id, user_id, viewed_at)
            VALUES ({{id}}, {{photo_id}}, {{user_id}}, ${NOW_UTC8_EXPR})
          `,
          {
            id: randomUUID(),
            photo_id: photoId,
            user_id: userId,
          }
        );
      } else {
        await executeSQL(
          `
            INSERT INTO photo_views (id, photo_id, session_id, viewed_at)
            VALUES ({{id}}, {{photo_id}}, {{session_id}}, ${NOW_UTC8_EXPR})
          `,
          {
            id: randomUUID(),
            photo_id: photoId,
            session_id: sessionId,
          }
        );
      }

      const updateResult = await executeSQL(
        `
          UPDATE album_photos
          SET view_count = view_count + 1
          WHERE id = {{photo_id}}
        `,
        {
          photo_id: photoId,
        }
      );
      counted = updateResult.affectedRows > 0;
    } catch (error) {
      if (isDuplicateEntryError(error)) {
        counted = false;
      } else if (isMissingDefinerSqlError(error)) {
        counted = true;
        const fallbackCountResult = await executeSQL(
          `
            SELECT COUNT(*) AS total
            FROM photo_views
            WHERE photo_id = {{photo_id}}
          `,
          {
            photo_id: photoId,
          }
        );
        fallbackViewCount = toNumber(fallbackCountResult.rows[0]?.total, 0);
      }
    }
  }

  const countResult = fallbackViewCount === null
    ? await executeSQL(
        `
          SELECT view_count
          FROM album_photos
          WHERE id = {{photo_id}}
          LIMIT 1
        `,
        {
          photo_id: photoId,
        }
      )
    : {
        rows: [{ view_count: fallbackViewCount }],
        affectedRows: 0,
        insertId: null,
      };

  return {
    counted,
    view_count: toNumber(countResult.rows[0]?.view_count, 0),
  };
}

async function rpcIncrementPhotoDownload(args: Record<string, unknown>) {
  const photoId = String(args.p_photo_id ?? '').trim();
  const countInput = Number(args.p_count ?? 1);
  const incrementBy = Number.isFinite(countInput)
    ? Math.max(1, Math.min(50, Math.round(countInput)))
    : 1;
  if (!photoId) {
    throw new Error('参数错误');
  }

  const hasDownloadCountColumn = await hasAlbumPhotoDownloadCountColumn();
  if (!hasDownloadCountColumn) {
    return {
      counted: false,
      download_count: 0,
      unsupported: true,
    };
  }

  try {
    const updateResult = await executeSQL(
      `
        UPDATE album_photos
        SET download_count = download_count + {{count}}
        WHERE id = {{photo_id}}
      `,
      {
        photo_id: photoId,
        count: incrementBy,
      }
    );

    const countResult = await executeSQL(
      `
        SELECT download_count
        FROM album_photos
        WHERE id = {{photo_id}}
        LIMIT 1
      `,
      {
        photo_id: photoId,
      }
    );

    return {
      counted: updateResult.affectedRows > 0,
      download_count: toNumber(countResult.rows[0]?.download_count, 0),
    };
  } catch (error) {
    if (!isMissingDefinerSqlError(error)) {
      throw error;
    }

    const countResult = await executeSQL(
      `
        SELECT download_count
        FROM album_photos
        WHERE id = {{photo_id}}
        LIMIT 1
      `,
      {
        photo_id: photoId,
      }
    );

    return {
      counted: false,
      download_count: toNumber(countResult.rows[0]?.download_count, 0),
      missing_legacy_trigger_definer: true,
    };
  }
}

async function rpcPostAlbumComment(args: Record<string, unknown>, context: AuthContext) {
  const accessKey = normalizeAccessKey(args.p_access_key);
  const photoId = String(args.p_photo_id ?? '').trim();
  const content = String(args.p_content ?? '').trim();

  if (!content) {
    throw new Error('评论内容不能为空');
  }

  const result = await executeSQL(
    `
      SELECT a.id
      FROM albums a
      JOIN album_photos p ON p.album_id = a.id
      WHERE a.access_key = {{access_key}}
        AND p.id = {{photo_id}}
      LIMIT 1
    `,
    {
      access_key: accessKey,
      photo_id: photoId,
    }
  );

  if (!result.rows[0]) {
    throw new Error('无权操作：密钥错误或照片不属于该空间');
  }

  let nickname = '访客';
  let isAdminReply = false;

  if (context.user?.id) {
    const profileResult = await executeSQL(
      `
        SELECT name, role
        FROM profiles
        WHERE id = {{user_id}}
        LIMIT 1
      `,
      {
        user_id: context.user.id,
      }
    );

    if (profileResult.rows[0]) {
      nickname = profileResult.rows[0].name || '访客';
      isAdminReply = profileResult.rows[0].role === 'admin';
    }
  }

  await executeSQL(
    `
      INSERT INTO photo_comments (photo_id, user_id, nickname, content, is_admin_reply, created_at)
      VALUES ({{photo_id}}, {{user_id}}, {{nickname}}, {{content}}, {{is_admin_reply}}, ${NOW_UTC8_EXPR})
    `,
    {
      photo_id: photoId,
      user_id: context.user?.id ?? null,
      nickname,
      content,
      is_admin_reply: isAdminReply ? 1 : 0,
    }
  );

  return null;
}

async function rpcValidateCity(args: Record<string, unknown>) {
  const cityName = String(args.p_city_name ?? '').trim();
  if (!cityName) {
    return false;
  }

  const result = await executeSQL(
    `
      SELECT id
      FROM allowed_cities
      WHERE city_name = {{city_name}}
        AND is_active = 1
      LIMIT 1
    `,
    {
      city_name: cityName,
    }
  );

  return result.rows.length > 0;
}

async function rpcCheckDateAvailability(args: Record<string, unknown>) {
  const targetDate = String(args.target_date ?? '').trim();
  if (!targetDate) {
    return false;
  }

  const blackouts = await executeSQL(
    `
      SELECT id
      FROM booking_blackouts
      WHERE date = {{target_date}}
      LIMIT 1
    `,
    {
      target_date: targetDate,
    }
  );
  if (blackouts.rows.length > 0) {
    return false;
  }

  const activeBookings = await executeSQL(
    `
      SELECT id
      FROM bookings
      WHERE booking_date = {{target_date}}
        AND status IN ('pending', 'confirmed', 'in_progress')
      LIMIT 1
    `,
    {
      target_date: targetDate,
    }
  );

  return activeBookings.rows.length === 0;
}

async function rpcIncrementPoseView(args: Record<string, unknown>) {
  const poseId = toNumber(args.p_pose_id, 0);
  if (!poseId) {
    return null;
  }

  await executeSQL(
    `
      UPDATE poses
      SET view_count = view_count + 1
      WHERE id = {{pose_id}}
    `,
    {
      pose_id: poseId,
    }
  );

  return null;
}

async function rpcBatchIncrementPoseViews(args: Record<string, unknown>) {
  const poseViews = Array.isArray(args.pose_views) ? args.pose_views : [];

  for (const item of poseViews) {
    const poseId = toNumber((item as any)?.pose_id, 0);
    const count = Math.max(0, toNumber((item as any)?.count, 0));
    if (!poseId || !count) {
      continue;
    }

    await executeSQL(
      `
        UPDATE poses
        SET view_count = view_count + {{count}}
        WHERE id = {{pose_id}}
      `,
      {
        pose_id: poseId,
        count,
      }
    );
  }

  return null;
}

async function rpcGetRandomPosesBatch(args: Record<string, unknown>) {
  const tagFilter = Array.isArray(args.tag_filter) ? args.tag_filter.map((item) => String(item)) : [];
  const batchSize = Math.min(100, Math.max(1, toNumber(args.batch_size, 20)));
  const excludeIds = Array.isArray(args.exclude_ids) ? args.exclude_ids.map((item) => toNumber(item, 0)).filter((id) => id > 0) : [];

  const randomKey = Math.random();
  const values: Record<string, unknown> = {
    random_key: randomKey,
    limit: batchSize,
  };

  let whereClauses = ['rand_key >= {{random_key}}'];
  if (tagFilter.length > 0) {
    values.tag_filter = JSON.stringify(tagFilter);
    whereClauses.push('JSON_OVERLAPS(tags, CAST({{tag_filter}} AS JSON))');
  }
  if (excludeIds.length > 0) {
    const placeholders: string[] = [];
    excludeIds.forEach((id, index) => {
      const key = `exclude_id_${index}`;
      values[key] = id;
      placeholders.push(`{{${key}}}`);
    });
    whereClauses.push(`id NOT IN (${placeholders.join(', ')})`);
  }

  let query = `
    SELECT id, image_url, tags, storage_path, view_count, created_at, rand_key
    FROM poses
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY rand_key ASC
    LIMIT {{limit}}
  `;

  let result = await executeSQL(query, values);
  if (result.rows.length < batchSize) {
    const fallbackValues = { ...values };
    const fallbackClauses = whereClauses.filter((clause) => clause !== 'rand_key >= {{random_key}}');
    query = `
      SELECT id, image_url, tags, storage_path, view_count, created_at, rand_key
      FROM poses
      ${fallbackClauses.length > 0 ? `WHERE ${fallbackClauses.join(' AND ')}` : ''}
      ORDER BY rand_key ASC
      LIMIT {{limit}}
    `;
    const fallback = await executeSQL(query, fallbackValues);

    const merged = new Map<number, Record<string, any>>();
    result.rows.forEach((row) => merged.set(toNumber(row.id, 0), row));
    fallback.rows.forEach((row) => merged.set(toNumber(row.id, 0), row));
    result = {
      ...result,
      rows: Array.from(merged.values()).slice(0, batchSize),
    };
  }

  await hydrateCloudBaseTempUrlsInRows(result.rows, ['image_url']);

  return result.rows.map((row) => ({
    id: toNumber(row.id, 0),
    image_url: row.image_url ?? '',
    tags: normalizeTags(row.tags),
    storage_path: row.storage_path ?? null,
    view_count: toNumber(row.view_count, 0),
    created_at: row.created_at,
    rand_key: row.rand_key !== undefined ? Number(row.rand_key) : null,
  }));
}

async function rpcLogUserActivity(context: AuthContext) {
  const userId = requireUser(context);

  await executeSQL(
    `
      INSERT IGNORE INTO user_active_logs (user_id, active_date, created_at)
      VALUES ({{user_id}}, ${TODAY_UTC8_EXPR}, ${NOW_UTC8_EXPR})
    `,
    {
      user_id: userId,
    }
  );

  await executeSQL(
    `
      UPDATE profiles
      SET last_active_at = ${NOW_UTC8_EXPR}
      WHERE id = {{user_id}}
    `,
    {
      user_id: userId,
    }
  );

  return null;
}

async function scalar(sql: string, values: Record<string, unknown> = {}, key: string = 'value'): Promise<number> {
  const result = await executeSQL(sql, values);
  return toNumber(result.rows[0]?.[key], 0);
}

interface ScalarQueryTask {
  sql: string;
  values?: Record<string, unknown>;
  key?: string;
}

async function runTasksWithConcurrency<T>(
  taskFactories: Array<() => Promise<T>>,
  concurrency: number = 1
): Promise<T[]> {
  const safeConcurrency = Math.max(1, concurrency);
  const values: T[] = [];

  for (let index = 0; index < taskFactories.length; index += safeConcurrency) {
    const chunk = taskFactories.slice(index, index + safeConcurrency);
    const chunkValues = await Promise.all(chunk.map((taskFactory) => taskFactory()));
    values.push(...chunkValues);
  }

  return values;
}

async function runScalarQueryTasks(tasks: ScalarQueryTask[], concurrency: number = 3): Promise<number[]> {
  return runTasksWithConcurrency(
    tasks.map((task) => () => scalar(task.sql, task.values ?? {}, task.key ?? 'value')),
    concurrency
  );
}

async function rpcGetAdminDashboardStats(context: AuthContext) {
  requireAdmin(context);

  const trendWindowDays = 7;
  const [
    hasUserActiveLogsTable,
    hasPhotoCommentsTable,
    hasPoseTagsTable,
    hasAllowedCitiesTable,
    hasBookingBlackoutsTable,
    hasAppReleasesTable,
    hasAnalyticsDailyTable,
    hasBookingTypesTable,
    ] = await runTasksWithConcurrency(
    [
      () => hasTable('user_active_logs'),
      () => hasTable('photo_comments'),
      () => hasTable('pose_tags'),
      () => hasTable('allowed_cities'),
      () => hasTable('booking_blackouts'),
      () => hasTable('app_releases'),
      () => hasTable('analytics_daily'),
      () => hasTable('booking_types'),
    ],
    2
  );

  const unavailableSources: string[] = [];
  if (!hasUserActiveLogsTable) unavailableSources.push('user_active_logs');
  if (!hasPhotoCommentsTable) unavailableSources.push('photo_comments');
  if (!hasPoseTagsTable) unavailableSources.push('pose_tags');
  if (!hasAllowedCitiesTable) unavailableSources.push('allowed_cities');
  if (!hasBookingBlackoutsTable) unavailableSources.push('booking_blackouts');
  if (!hasAppReleasesTable) unavailableSources.push('app_releases');
  if (!hasAnalyticsDailyTable) unavailableSources.push('analytics_daily');
  if (!hasBookingTypesTable) unavailableSources.push('booking_types');

  const scalarTasks: ScalarQueryTask[] = [
    { sql: 'SELECT COUNT(*) AS value FROM profiles' },
    { sql: "SELECT COUNT(*) AS value FROM profiles WHERE role = 'admin'" },
    { sql: "SELECT COUNT(*) AS value FROM profiles WHERE role = 'user'" },
    { sql: `SELECT COUNT(*) AS value FROM profiles WHERE DATE(created_at) = ${TODAY_UTC8_EXPR}` },
    {
      sql: hasUserActiveLogsTable
        ? `SELECT COUNT(DISTINCT user_id) AS value FROM user_active_logs WHERE active_date = ${TODAY_UTC8_EXPR}`
        : 'SELECT 0 AS value',
    },
    {
      sql: 'SELECT COUNT(*) AS value FROM albums WHERE id <> {{system_wall_album_id}} AND access_key <> {{system_wall_album_access_key}}',
      values: {
        system_wall_album_id: SYSTEM_WALL_ALBUM_ID,
        system_wall_album_access_key: SYSTEM_WALL_ALBUM_ACCESS_KEY,
      },
    },
    {
      sql: `SELECT COUNT(*) AS value FROM albums WHERE id <> {{system_wall_album_id}} AND access_key <> {{system_wall_album_access_key}} AND DATE(created_at) = ${TODAY_UTC8_EXPR}`,
      values: {
        system_wall_album_id: SYSTEM_WALL_ALBUM_ID,
        system_wall_album_access_key: SYSTEM_WALL_ALBUM_ACCESS_KEY,
      },
    },
    {
      sql: `SELECT COUNT(*) AS value FROM albums WHERE id <> {{system_wall_album_id}} AND access_key <> {{system_wall_album_access_key}} AND COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR}`,
      values: {
        system_wall_album_id: SYSTEM_WALL_ALBUM_ID,
        system_wall_album_access_key: SYSTEM_WALL_ALBUM_ACCESS_KEY,
      },
    },
    {
      sql: 'SELECT COUNT(*) AS value FROM albums WHERE id <> {{system_wall_album_id}} AND access_key <> {{system_wall_album_access_key}} AND enable_tipping = 1',
      values: {
        system_wall_album_id: SYSTEM_WALL_ALBUM_ID,
        system_wall_album_access_key: SYSTEM_WALL_ALBUM_ACCESS_KEY,
      },
    },
    { sql: 'SELECT COUNT(*) AS value FROM album_photos' },
    { sql: `SELECT COUNT(*) AS value FROM album_photos WHERE DATE(created_at) = ${TODAY_UTC8_EXPR}` },
    { sql: 'SELECT COUNT(*) AS value FROM album_photos WHERE is_public = 1' },
    { sql: 'SELECT COUNT(*) AS value FROM album_photos WHERE is_public = 0' },
    { sql: 'SELECT COALESCE(SUM(view_count), 0) AS value FROM album_photos' },
    { sql: 'SELECT COALESCE(SUM(like_count), 0) AS value FROM album_photos' },
    {
      sql: hasPhotoCommentsTable ? 'SELECT COUNT(*) AS value FROM photo_comments' : 'SELECT 0 AS value',
    },
    { sql: 'SELECT COALESCE(ROUND(AVG(rating), 2), 0) AS value FROM album_photos WHERE rating > 0' },
    { sql: 'SELECT COUNT(*) AS value FROM bookings' },
    { sql: `SELECT COUNT(*) AS value FROM bookings WHERE DATE(created_at) = ${TODAY_UTC8_EXPR}` },
    { sql: "SELECT COUNT(*) AS value FROM bookings WHERE status = 'pending'" },
    { sql: "SELECT COUNT(*) AS value FROM bookings WHERE status = 'confirmed'" },
    { sql: "SELECT COUNT(*) AS value FROM bookings WHERE status = 'in_progress'" },
    { sql: "SELECT COUNT(*) AS value FROM bookings WHERE status = 'finished'" },
    { sql: "SELECT COUNT(*) AS value FROM bookings WHERE status = 'cancelled'" },
    { sql: `SELECT COUNT(*) AS value FROM bookings WHERE status IN ('pending', 'confirmed') AND booking_date >= ${TODAY_UTC8_EXPR}` },
    { sql: 'SELECT COUNT(*) AS value FROM poses' },
    { sql: `SELECT COUNT(*) AS value FROM poses WHERE DATE(created_at) = ${TODAY_UTC8_EXPR}` },
    { sql: 'SELECT COALESCE(SUM(view_count), 0) AS value FROM poses' },
    {
      sql: hasPoseTagsTable ? 'SELECT COUNT(*) AS value FROM pose_tags' : 'SELECT 0 AS value',
    },
    {
      sql: hasAllowedCitiesTable ? 'SELECT COUNT(*) AS value FROM allowed_cities WHERE is_active = 1' : 'SELECT 0 AS value',
    },
    {
      sql: hasBookingBlackoutsTable
        ? `SELECT COUNT(*) AS value FROM booking_blackouts WHERE date >= ${TODAY_UTC8_EXPR}`
        : 'SELECT 0 AS value',
    },
    {
      sql: hasAppReleasesTable ? 'SELECT COUNT(*) AS value FROM app_releases' : 'SELECT 0 AS value',
    },
  ];

  const [
    usersTotal,
    usersAdmins,
    usersRegular,
    usersNewToday,
    usersActiveToday,
    albumsTotal,
    albumsNewToday,
    albumsExpired,
    albumsTippingEnabled,
    photosTotal,
    photosNewToday,
    photosPublic,
    photosPrivate,
    photosTotalViews,
    photosTotalLikes,
    photosTotalComments,
    photosAvgRating,
    bookingsTotal,
    bookingsNewToday,
    bookingsPending,
    bookingsConfirmed,
    bookingsInProgress,
    bookingsFinished,
    bookingsCancelled,
    bookingsUpcoming,
    posesTotal,
    posesNewToday,
    posesTotalViews,
    posesTotalTags,
    totalCities,
    totalBlackoutDates,
    totalReleases,
  ] = await runScalarQueryTasks(scalarTasks, 3);

  const hasDownloadCountColumn = await hasAlbumPhotoDownloadCountColumn();
  const photosTotalDownloads = hasDownloadCountColumn
    ? await scalar('SELECT COALESCE(SUM(download_count), 0) AS value FROM album_photos')
    : 0;

  let photosWithStory = 0;
  let photosHighlighted = 0;
  try {
    photosWithStory = await scalar(
      `
        SELECT COUNT(*) AS value
        FROM album_photos
        WHERE LENGTH(TRIM(COALESCE(story_text, ''))) > 0
          AND LOWER(TRIM(COALESCE(story_text, ''))) NOT IN ('null', 'undefined', 'none', 'nil')
      `
    );
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    photosWithStory = 0;
  }

  try {
    photosHighlighted = await scalar(
      `
        SELECT COUNT(*) AS value
        FROM album_photos
        WHERE is_highlight = 1
      `
    );
  } catch (error) {
    if (isRetryableSqlError(error)) {
      throw error;
    }
    photosHighlighted = 0;
  }

  const bookingsTypesRows = hasBookingTypesTable
    ? (
        await executeSQL(
          `
            SELECT bt.name AS type_name, COUNT(b.id) AS count
            FROM booking_types bt
            LEFT JOIN bookings b ON b.type_id = bt.id
            GROUP BY bt.id, bt.name
            ORDER BY bt.id ASC
          `
        )
      ).rows
    : [];

  const topTagsRows = hasPoseTagsTable
    ? (
        await executeSQL(
          `
            SELECT name AS tag_name, usage_count
            FROM pose_tags
            ORDER BY usage_count DESC
            LIMIT 10
          `
        )
      ).rows
    : [];

  const latestReleaseRows = hasAppReleasesTable
    ? (
        await executeSQL(
          `
            SELECT version, platform, created_at
            FROM app_releases
            ORDER BY created_at DESC
            LIMIT 1
          `
        )
      ).rows
    : [];

  const trendUsersRows = hasAnalyticsDailyTable
    ? (
        await executeSQL(
          `
            SELECT date, new_users_count AS count
            FROM analytics_daily
            WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${trendWindowDays - 1} DAY)
            ORDER BY date ASC
          `
        )
      ).rows
    : [];

  const trendActiveUsersRows = hasAnalyticsDailyTable
    ? (
        await executeSQL(
          `
            SELECT date, active_users_count AS count
            FROM analytics_daily
            WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${trendWindowDays - 1} DAY)
            ORDER BY date ASC
          `
        )
      ).rows
    : [];

  const trendBookingsRows = hasAnalyticsDailyTable
    ? (
        await executeSQL(
          `
            SELECT date, new_bookings_count AS count
            FROM analytics_daily
            WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${trendWindowDays - 1} DAY)
            ORDER BY date ASC
          `
        )
      ).rows
    : [];

  const snapshotMetaRow = hasAnalyticsDailyTable
    ? (
        await executeSQL(
          `
            SELECT
              MAX(date) AS latest_date,
              SUM(CASE WHEN date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${trendWindowDays - 1} DAY) THEN 1 ELSE 0 END) AS recent_days,
              CASE
                WHEN (MAX(date) <=> NULL) THEN NULL
                ELSE DATEDIFF(${TODAY_UTC8_EXPR}, MAX(date))
              END AS lag_days
            FROM analytics_daily
          `
        )
      ).rows[0] ?? null
    : null;

  const trendDaysAvailable = Math.max(
    trendUsersRows.length,
    trendActiveUsersRows.length,
    trendBookingsRows.length,
    toNumber(snapshotMetaRow?.recent_days, 0)
  );
  const snapshotLagDays = snapshotMetaRow ? toNumber(snapshotMetaRow.lag_days, 0) : null;
  const snapshotStatus = !hasAnalyticsDailyTable
    ? 'unavailable'
    : trendDaysAvailable <= 0
      ? 'empty'
      : snapshotLagDays !== null && snapshotLagDays > 0
        ? 'stale'
        : 'ready';

  return {
    users: {
      total: usersTotal,
      admins: usersAdmins,
      regular_users: usersRegular,
      new_today: usersNewToday,
      active_today: usersActiveToday,
    },
    albums: {
      total: albumsTotal,
      new_today: albumsNewToday,
      expired: albumsExpired,
      tipping_enabled: albumsTippingEnabled,
    },
    photos: {
      total: photosTotal,
      new_today: photosNewToday,
      public: photosPublic,
      private: photosPrivate,
      total_views: photosTotalViews,
      total_likes: photosTotalLikes,
      total_downloads: photosTotalDownloads,
      with_story: photosWithStory,
      highlighted: photosHighlighted,
      total_comments: photosTotalComments,
      avg_rating: photosAvgRating,
    },
    bookings: {
      total: bookingsTotal,
      new_today: bookingsNewToday,
      pending: bookingsPending,
      confirmed: bookingsConfirmed,
      in_progress: bookingsInProgress,
      finished: bookingsFinished,
      cancelled: bookingsCancelled,
      upcoming: bookingsUpcoming,
      types: bookingsTypesRows.map((row) => ({
        type_name: row.type_name ?? '',
        count: toNumber(row.count, 0),
      })),
    },
    poses: {
      total: posesTotal,
      new_today: posesNewToday,
      total_views: posesTotalViews,
      total_tags: posesTotalTags,
      top_tags: topTagsRows.map((row) => ({
        tag_name: row.tag_name ?? '',
        usage_count: toNumber(row.usage_count, 0),
      })),
    },
    system: {
      total_cities: totalCities,
      total_blackout_dates: totalBlackoutDates,
      total_releases: totalReleases,
      latest_version: latestReleaseRows[0] ?? null,
    },
    trends: {
      daily_new_users: trendUsersRows,
      daily_active_users: trendActiveUsersRows,
      daily_new_bookings: trendBookingsRows,
    },
    meta: {
      generated_at: new Date().toISOString(),
      trend_days_expected: trendWindowDays,
      trend_days_available: trendDaysAvailable,
      snapshot_latest_date: snapshotMetaRow?.latest_date ?? null,
      snapshot_lag_days: snapshotLagDays,
      snapshot_status: snapshotStatus,
      unavailable_sources: unavailableSources,
    },
  };
}

async function updateDailyAnalyticsSnapshot() {
  const snapshot = await rpcGetAdminDashboardStats({
    role: 'system',
    user: {
      id: 'system',
      email: 'system@slogan.app',
      phone: null,
      role: 'admin',
      name: 'system',
      avatar: null,
    },
  } as AuthContext);

  await executeSQL(
    `
      INSERT INTO analytics_daily (
        date,
        new_users_count,
        active_users_count,
        total_users_count,
        admin_users_count,
        total_albums_count,
        new_albums_count,
        expired_albums_count,
        tipping_enabled_albums_count,
        total_photos_count,
        new_photos_count,
        public_photos_count,
        private_photos_count,
        total_photo_views,
        total_photo_likes,
        total_photo_comments,
        total_bookings_count,
        new_bookings_count,
        pending_bookings_count,
        confirmed_bookings_count,
        finished_bookings_count,
        cancelled_bookings_count,
        total_poses_count,
        new_poses_count,
        total_pose_tags_count,
        total_pose_views
      ) VALUES (
        ${TODAY_UTC8_EXPR},
        {{new_users_count}},
        {{active_users_count}},
        {{total_users_count}},
        {{admin_users_count}},
        {{total_albums_count}},
        {{new_albums_count}},
        {{expired_albums_count}},
        {{tipping_enabled_albums_count}},
        {{total_photos_count}},
        {{new_photos_count}},
        {{public_photos_count}},
        {{private_photos_count}},
        {{total_photo_views}},
        {{total_photo_likes}},
        {{total_photo_comments}},
        {{total_bookings_count}},
        {{new_bookings_count}},
        {{pending_bookings_count}},
        {{confirmed_bookings_count}},
        {{finished_bookings_count}},
        {{cancelled_bookings_count}},
        {{total_poses_count}},
        {{new_poses_count}},
        {{total_pose_tags_count}},
        {{total_pose_views}}
      )
      ON DUPLICATE KEY UPDATE
        new_users_count = VALUES(new_users_count),
        active_users_count = VALUES(active_users_count),
        total_users_count = VALUES(total_users_count),
        admin_users_count = VALUES(admin_users_count),
        total_albums_count = VALUES(total_albums_count),
        new_albums_count = VALUES(new_albums_count),
        expired_albums_count = VALUES(expired_albums_count),
        tipping_enabled_albums_count = VALUES(tipping_enabled_albums_count),
        total_photos_count = VALUES(total_photos_count),
        new_photos_count = VALUES(new_photos_count),
        public_photos_count = VALUES(public_photos_count),
        private_photos_count = VALUES(private_photos_count),
        total_photo_views = VALUES(total_photo_views),
        total_photo_likes = VALUES(total_photo_likes),
        total_photo_comments = VALUES(total_photo_comments),
        total_bookings_count = VALUES(total_bookings_count),
        new_bookings_count = VALUES(new_bookings_count),
        pending_bookings_count = VALUES(pending_bookings_count),
        confirmed_bookings_count = VALUES(confirmed_bookings_count),
        finished_bookings_count = VALUES(finished_bookings_count),
        cancelled_bookings_count = VALUES(cancelled_bookings_count),
        total_poses_count = VALUES(total_poses_count),
        new_poses_count = VALUES(new_poses_count),
        total_pose_tags_count = VALUES(total_pose_tags_count),
        total_pose_views = VALUES(total_pose_views)
    `,
    {
      new_users_count: snapshot.users.new_today,
      active_users_count: snapshot.users.active_today,
      total_users_count: snapshot.users.total,
      admin_users_count: snapshot.users.admins,
      total_albums_count: snapshot.albums.total,
      new_albums_count: snapshot.albums.new_today,
      expired_albums_count: snapshot.albums.expired,
      tipping_enabled_albums_count: snapshot.albums.tipping_enabled,
      total_photos_count: snapshot.photos.total,
      new_photos_count: snapshot.photos.new_today,
      public_photos_count: snapshot.photos.public,
      private_photos_count: snapshot.photos.private,
      total_photo_views: snapshot.photos.total_views,
      total_photo_likes: snapshot.photos.total_likes,
      total_photo_comments: snapshot.photos.total_comments,
      total_bookings_count: snapshot.bookings.total,
      new_bookings_count: snapshot.bookings.new_today,
      pending_bookings_count: snapshot.bookings.pending,
      confirmed_bookings_count: snapshot.bookings.confirmed,
      finished_bookings_count: snapshot.bookings.finished,
      cancelled_bookings_count: snapshot.bookings.cancelled,
      total_poses_count: snapshot.poses.total,
      new_poses_count: snapshot.poses.new_today,
      total_pose_tags_count: snapshot.poses.total_tags,
      total_pose_views: snapshot.poses.total_views,
    }
  );
}

interface DailyTrendSnapshot {
  date: string;
  new_users_count: number;
  active_users_count: number;
  new_bookings_count: number;
}

async function queryDailyTrendSnapshotByDate(
  targetDate: string,
  hasUserActiveLogsTable: boolean
): Promise<DailyTrendSnapshot> {
  const safeTargetDate = String(targetDate || '').trim();
  if (!safeTargetDate) {
    throw new Error('缺少趋势快照日期');
  }

  const [newUsersCount, activeUsersCount, newBookingsCount] = await runScalarQueryTasks(
    [
      {
        sql: 'SELECT COUNT(*) AS value FROM profiles WHERE DATE(created_at) = {{target_date}}',
        values: { target_date: safeTargetDate },
      },
      {
        sql: hasUserActiveLogsTable
          ? 'SELECT COUNT(DISTINCT user_id) AS value FROM user_active_logs WHERE active_date = {{target_date}}'
          : 'SELECT 0 AS value',
        values: { target_date: safeTargetDate },
      },
      {
        sql: 'SELECT COUNT(*) AS value FROM bookings WHERE DATE(created_at) = {{target_date}}',
        values: { target_date: safeTargetDate },
      },
    ],
    3
  );

  return {
    date: safeTargetDate,
    new_users_count: newUsersCount,
    active_users_count: activeUsersCount,
    new_bookings_count: newBookingsCount,
  };
}

async function upsertDailyTrendSnapshot(snapshot: DailyTrendSnapshot): Promise<void> {
  await executeSQL(
    `
      INSERT INTO analytics_daily (
        date,
        new_users_count,
        active_users_count,
        new_bookings_count
      ) VALUES (
        {{target_date}},
        {{new_users_count}},
        {{active_users_count}},
        {{new_bookings_count}}
      )
      ON DUPLICATE KEY UPDATE
        new_users_count = VALUES(new_users_count),
        active_users_count = VALUES(active_users_count),
        new_bookings_count = VALUES(new_bookings_count)
    `,
    {
      target_date: snapshot.date,
      new_users_count: snapshot.new_users_count,
      active_users_count: snapshot.active_users_count,
      new_bookings_count: snapshot.new_bookings_count,
    }
  );
}

async function backfillRecentAnalyticsTrendSnapshots(windowDays: number = 7): Promise<{
  backfilled_days: number;
  backfilled_dates: string[];
}> {
  const safeWindowDays = Math.max(1, Math.floor(Number(windowDays) || 0));
  if (safeWindowDays <= 1) {
    return {
      backfilled_days: 0,
      backfilled_dates: [],
    };
  }

  const existingRows = (
    await executeSQL(
      `
        SELECT DATE_FORMAT(date, '%Y-%m-%d') AS date
        FROM analytics_daily
        WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${safeWindowDays - 1} DAY)
        ORDER BY date ASC
      `
    )
  ).rows;
  const existingDateSet = new Set(
    existingRows
      .map((row) => String(row?.date ?? '').trim())
      .filter(Boolean)
  );
  const hasUserActiveLogsTable = await hasTable('user_active_logs');
  const backfilledDates: string[] = [];

  for (let offsetDays = safeWindowDays - 1; offsetDays >= 1; offsetDays -= 1) {
    const targetDate = getDateTextUTC8(offsetDays);
    const snapshot = await queryDailyTrendSnapshotByDate(targetDate, hasUserActiveLogsTable);
    await upsertDailyTrendSnapshot(snapshot);
    if (!existingDateSet.has(targetDate)) {
      backfilledDates.push(targetDate);
    }
  }

  return {
    backfilled_days: backfilledDates.length,
    backfilled_dates: backfilledDates,
  };
}

async function cleanupExpiredData() {
  const storageCleanupWarnings: string[] = [];
  const deleteChunkSize = 200;

  const expiredPhotoAssets = await executeSQL(
    `
      SELECT p.id, p.url, p.thumbnail_url, p.preview_url, p.original_url
      FROM album_photos p
      JOIN albums a ON a.id = p.album_id
      WHERE p.album_id <> {{wall_album_id}}
        AND COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR}
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
    }
  );

  const photoRows = expiredPhotoAssets.rows.map((row) => ({
    id: String(row.id ?? '').trim(),
    url: String(row.url ?? '').trim(),
    thumbnail_url: String(row.thumbnail_url ?? '').trim(),
    preview_url: String(row.preview_url ?? '').trim(),
    original_url: String(row.original_url ?? '').trim(),
  })).filter((row) => row.id);

  const photoIds = Array.from(new Set(photoRows.map((row) => row.id)));
  let deletedPhotosCount = 0;
  let deletedPhotoStorageTargetsCount = 0;

  if (photoIds.length > 0) {
    for (let i = 0; i < photoIds.length; i += deleteChunkSize) {
      const chunk = photoIds.slice(i, i + deleteChunkSize);
      const placeholders: string[] = [];
      const values: Record<string, unknown> = {};
      chunk.forEach((id, index) => {
        const key = `expired_photo_id_${i}_${index}`;
        placeholders.push(`{{${key}}}`);
        values[key] = id;
      });

      const deleteResult = await executeSQL(
        `
          DELETE p
          FROM album_photos p
          JOIN albums a ON a.id = p.album_id
          WHERE p.id IN (${placeholders.join(', ')})
            AND p.album_id <> {{wall_album_id}}
            AND COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR}
        `,
        {
          ...values,
          wall_album_id: SYSTEM_WALL_ALBUM_ID,
        }
      );
      deletedPhotosCount += deleteResult.affectedRows;
    }
  }

  const existingPhotoIdSet = new Set<string>();
  if (photoIds.length > 0) {
    for (let i = 0; i < photoIds.length; i += deleteChunkSize) {
      const chunk = photoIds.slice(i, i + deleteChunkSize);
      const placeholders: string[] = [];
      const values: Record<string, unknown> = {};
      chunk.forEach((id, index) => {
        const key = `remaining_photo_id_${i}_${index}`;
        placeholders.push(`{{${key}}}`);
        values[key] = id;
      });

      const remainingRows = await executeSQL(
        `
          SELECT id
          FROM album_photos
          WHERE id IN (${placeholders.join(', ')})
        `,
        values
      );
      remainingRows.rows.forEach((row) => {
        const id = String(row.id ?? '').trim();
        if (id) {
          existingPhotoIdSet.add(id);
        }
      });
    }
  }

  const photoDeleteTargets = new Set<string>();
  photoRows.forEach((row) => {
    if (existingPhotoIdSet.has(row.id)) {
      return;
    }
    [row.url, row.thumbnail_url, row.preview_url, row.original_url]
      .filter(Boolean)
      .forEach((item) => photoDeleteTargets.add(item));
  });
  deletedPhotoStorageTargetsCount = photoDeleteTargets.size;

  if (photoDeleteTargets.size > 0) {
    try {
      await deleteCloudBaseObjects(Array.from(photoDeleteTargets));
    } catch (error) {
      storageCleanupWarnings.push(
        `清理过期照片存储文件失败：${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  const deletedFolders = await executeSQL(
    `
      DELETE FROM album_folders
      WHERE id NOT IN (
        SELECT folder_id
        FROM album_photos
        WHERE !(folder_id <=> NULL)
      )
      AND created_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 24 HOUR)
    `
  );

  const expiredAlbumAssets = await executeSQL(
    `
      SELECT id, cover_url, donation_qr_code_url
      FROM albums
      WHERE COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR}
        AND id <> {{wall_album_id}}
        AND id NOT IN (
          SELECT album_id
          FROM album_photos
        )
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
    }
  );

  const albumRows = expiredAlbumAssets.rows.map((row) => ({
    id: String(row.id ?? '').trim(),
    cover_url: String(row.cover_url ?? '').trim(),
    donation_qr_code_url: String(row.donation_qr_code_url ?? '').trim(),
  })).filter((row) => row.id);

  const albumIds = Array.from(new Set(albumRows.map((row) => row.id)));
  let deletedAlbumsCount = 0;
  let deletedAlbumStorageTargetsCount = 0;

  if (albumIds.length > 0) {
    for (let i = 0; i < albumIds.length; i += deleteChunkSize) {
      const chunk = albumIds.slice(i, i + deleteChunkSize);
      const placeholders: string[] = [];
      const values: Record<string, unknown> = {};
      chunk.forEach((id, index) => {
        const key = `expired_album_id_${i}_${index}`;
        placeholders.push(`{{${key}}}`);
        values[key] = id;
      });

      const deleteResult = await executeSQL(
        `
          DELETE FROM albums
          WHERE id IN (${placeholders.join(', ')})
            AND COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < ${NOW_UTC8_EXPR}
            AND id <> {{wall_album_id}}
            AND id NOT IN (
              SELECT album_id
              FROM album_photos
            )
        `,
        {
          ...values,
          wall_album_id: SYSTEM_WALL_ALBUM_ID,
        }
      );
      deletedAlbumsCount += deleteResult.affectedRows;
    }
  }

  const existingAlbumIdSet = new Set<string>();
  if (albumIds.length > 0) {
    for (let i = 0; i < albumIds.length; i += deleteChunkSize) {
      const chunk = albumIds.slice(i, i + deleteChunkSize);
      const placeholders: string[] = [];
      const values: Record<string, unknown> = {};
      chunk.forEach((id, index) => {
        const key = `remaining_album_id_${i}_${index}`;
        placeholders.push(`{{${key}}}`);
        values[key] = id;
      });

      const remainingRows = await executeSQL(
        `
          SELECT id
          FROM albums
          WHERE id IN (${placeholders.join(', ')})
        `,
        values
      );
      remainingRows.rows.forEach((row) => {
        const id = String(row.id ?? '').trim();
        if (id) {
          existingAlbumIdSet.add(id);
        }
      });
    }
  }

  const albumDeleteTargets = new Set<string>();
  albumRows.forEach((row) => {
    if (existingAlbumIdSet.has(row.id)) {
      return;
    }
    [row.cover_url, row.donation_qr_code_url]
      .filter(Boolean)
      .forEach((item) => albumDeleteTargets.add(item));
  });
  deletedAlbumStorageTargetsCount = albumDeleteTargets.size;

  if (albumDeleteTargets.size > 0) {
    try {
      await deleteCloudBaseObjects(Array.from(albumDeleteTargets));
    } catch (error) {
      storageCleanupWarnings.push(
        `清理过期相册存储文件失败：${error instanceof Error ? error.message : '未知错误'}`
      );
    }
  }

  return {
    deleted_photos: deletedPhotosCount,
    deleted_folders: deletedFolders.affectedRows,
    deleted_albums: deletedAlbumsCount,
    deleted_storage_files: deletedPhotoStorageTargetsCount + deletedAlbumStorageTargetsCount,
    storage_cleanup_failed: storageCleanupWarnings.length > 0,
    storage_cleanup_warnings: storageCleanupWarnings,
    timestamp: new Date().toISOString(),
  };
}

async function rpcRunMaintenanceTasks(context: AuthContext) {
  requireAdmin(context);

  const IP_REGISTRATION_ATTEMPT_RETENTION_DAYS = 7;
  const PHOTO_VIEW_RETENTION_DAYS = 90;
  const PASSWORD_RESET_TOKEN_RETENTION_DAYS = 30;
  const USER_ACTIVE_LOG_RETENTION_DAYS = 365;
  const ANALYTICS_DAILY_RETENTION_DAYS = 365 * 5;
  const SLIDER_CAPTCHA_RETENTION_DAYS = 1;
  const SLIDER_CAPTCHA_GRACE_MINUTES = 2;

  const skippedTasks = new Set<string>();
  const cleanupResult = await cleanupExpiredData();

  const sessionsResult = await executeSQL(
    `
      DELETE FROM user_sessions
      WHERE expires_at < UTC_TIMESTAMP() OR is_revoked = 1
    `
  );

  const ipAttemptsResult = await executeSQL(
    `
      DELETE FROM ip_registration_attempts
      WHERE attempted_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${IP_REGISTRATION_ATTEMPT_RETENTION_DAYS} DAY)
    `
  );

  let betaFeatureBindingsCleaned = 0;
  const hasBetaFeatureTables = await Promise.all([
    hasTable('user_beta_feature_bindings'),
    hasTable('feature_beta_versions'),
    hasTable('feature_beta_routes'),
  ]);
  if (hasBetaFeatureTables.every(Boolean)) {
    const betaBindingCleanupResult = await executeSQL(
      `
        DELETE b
        FROM user_beta_feature_bindings b
        LEFT JOIN feature_beta_versions v ON v.id = b.feature_id
        LEFT JOIN feature_beta_routes r ON r.id = v.route_id
        WHERE (v.id <=> NULL)
          OR (r.id <=> NULL)
          OR v.is_active <> 1
          OR r.is_active <> 1
          OR (!(v.expires_at <=> NULL) AND v.expires_at < ${NOW_UTC8_EXPR})
      `
    );
    betaFeatureBindingsCleaned = betaBindingCleanupResult.affectedRows;
  } else {
    skippedTasks.add('beta_feature_bindings_cleanup');
  }

  const photoViewsCleanupResult = await executeSQL(
    `
      DELETE FROM photo_views
      WHERE viewed_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${PHOTO_VIEW_RETENTION_DAYS} DAY)
    `
  );

  const passwordResetTokenCleanupResult = await executeSQL(
    `
      DELETE FROM password_reset_tokens
      WHERE expires_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${PASSWORD_RESET_TOKEN_RETENTION_DAYS} DAY)
        OR (
          !(used_at <=> NULL)
          AND used_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${PASSWORD_RESET_TOKEN_RETENTION_DAYS} DAY)
        )
    `
  );

  const userActiveLogCleanupResult = await executeSQL(
    `
      DELETE FROM user_active_logs
      WHERE active_date < DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${USER_ACTIVE_LOG_RETENTION_DAYS} DAY)
    `
  );

  let sliderCaptchaChallengesCleaned = 0;
  if (await hasTable('slider_captcha_challenges')) {
    const sliderCaptchaCleanupResult = await executeSQL(
      `
        DELETE FROM slider_captcha_challenges
        WHERE !(consumed_at <=> NULL)
          OR expires_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${SLIDER_CAPTCHA_GRACE_MINUTES} MINUTE)
          OR (
            !(verify_token_expires_at <=> NULL)
            AND verify_token_expires_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${SLIDER_CAPTCHA_GRACE_MINUTES} MINUTE)
          )
          OR created_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL ${SLIDER_CAPTCHA_RETENTION_DAYS} DAY)
      `
    );
    sliderCaptchaChallengesCleaned = sliderCaptchaCleanupResult.affectedRows;
  } else {
    skippedTasks.add('slider_captcha_challenges_cleanup');
  }

  let bookingBlackoutsCleaned = 0;
  if (await hasTable('booking_blackouts')) {
    const bookingBlackoutCleanupResult = await executeSQL(
      `
        DELETE FROM booking_blackouts
        WHERE date < ${TODAY_UTC8_EXPR}
      `
    );
    bookingBlackoutsCleaned = bookingBlackoutCleanupResult.affectedRows;
  } else {
    skippedTasks.add('booking_blackouts_cleanup');
  }

  let analyticsDailyCleaned = 0;
  let analyticsUpdated = false;
  let analyticsSnapshotsBackfilled = 0;
  let analyticsBackfilledDates: string[] = [];
  const hasAnalyticsDailyTable = await hasTable('analytics_daily');
  if (hasAnalyticsDailyTable) {
    const analyticsDailyCleanupResult = await executeSQL(
      `
        DELETE FROM analytics_daily
        WHERE date < DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL ${ANALYTICS_DAILY_RETENTION_DAYS} DAY)
      `
    );
    analyticsDailyCleaned = analyticsDailyCleanupResult.affectedRows;
  } else {
    skippedTasks.add('analytics_daily_cleanup');
    skippedTasks.add('analytics_snapshot_update');
  }

  await executeSQL(
    `
      UPDATE bookings
      SET status = 'in_progress'
      WHERE status = 'confirmed'
        AND booking_date = ${TODAY_UTC8_EXPR}
    `
  );

  await executeSQL(
    `
      UPDATE bookings
      SET status = 'finished'
      WHERE status IN ('pending', 'confirmed', 'in_progress')
        AND booking_date < ${TODAY_UTC8_EXPR}
    `
  );

  if (hasAnalyticsDailyTable) {
    await updateDailyAnalyticsSnapshot();
    const analyticsBackfillResult = await backfillRecentAnalyticsTrendSnapshots(7);
    analyticsSnapshotsBackfilled = analyticsBackfillResult.backfilled_days;
    analyticsBackfilledDates = analyticsBackfillResult.backfilled_dates;
    analyticsUpdated = true;
  }

  return {
    cleanup_result: cleanupResult,
    sessions_cleaned: sessionsResult.affectedRows,
    ip_attempts_cleaned: ipAttemptsResult.affectedRows,
    beta_feature_bindings_cleaned: betaFeatureBindingsCleaned,
    photo_views_cleaned: photoViewsCleanupResult.affectedRows,
    password_reset_tokens_cleaned: passwordResetTokenCleanupResult.affectedRows,
    user_active_logs_cleaned: userActiveLogCleanupResult.affectedRows,
    slider_captcha_challenges_cleaned: sliderCaptchaChallengesCleaned,
    booking_blackouts_cleaned: bookingBlackoutsCleaned,
    analytics_daily_cleaned: analyticsDailyCleaned,
    analytics_snapshots_backfilled: analyticsSnapshotsBackfilled,
    analytics_backfilled_dates: analyticsBackfilledDates,
    skipped_tasks: Array.from(skippedTasks),
    safety_history_retention: {
      ip_registration_attempts_days: IP_REGISTRATION_ATTEMPT_RETENTION_DAYS,
      photo_views_days: PHOTO_VIEW_RETENTION_DAYS,
      password_reset_tokens_days: PASSWORD_RESET_TOKEN_RETENTION_DAYS,
      user_active_logs_days: USER_ACTIVE_LOG_RETENTION_DAYS,
      analytics_daily_days: ANALYTICS_DAILY_RETENTION_DAYS,
      slider_captcha_challenges_days: SLIDER_CAPTCHA_RETENTION_DAYS,
      booking_blackouts_policy: 'delete_before_today',
    },
    bookings_updated: true,
    analytics_updated: analyticsUpdated,
    timestamp: new Date().toISOString(),
  };
}

export async function executeRpc(functionName: string, args: Record<string, unknown> = {}, context: AuthContext): Promise<RpcExecuteResult> {
  try {
    let data: any = null;

    switch (functionName) {
      case 'get_public_gallery':
        data = await rpcGetPublicGallery(args, context);
        break;
      case 'get_album_content':
        data = await rpcGetAlbumContent(args);
        break;
      case 'get_album_photo_page':
        data = await rpcGetAlbumPhotoPage(args);
        break;
      case 'bind_user_to_album':
        data = await rpcBindUserToAlbum(args, context);
        break;
      case 'get_user_bound_albums':
        data = await rpcGetUserBoundAlbums(context);
        break;
      case 'bind_user_to_beta_feature':
        data = await rpcBindUserToBetaFeature(args, context);
        break;
      case 'get_user_beta_features':
        data = await rpcGetUserBetaFeatures(context);
        break;
      case 'check_user_beta_feature_access':
        data = await rpcCheckUserBetaFeatureAccess(args, context);
        break;
      case 'unbind_user_from_album':
        data = await rpcUnbindUserFromAlbum(args, context);
        break;
      case 'pin_photo_to_wall':
        data = await rpcPinPhotoToWall(args);
        break;
      case 'delete_album_photo':
        data = await rpcDeleteAlbumPhoto(args);
        break;
      case 'post_album_comment':
        data = await rpcPostAlbumComment(args, context);
        break;
      case 'like_photo':
        data = await rpcLikePhoto(args, context);
        break;
      case 'increment_photo_view':
        data = await rpcIncrementPhotoView(args, context);
        break;
      case 'increment_photo_download':
        data = await rpcIncrementPhotoDownload(args);
        break;
      case 'check_date_availability':
        data = await rpcCheckDateAvailability(args);
        break;
      case 'validate_city':
        data = await rpcValidateCity(args);
        break;
      case 'increment_pose_view':
        data = await rpcIncrementPoseView(args);
        break;
      case 'batch_increment_pose_views':
        data = await rpcBatchIncrementPoseViews(args);
        break;
      case 'get_random_poses_batch':
        data = await rpcGetRandomPosesBatch(args);
        break;
      case 'log_user_activity':
        data = await rpcLogUserActivity(context);
        break;
      case 'get_admin_dashboard_stats':
        data = await rpcGetAdminDashboardStats(context);
        break;
      case 'run_maintenance_tasks':
        data = await rpcRunMaintenanceTasks(context);
        break;
      default:
        throw new Error(`未实现的 RPC：${functionName}`);
    }

    return {
      data,
      error: null,
    };
  } catch (error) {
    if (process.env.NODE_ENV !== 'production' && isRetryableSqlError(error)) {
      console.warn('[cloudbase.rpc.transient]', { functionName, raw: extractErrorMessage(error) });
    }
    const normalizedError = normalizeRpcError(error, 'RPC 调用失败');
    return {
      data: null,
      error: normalizedError,
    };
  }
}
