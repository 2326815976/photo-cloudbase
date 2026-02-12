import 'server-only';

import { randomUUID } from 'crypto';
import { AuthContext } from '@/lib/auth/types';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';
import { executeSQL } from './sql-executor';

interface RpcExecuteResult {
  data: any;
  error: { message: string; code?: string } | null;
}

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

async function rpcGetPublicGallery(args: Record<string, unknown>, context: AuthContext) {
  const pageNo = Math.max(1, Number(args.page_no ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(args.page_size ?? 20)));
  const offset = (pageNo - 1) * pageSize;

  let photos: Record<string, any>[] = [];
  if (context.user?.id) {
    const result = await executeSQL(
      `
        SELECT
          p.id,
          COALESCE(p.thumbnail_url, p.url) AS thumbnail_url,
          COALESCE(p.preview_url, p.url) AS preview_url,
          p.width,
          p.height,
          p.blurhash,
          p.like_count,
          p.view_count,
          p.created_at,
          CASE WHEN pl.id IS NULL THEN 0 ELSE 1 END AS is_liked
        FROM album_photos p
        LEFT JOIN photo_likes pl
          ON pl.photo_id = p.id
         AND pl.user_id = {{user_id}}
        WHERE p.is_public = 1
        ORDER BY p.created_at DESC
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      {
        user_id: context.user.id,
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
          p.width,
          p.height,
          p.blurhash,
          p.like_count,
          p.view_count,
          p.created_at,
          0 AS is_liked
        FROM album_photos p
        WHERE p.is_public = 1
        ORDER BY p.created_at DESC
        LIMIT {{limit}} OFFSET {{offset}}
      `,
      {
        limit: pageSize,
        offset,
      }
    );
    photos = result.rows;
  }

  const countResult = await executeSQL(
    `
      SELECT COUNT(*) AS total
      FROM album_photos
      WHERE is_public = 1
    `
  );

  return {
    photos: photos.map((row) => ({
      ...row,
      is_liked: toBoolean(row.is_liked),
      like_count: toNumber(row.like_count, 0),
      view_count: toNumber(row.view_count, 0),
      width: toNumber(row.width, 0),
      height: toNumber(row.height, 0),
    })),
    total: toNumber(countResult.rows[0]?.total, 0),
  };
}

