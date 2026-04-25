import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/context';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const user = await getSessionUserFromRequest(request);

    return NextResponse.json({
      user,
      session: user ? { user } : null,
      error: null,
    });
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return NextResponse.json(
        {
          user: null,
          session: null,
          error: {
            message: TRANSIENT_BACKEND_ERROR_MESSAGE,
            code: TRANSIENT_BACKEND_ERROR_CODE,
          },
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        user: null,
        session: null,
        error: {
          message: error instanceof Error ? error.message : 'Session check failed',
        },
      },
      { status: 500 }
    );
  }
}
