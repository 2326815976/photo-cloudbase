import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

function isConnectTimeoutError(error: unknown): boolean {
  const message = (() => {
    if (error instanceof Error) {
      return error.message;
    }
    if (error && typeof error === 'object') {
      const value = (error as { message?: unknown }).message;
      return typeof value === 'string' ? value : '';
    }
    return String(error ?? '');
  })().toLowerCase();

  return (
    message.includes('connect timeout') ||
    message.includes('request timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('esockettimedout')
  );
}

export async function GET(request: Request) {
  try {
    const user = await getSessionUserFromRequest(request);

    return NextResponse.json({
      user,
      session: user ? { user } : null,
      error: null,
    });
  } catch (error) {
    if (isConnectTimeoutError(error)) {
      return NextResponse.json(
        {
          user: null,
          session: null,
          error: {
            message: '服务连接超时，请稍后重试',
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