async function rpcGetAlbumContent(args: Record<string, unknown>) {
  const inputKey = String(args.input_key ?? '').trim().toUpperCase();
  if (!inputKey) {
    throw new Error('密钥错误');
  }

  const albumResult = await executeSQL(
    `
      SELECT
        id,
        title,
        welcome_letter,
        cover_url,
        enable_tipping,
        enable_welcome_letter,
        donation_qr_code_url,
        recipient_name,
        created_at,
        COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) AS effective_expires_at,
        CASE
          WHEN COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < NOW() THEN 1
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

  const photosResult = await executeSQL(
    `
      SELECT
        id,
        folder_id,
        COALESCE(thumbnail_url, url) AS thumbnail_url,
        COALESCE(preview_url, url) AS preview_url,
        COALESCE(original_url, url) AS original_url,
        width,
        height,
        blurhash,
        is_public,
        rating
      FROM album_photos
      WHERE album_id = {{album_id}}
      ORDER BY created_at DESC
    `,
    {
      album_id: album.id,
    }
  );

  const photoIds = photosResult.rows.map((row) => String(row.id));
  const commentsByPhotoId = new Map<string, Array<Record<string, any>>>();

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

  return {
    album: {
      id: String(album.id),
      title: album.title ?? '',
      welcome_letter: album.welcome_letter ?? '',
      cover_url: album.cover_url ?? null,
      enable_tipping: toBoolean(album.enable_tipping),
      enable_welcome_letter: album.enable_welcome_letter === null ? true : toBoolean(album.enable_welcome_letter),
      donation_qr_code_url: album.donation_qr_code_url ?? null,
      recipient_name: album.recipient_name ?? '拾光者',
      created_at: album.created_at,
      expires_at: album.effective_expires_at,
      is_expired: toBoolean(album.is_expired),
    },
    folders: foldersResult.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name ?? ''),
    })),
    photos: photosResult.rows.map((row) => ({
      id: String(row.id),
      folder_id: row.folder_id ? String(row.folder_id) : null,
      thumbnail_url: row.thumbnail_url ?? null,
      preview_url: row.preview_url ?? null,
      original_url: row.original_url ?? null,
      width: toNumber(row.width, 0),
      height: toNumber(row.height, 0),
      blurhash: row.blurhash ?? null,
      is_public: toBoolean(row.is_public),
      rating: toNumber(row.rating, 0),
      comments: commentsByPhotoId.get(String(row.id)) ?? [],
    })),
  };
}

async function rpcBindUserToAlbum(args: Record<string, unknown>, context: AuthContext) {
  const userId = requireUser(context);
  const accessKey = String(args.p_access_key ?? '').trim().toUpperCase();
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

  await executeSQL(
    `
      INSERT IGNORE INTO user_album_bindings (id, user_id, album_id, created_at)
      VALUES ({{id}}, {{user_id}}, {{album_id}}, NOW())
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
    cover_url: album.cover_url ?? null,
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
          WHEN COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) < NOW() THEN 1
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

  return result.rows.map((row) => ({
    id: String(row.id),
    title: row.title ?? '',
    cover_url: row.cover_url ?? null,
    created_at: row.created_at,
    access_key: row.access_key ?? '',
    bound_at: row.bound_at,
    expires_at: row.expires_at,
    is_expired: toBoolean(row.is_expired),
  }));
}

