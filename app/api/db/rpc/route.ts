import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth/context';
import { executeRpc } from '@/lib/cloudbase/rpc-engine';
import { DbRpcPayload } from '@/lib/cloudbase/query-types';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DbRpcPayload;
    const authContext = await getAuthContextFromRequest(request);
    const result = await executeRpc(payload.functionName, payload.args ?? {}, authContext);
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
              : 'RPC 调用失败',
          code: isTransient ? TRANSIENT_BACKEND_ERROR_CODE : undefined,
        },
      },
      { status: isTransient ? 503 : 500 }
    );
  }
}
