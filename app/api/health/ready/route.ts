import { NextResponse } from 'next/server';
import {
  executeSQL,
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

const SYSTEM_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';

export async function GET() {
  try {
    await executeSQL(
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

    await executeSQL(
      `
        SELECT COUNT(*) AS total
        FROM album_photos
        WHERE album_id = {{wall_album_id}}
          AND (folder_id <=> NULL OR folder_id = '')
      `,
      {
        wall_album_id: SYSTEM_WALL_ALBUM_ID,
      }
    );

    return NextResponse.json({
      ok: true,
      error: null,
      checked_at: new Date().toISOString(),
    });
  } catch (error) {
    const isTransient = isRetryableSqlError(error);
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: isTransient
            ? TRANSIENT_BACKEND_ERROR_MESSAGE
            : error instanceof Error
              ? error.message
              : '服务健康检查失败',
          code: isTransient ? TRANSIENT_BACKEND_ERROR_CODE : undefined,
        },
      },
      { status: isTransient ? 503 : 500 }
    );
  }
}
