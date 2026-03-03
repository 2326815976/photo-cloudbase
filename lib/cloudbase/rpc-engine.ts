import 'server-only';

import { Buffer } from 'buffer';
import { randomUUID } from 'crypto';
import { AuthContext } from '@/lib/auth/types';
import { deleteCloudBaseObjects, uploadFileToCloudBase } from '@/lib/cloudbase/storage';
import { hydrateCloudBaseTempUrlsInRows } from '@/lib/cloudbase/storage-url';
import { normalizeAccessKey } from '@/lib/utils/access-key';
import { executeSQL } from './sql-executor';

interface RpcExecuteResult {
  data: any;
  error: { message: string; code?: string } | null;
}

const BETA_FEATURE_CODE_LENGTH = 8;

function normalizeRpcError(error: unknown, fallback: string): { message: string; code?: string } {
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
  return {
    id: photoId,
    folder_id: row.folder_id ? String(row.folder_id) : null,
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
const WALL_THUMBNAIL_MAX_WIDTH = 1280;
const WALL_PREVIEW_MAX_WIDTH = 2560;
const WALL_THUMBNAIL_QUALITY = 82;
const WALL_PREVIEW_QUALITY = 92;
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

let sharpModulePromise: Promise<any> | null = null;

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
  } catch {
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
  } catch {
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
  } catch {
    exists = false;
  }

  albumPhotoDownloadCountColumnCache = {
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

function buildWallStorageKey(sourcePhotoId: string, kind: 'thumb' | 'preview'): string {
  const token = getSafeWallSourceToken(sourcePhotoId);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 8);
  return `wall/${token}_${Date.now()}_${suffix}_${kind}.webp`;
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
    source.url,
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
  const photoOrderBy = hasShotDateColumn
    ? 'COALESCE(p.sort_order, 2147483647) ASC, COALESCE(p.shot_date, DATE(p.created_at)) DESC, p.created_at DESC'
    : 'COALESCE(p.sort_order, 2147483647) ASC, p.created_at DESC';
  const folderFilter = resolveAlbumFolderFilter(args.folder_id);
  const wallValues: Record<string, unknown> = {
    wall_album_id: SYSTEM_WALL_ALBUM_ID,
    ...folderFilter.params,
  };

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
      SELECT id, name
      FROM album_folders
      WHERE album_id = {{wall_album_id}}
      ORDER BY created_at DESC
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
    }
  );

  let photos: Record<string, any>[] = [];
  if (context.user?.id) {
    const result = await executeSQL(
      `
        SELECT
          p.id,
          COALESCE(p.thumbnail_url, p.url) AS thumbnail_url,
          COALESCE(p.preview_url, p.url) AS preview_url,
          COALESCE(p.original_url, p.preview_url, p.url) AS original_url,
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
    photos = result.rows;
  } else {
    const result = await executeSQL(
      `
        SELECT
          p.id,
          COALESCE(p.thumbnail_url, p.url) AS thumbnail_url,
          COALESCE(p.preview_url, p.url) AS preview_url,
          COALESCE(p.original_url, p.preview_url, p.url) AS original_url,
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
    photos = result.rows;
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

  await hydrateCloudBaseTempUrlsInRows(photos, ['thumbnail_url', 'preview_url', 'original_url']);

  return {
    photos: photos.map((row) => ({
      ...row,
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
      String(wallMetaRow?.root_folder_name ?? '').trim() || '照片集',
    folders: foldersResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
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
  const shotDateSelect = hasShotDateColumn ? 'shot_date' : 'NULL AS shot_date';
  const shotLocationSelect = hasShotLocationColumn
    ? 'shot_location'
    : 'NULL AS shot_location';
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
      SELECT id, name
      FROM album_folders
      WHERE album_id = {{album_id}}
      ORDER BY created_at DESC
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
          COALESCE(thumbnail_url, url) AS thumbnail_url,
          COALESCE(preview_url, url) AS preview_url,
          COALESCE(original_url, url) AS original_url,
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
    await hydrateCloudBaseTempUrlsInRows(photoRows, ['thumbnail_url', 'preview_url', 'original_url']);

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
      enable_tipping: toBoolean(album.enable_tipping),
      enable_welcome_letter: album.enable_welcome_letter === null ? true : toBoolean(album.enable_welcome_letter),
      donation_qr_code_url: normalizeMaybeUrlText(album.donation_qr_code_url),
      recipient_name: album.recipient_name ?? '拾光者',
      created_at: album.created_at,
      expires_at: album.effective_expires_at,
      is_expired: toBoolean(album.is_expired),
    },
    folders: foldersResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
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
        COALESCE(p.thumbnail_url, p.url) AS thumbnail_url,
        COALESCE(p.preview_url, p.url) AS preview_url,
        COALESCE(p.original_url, p.url) AS original_url,
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
  await hydrateCloudBaseTempUrlsInRows(photosResult.rows, ['thumbnail_url', 'preview_url', 'original_url']);

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
  const shotDateSelect = hasShotDateColumn ? 'p.shot_date AS shot_date' : 'NULL AS shot_date';
  const shotLocationSelect = hasShotLocationColumn
    ? 'p.shot_location AS shot_location'
    : 'NULL AS shot_location';

  const result = await executeSQL(
    `
      SELECT
        p.id,
        p.album_id,
        p.url,
        p.thumbnail_url,
        p.preview_url,
        p.original_url,
        p.width,
        p.height,
        p.blurhash,
        p.story_text,
        p.is_highlight,
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

  const sourceToken = getSafeWallSourceToken(photoId);
  const sourcePattern = `%/wall/${sourceToken}_%`;

  const existingWallResult = await executeSQL(
    `
      SELECT id, url, thumbnail_url, preview_url, original_url
      FROM album_photos
      WHERE album_id = {{wall_album_id}}
        AND (
          thumbnail_url LIKE {{source_pattern}}
          OR preview_url LIKE {{source_pattern}}
          OR url LIKE {{source_pattern}}
        )
      ORDER BY created_at DESC
      LIMIT 1
    `,
    {
      wall_album_id: SYSTEM_WALL_ALBUM_ID,
      source_pattern: sourcePattern,
    }
  );
  const existingWall = existingWallResult.rows[0];

  if (existingWall) {
    const deleteTargets = [
      String(existingWall.thumbnail_url ?? '').trim(),
      String(existingWall.preview_url ?? '').trim(),
      String(existingWall.original_url ?? '').trim(),
      String(existingWall.url ?? '').trim(),
    ].filter(Boolean);

    if (deleteTargets.length > 0) {
      await deleteCloudBaseObjects(deleteTargets);
    }

    await executeSQL(
      `
        DELETE FROM album_photos
        WHERE id = {{id}}
        LIMIT 1
      `,
      {
        id: String(existingWall.id),
      }
    );

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
      id: randomUUID(),
      album_id: SYSTEM_WALL_ALBUM_ID,
      url: previewUpload.downloadUrl,
      thumbnail_url: thumbnailUpload.downloadUrl,
      preview_url: previewUpload.downloadUrl,
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
          url,
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
          NULL,
          {{url}},
          {{thumbnail_url}},
          {{preview_url}},
          NULL,
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
    await deleteCloudBaseObjects([
      thumbnailUpload.downloadUrl,
      previewUpload.downloadUrl,
    ]);
    throw insertError;
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
      SELECT p.id, p.thumbnail_url, p.preview_url, p.original_url, p.url
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
    String(targetRow.thumbnail_url ?? '').trim(),
    String(targetRow.preview_url ?? '').trim(),
    String(targetRow.original_url ?? '').trim(),
    String(targetRow.url ?? '').trim(),
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
  if (!photoId) {
    throw new Error('参数错误');
  }

  const isAdminViewer = context.role === 'admin' || context.user?.role === 'admin';
  let alreadyViewed = true;

  if (!isAdminViewer) {
    if (context.user?.id) {
      const viewed = await executeSQL(
        `
          SELECT id
          FROM photo_views
          WHERE photo_id = {{photo_id}} AND user_id = {{user_id}}
          LIMIT 1
        `,
        {
          photo_id: photoId,
          user_id: context.user.id,
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
  }

  let counted = false;
  if (!alreadyViewed) {
    try {
      await executeSQL(
        `
          INSERT INTO photo_views (id, photo_id, user_id, session_id, viewed_at)
          VALUES ({{id}}, {{photo_id}}, {{user_id}}, {{session_id}}, ${NOW_UTC8_EXPR})
        `,
        {
          id: randomUUID(),
          photo_id: photoId,
          user_id: context.user?.id ?? null,
          session_id: context.user?.id ? null : (sessionId || null),
        }
      );

      await executeSQL(
        `
          UPDATE album_photos
          SET view_count = view_count + 1
          WHERE id = {{photo_id}}
        `,
        {
          photo_id: photoId,
        }
      );
      counted = true;
    } catch {
      counted = false;
    }
  }

  const countResult = await executeSQL(
    `
      SELECT view_count
      FROM album_photos
      WHERE id = {{photo_id}}
      LIMIT 1
    `,
    {
      photo_id: photoId,
    }
  );

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

async function runScalarQueryTasks(tasks: ScalarQueryTask[], concurrency: number = 6): Promise<number[]> {
  const safeConcurrency = Math.max(1, concurrency);
  const values: number[] = [];

  for (let index = 0; index < tasks.length; index += safeConcurrency) {
    const chunk = tasks.slice(index, index + safeConcurrency);
    const chunkValues = await Promise.all(
      chunk.map((task) => scalar(task.sql, task.values ?? {}, task.key ?? 'value'))
    );
    values.push(...chunkValues);
  }

  return values;
}

async function rpcGetAdminDashboardStats(context: AuthContext) {
  requireAdmin(context);

  const scalarTasks: ScalarQueryTask[] = [
    { sql: 'SELECT COUNT(*) AS value FROM profiles' },
    { sql: "SELECT COUNT(*) AS value FROM profiles WHERE role = 'admin'" },
    { sql: "SELECT COUNT(*) AS value FROM profiles WHERE role = 'user'" },
    { sql: `SELECT COUNT(*) AS value FROM profiles WHERE DATE(created_at) = ${TODAY_UTC8_EXPR}` },
    { sql: `SELECT COUNT(DISTINCT user_id) AS value FROM user_active_logs WHERE active_date = ${TODAY_UTC8_EXPR}` },
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
    { sql: 'SELECT COUNT(*) AS value FROM photo_comments' },
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
    { sql: 'SELECT COUNT(*) AS value FROM pose_tags' },
    { sql: 'SELECT COUNT(*) AS value FROM allowed_cities WHERE is_active = 1' },
    { sql: `SELECT COUNT(*) AS value FROM booking_blackouts WHERE date >= ${TODAY_UTC8_EXPR}` },
    { sql: 'SELECT COUNT(*) AS value FROM app_releases' },
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
  ] = await runScalarQueryTasks(scalarTasks, 6);

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
  } catch {
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
  } catch {
    photosHighlighted = 0;
  }

  const bookingsTypesResult = await executeSQL(
    `
      SELECT bt.name AS type_name, COUNT(b.id) AS count
      FROM booking_types bt
      LEFT JOIN bookings b ON b.type_id = bt.id
      GROUP BY bt.id, bt.name
      ORDER BY bt.id ASC
    `
  );

  const topTagsResult = await executeSQL(
    `
      SELECT name AS tag_name, usage_count
      FROM pose_tags
      ORDER BY usage_count DESC
      LIMIT 10
    `
  );

  const latestReleaseResult = await executeSQL(
    `
      SELECT version, platform, created_at
      FROM app_releases
      ORDER BY created_at DESC
      LIMIT 1
    `
  );

  const trendUsersResult = await executeSQL(
    `
      SELECT date, new_users_count AS count
      FROM analytics_daily
      WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL 6 DAY)
      ORDER BY date DESC
    `
  );

  const trendActiveUsersResult = await executeSQL(
    `
      SELECT date, active_users_count AS count
      FROM analytics_daily
      WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL 6 DAY)
      ORDER BY date DESC
    `
  );

  const trendBookingsResult = await executeSQL(
    `
      SELECT date, new_bookings_count AS count
      FROM analytics_daily
      WHERE date >= DATE_SUB(${TODAY_UTC8_EXPR}, INTERVAL 6 DAY)
      ORDER BY date DESC
    `
  );

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
      types: bookingsTypesResult.rows.map((row) => ({
        type_name: row.type_name ?? '',
        count: toNumber(row.count, 0),
      })),
    },
    poses: {
      total: posesTotal,
      new_today: posesNewToday,
      total_views: posesTotalViews,
      total_tags: posesTotalTags,
      top_tags: topTagsResult.rows.map((row) => ({
        tag_name: row.tag_name ?? '',
        usage_count: toNumber(row.usage_count, 0),
      })),
    },
    system: {
      total_cities: totalCities,
      total_blackout_dates: totalBlackoutDates,
      total_releases: totalReleases,
      latest_version: latestReleaseResult.rows[0] ?? null,
    },
    trends: {
      daily_new_users: trendUsersResult.rows,
      daily_active_users: trendActiveUsersResult.rows,
      daily_new_bookings: trendBookingsResult.rows,
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

async function cleanupExpiredData() {
  const storageCleanupWarnings: string[] = [];
  const deleteChunkSize = 200;

  const expiredPhotoAssets = await executeSQL(
    `
      SELECT p.id, p.thumbnail_url, p.preview_url, p.original_url, p.url
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
    thumbnail_url: String(row.thumbnail_url ?? '').trim(),
    preview_url: String(row.preview_url ?? '').trim(),
    original_url: String(row.original_url ?? '').trim(),
    url: String(row.url ?? '').trim(),
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
    [row.thumbnail_url, row.preview_url, row.original_url, row.url]
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
        AND id NOT IN (
          SELECT album_id
          FROM album_photos
        )
    `
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
            AND id NOT IN (
              SELECT album_id
              FROM album_photos
            )
        `,
        values
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
      WHERE attempted_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 7 DAY)
    `
  );

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

  await executeSQL(
    `
      DELETE FROM photo_views
      WHERE viewed_at < DATE_SUB(${NOW_UTC8_EXPR}, INTERVAL 90 DAY)
    `
  );

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

  await updateDailyAnalyticsSnapshot();

  return {
    cleanup_result: cleanupResult,
    sessions_cleaned: sessionsResult.affectedRows,
    ip_attempts_cleaned: ipAttemptsResult.affectedRows,
    beta_feature_bindings_cleaned: betaBindingCleanupResult.affectedRows,
    photo_views_cleaned: true,
    bookings_updated: true,
    analytics_updated: true,
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
    const normalizedError = normalizeRpcError(error, 'RPC 调用失败');
    return {
      data: null,
      error: normalizedError,
    };
  }
}