async function rpcPinPhotoToWall(args: Record<string, unknown>) {
  const accessKey = String(args.p_access_key ?? '').trim().toUpperCase();
  const photoId = String(args.p_photo_id ?? '').trim();

  const result = await executeSQL(
    `
      SELECT p.id
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

  await executeSQL(
    `
      UPDATE album_photos
      SET is_public = CASE WHEN is_public = 1 THEN 0 ELSE 1 END
      WHERE id = {{photo_id}}
    `,
    {
      photo_id: photoId,
    }
  );

  return null;
}

async function rpcDeleteAlbumPhoto(args: Record<string, unknown>) {
  const accessKey = String(args.p_access_key ?? '').trim().toUpperCase();
  const photoId = String(args.p_photo_id ?? '').trim();

  const result = await executeSQL(
    `
      SELECT p.id
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

  await executeSQL(
    `
      DELETE FROM album_photos
      WHERE id = {{photo_id}}
    `,
    {
      photo_id: photoId,
    }
  );

  return null;
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
      VALUES ({{user_id}}, {{photo_id}}, NOW())
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

  let alreadyViewed = true;

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

  let counted = false;
  if (!alreadyViewed) {
    try {
      await executeSQL(
        `
          INSERT INTO photo_views (id, photo_id, user_id, session_id, viewed_at)
          VALUES ({{id}}, {{photo_id}}, {{user_id}}, {{session_id}}, NOW())
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
      VALUES ({{user_id}}, CURRENT_DATE(), NOW())
    `,
    {
      user_id: userId,
    }
  );

  await executeSQL(
    `
      UPDATE profiles
      SET last_active_at = NOW()
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

async function rpcGetAdminDashboardStats(context: AuthContext) {
  requireAdmin(context);

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
  ] = await Promise.all([
    scalar('SELECT COUNT(*) AS value FROM profiles'),
    scalar("SELECT COUNT(*) AS value FROM profiles WHERE role = 'admin'"),
    scalar("SELECT COUNT(*) AS value FROM profiles WHERE role = 'user'"),
    scalar('SELECT COUNT(*) AS value FROM profiles WHERE DATE(created_at) = CURRENT_DATE()'),
    scalar('SELECT COUNT(DISTINCT user_id) AS value FROM user_active_logs WHERE active_date = CURRENT_DATE()'),
    scalar('SELECT COUNT(*) AS value FROM albums'),
    scalar('SELECT COUNT(*) AS value FROM albums WHERE DATE(created_at) = CURRENT_DATE()'),
    scalar('SELECT COUNT(*) AS value FROM albums WHERE COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < NOW()'),
    scalar('SELECT COUNT(*) AS value FROM albums WHERE enable_tipping = 1'),
    scalar('SELECT COUNT(*) AS value FROM album_photos'),
    scalar('SELECT COUNT(*) AS value FROM album_photos WHERE DATE(created_at) = CURRENT_DATE()'),
    scalar('SELECT COUNT(*) AS value FROM album_photos WHERE is_public = 1'),
    scalar('SELECT COUNT(*) AS value FROM album_photos WHERE is_public = 0'),
    scalar('SELECT COALESCE(SUM(view_count), 0) AS value FROM album_photos'),
    scalar('SELECT COALESCE(SUM(like_count), 0) AS value FROM album_photos'),
    scalar('SELECT COUNT(*) AS value FROM photo_comments'),
    scalar('SELECT COALESCE(ROUND(AVG(rating), 2), 0) AS value FROM album_photos WHERE rating > 0'),
    scalar('SELECT COUNT(*) AS value FROM bookings'),
    scalar('SELECT COUNT(*) AS value FROM bookings WHERE DATE(created_at) = CURRENT_DATE()'),
    scalar("SELECT COUNT(*) AS value FROM bookings WHERE status = 'pending'"),
    scalar("SELECT COUNT(*) AS value FROM bookings WHERE status = 'confirmed'"),
    scalar("SELECT COUNT(*) AS value FROM bookings WHERE status = 'finished'"),
    scalar("SELECT COUNT(*) AS value FROM bookings WHERE status = 'cancelled'"),
    scalar("SELECT COUNT(*) AS value FROM bookings WHERE status IN ('pending', 'confirmed') AND booking_date >= CURRENT_DATE()"),
    scalar('SELECT COUNT(*) AS value FROM poses'),
    scalar('SELECT COUNT(*) AS value FROM poses WHERE DATE(created_at) = CURRENT_DATE()'),
    scalar('SELECT COALESCE(SUM(view_count), 0) AS value FROM poses'),
    scalar('SELECT COUNT(*) AS value FROM pose_tags'),
    scalar('SELECT COUNT(*) AS value FROM allowed_cities WHERE is_active = 1'),
    scalar('SELECT COUNT(*) AS value FROM booking_blackouts WHERE date >= CURRENT_DATE()'),
    scalar('SELECT COUNT(*) AS value FROM app_releases'),
  ]);

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
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
      ORDER BY date DESC
    `
  );

  const trendActiveUsersResult = await executeSQL(
    `
      SELECT date, active_users_count AS count
      FROM analytics_daily
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
      ORDER BY date DESC
    `
  );

  const trendBookingsResult = await executeSQL(
    `
      SELECT date, new_bookings_count AS count
      FROM analytics_daily
      WHERE date >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 DAY)
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
      total_comments: photosTotalComments,
      avg_rating: photosAvgRating,
    },
    bookings: {
      total: bookingsTotal,
      new_today: bookingsNewToday,
      pending: bookingsPending,
      confirmed: bookingsConfirmed,
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
        CURRENT_DATE(),
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
  const expiredPhotoAssets = await executeSQL(
    `
      SELECT p.thumbnail_url, p.preview_url, p.original_url, p.url
      FROM album_photos p
      JOIN albums a ON a.id = p.album_id
      WHERE p.is_public = 0
        AND COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) < NOW()
    `
  );

  const photoDeleteTargets = new Set<string>();
  expiredPhotoAssets.rows.forEach((row) => {
    [
      String(row.thumbnail_url ?? '').trim(),
      String(row.preview_url ?? '').trim(),
      String(row.original_url ?? '').trim(),
      String(row.url ?? '').trim(),
    ]
      .filter(Boolean)
      .forEach((item) => photoDeleteTargets.add(item));
  });

  if (photoDeleteTargets.size > 0) {
    await deleteCloudBaseObjects(Array.from(photoDeleteTargets));
  }

  const deletedPhotos = await executeSQL(
    `
      DELETE p
      FROM album_photos p
      JOIN albums a ON a.id = p.album_id
      WHERE p.is_public = 0
        AND COALESCE(a.expires_at, DATE_ADD(a.created_at, INTERVAL 7 DAY)) < NOW()
    `
  );

  const deletedFolders = await executeSQL(
    `
      DELETE FROM album_folders
      WHERE id NOT IN (
        SELECT folder_id
        FROM album_photos
        WHERE folder_id IS NOT NULL
      )
      AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)
    `
  );

  const expiredAlbumAssets = await executeSQL(
    `
      SELECT cover_url, donation_qr_code_url
      FROM albums
      WHERE COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < NOW()
        AND id NOT IN (
          SELECT album_id
          FROM album_photos
        )
    `
  );

  const albumDeleteTargets = new Set<string>();
  expiredAlbumAssets.rows.forEach((row) => {
    [String(row.cover_url ?? '').trim(), String(row.donation_qr_code_url ?? '').trim()]
      .filter(Boolean)
      .forEach((item) => albumDeleteTargets.add(item));
  });

  if (albumDeleteTargets.size > 0) {
    await deleteCloudBaseObjects(Array.from(albumDeleteTargets));
  }

  const deletedAlbums = await executeSQL(
    `
      DELETE FROM albums
      WHERE COALESCE(expires_at, DATE_ADD(created_at, INTERVAL 7 DAY)) < NOW()
        AND id NOT IN (
          SELECT album_id
          FROM album_photos
        )
    `
  );

  return {
    deleted_photos: deletedPhotos.affectedRows,
    deleted_folders: deletedFolders.affectedRows,
    deleted_albums: deletedAlbums.affectedRows,
    deleted_storage_files: photoDeleteTargets.size + albumDeleteTargets.size,
    timestamp: new Date().toISOString(),
  };
}

async function rpcRunMaintenanceTasks(context: AuthContext) {
  requireAdmin(context);

  const cleanupResult = await cleanupExpiredData();

  await executeSQL(
    `
      DELETE FROM photo_views
      WHERE viewed_at < DATE_SUB(NOW(), INTERVAL 90 DAY)
    `
  );

  await executeSQL(
    `
      UPDATE bookings
      SET status = 'in_progress'
      WHERE status = 'confirmed'
        AND booking_date = CURRENT_DATE()
    `
  );

  await executeSQL(
    `
      UPDATE bookings
      SET status = 'finished'
      WHERE status IN ('pending', 'confirmed', 'in_progress')
        AND booking_date < CURRENT_DATE()
    `
  );

  await updateDailyAnalyticsSnapshot();

  return {
    cleanup_result: cleanupResult,
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
      case 'bind_user_to_album':
        data = await rpcBindUserToAlbum(args, context);
        break;
      case 'get_user_bound_albums':
        data = await rpcGetUserBoundAlbums(context);
        break;
      case 'pin_photo_to_wall':
        data = await rpcPinPhotoToWall(args);
        break;
      case 'delete_album_photo':
        data = await rpcDeleteAlbumPhoto(args);
        break;
      case 'like_photo':
        data = await rpcLikePhoto(args, context);
        break;
      case 'increment_photo_view':
        data = await rpcIncrementPhotoView(args, context);
        break;
      case 'check_date_availability':
        data = await rpcCheckDateAvailability(args);
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
