import { NextResponse } from 'next/server';
import { resolveAuthContextFromRequest } from '@/lib/auth/context';
import { executeQuery } from '@/lib/cloudbase/query-engine';
import { DbQueryPayload } from '@/lib/cloudbase/query-types';
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
      count: null,
    },
    { status: 503 }
  );
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DbQueryPayload;
    const authResolution = await resolveAuthContextFromRequest(request);

    if (authResolution.transientFailure && authResolution.hasToken) {
      return buildTransientResponse();
    }

    const result = await executeQuery(payload, authResolution.context);
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
          message: error instanceof Error ? error.message : '???????',
        },
        count: null,
      },
      { status: 500 }
    );
  }
}
