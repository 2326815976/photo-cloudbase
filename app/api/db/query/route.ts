import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth/context';
import { executeQuery } from '@/lib/cloudbase/query-engine';
import { DbQueryPayload } from '@/lib/cloudbase/query-types';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DbQueryPayload;
    const authContext = await getAuthContextFromRequest(request);
    const result = await executeQuery(payload, authContext);
    const status = result.error?.code === TRANSIENT_BACKEND_ERROR_CODE ? 503 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    const isTransient = isRetryableSqlError(error);
    return NextResponse.json(
      {
        data: null,
        error: {
          message: isTransient
            ? TRANSIENT_BACKEND_ERROR_MESSAGE
            : error instanceof Error
              ? error.message
              : '数据库查询失败',
          code: isTransient ? TRANSIENT_BACKEND_ERROR_CODE : undefined,
        },
        count: null,
      },
      { status: isTransient ? 503 : 500 }
    );
  }
}
