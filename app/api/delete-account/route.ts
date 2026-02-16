import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';
import { revokeSessionsByUserId } from '@/lib/auth/session-store';

function collectNonEmptyTargets(...groups: Array<Array<unknown>>): string[] {
  const targets = new Set<string>();

  groups.forEach((group) => {
    group.forEach((value) => {
      const normalized = String(value ?? '').trim();
      if (normalized) {
        targets.add(normalized);
      }
    });
  });

  return Array.from(targets);
}

async function collectUserStorageTargets(userId: string): Promise<string[]> {
  const [profileAssetsResult, photoAssetsResult, albumAssetsResult] = await Promise.all([
    executeSQL(
      `
        SELECT avatar, payment_qr_code
        FROM profiles
        WHERE id = {{user_id}}
        LIMIT 1
      `,
      { user_id: userId }
    ),
    executeSQL(
      `
        SELECT p.thumbnail_url, p.preview_url, p.original_url, p.url
        FROM album_photos p
        JOIN albums a ON a.id = p.album_id
        WHERE a.created_by = {{user_id}}
      `,
      { user_id: userId }
    ),
    executeSQL(
      `
        SELECT cover_url, donation_qr_code_url
        FROM albums
        WHERE created_by = {{user_id}}
      `,
      { user_id: userId }
    ),
  ]);

  const profileRow = profileAssetsResult.rows[0] ?? {};
  const photoTargets = photoAssetsResult.rows.flatMap((row) => [
    row.thumbnail_url,
    row.preview_url,
    row.original_url,
    row.url,
  ]);
  const albumTargets = albumAssetsResult.rows.flatMap((row) => [row.cover_url, row.donation_qr_code_url]);

  const targets = collectNonEmptyTargets(
    [profileRow.avatar, profileRow.payment_qr_code],
    photoTargets,
    albumTargets
  );

  return targets;
}

export async function POST() {
  try {
    const dbClient = await createClient();
    const { data: authUser, error: authError } = await dbClient.auth.getUser();

    if (authError || !authUser?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = authUser.user.id;
    let warning: string | null = null;

    let storageTargets: string[] = [];
    try {
      storageTargets = await collectUserStorageTargets(userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      warning = `账号已删除，但未能收集云存储清理列表：${message}`;
    }

    await revokeSessionsByUserId(userId);

    await executeSQL(
      `
        DELETE FROM bookings
        WHERE user_id = {{user_id}}
      `,
      { user_id: userId }
    );

    await executeSQL(
      `
        DELETE FROM users
        WHERE id = {{user_id}}
      `,
      { user_id: userId }
    );

    await executeSQL(
      `
        DELETE FROM profiles
        WHERE id = {{user_id}}
      `,
      { user_id: userId }
    );

    if (storageTargets.length > 0) {
      try {
        await deleteCloudBaseObjects(storageTargets);
      } catch (error) {
        const message = error instanceof Error ? error.message : '未知错误';
        warning = `账号已删除，但云存储清理失败：${message}`;
      }
    }

    return NextResponse.json({
      success: true,
      warning,
    });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: '系统错误' }, { status: 500 });
  }
}


