import { NextResponse } from 'next/server';
import { resolveAuthContextFromRequest } from '@/lib/auth/context';
import { executeRpc } from '@/lib/cloudbase/rpc-engine';
import { DbRpcPayload } from '@/lib/cloudbase/query-types';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

function buildTransientResponse() {
  return NextResponse.json(
    {
      data: null,
      error: {
        message: TRANSIENT_BACKEND_ERROR_MESSAGE,
        code: TRANSIENT_BACKEND_ERROR_CODE,
      },
    },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DbRpcPayload;
    const authResolution = await resolveAuthContextFromRequest(request);

    if (authResolution.transientFailure && authResolution.hasToken) {
      return buildTransientResponse();
    }

    const result = await executeRpc(payload.functionName, payload.args ?? {}, authResolution.context);
    const status = result.error?.code === TRANSIENT_BACKEND_ERROR_CODE ? 503 : 200;
    return NextResponse.json(result, { status });
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return buildTransientResponse();
    }

    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'RPC ????',
        },
      },
      { status: 500 }
    );
  }
}
