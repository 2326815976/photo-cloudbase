import { NextResponse } from 'next/server';
import { consumePasswordResetToken } from '@/lib/auth/service';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const code = String(body?.code ?? '').trim();

    if (!code) {
      return NextResponse.json(
        {
          data: { session: null },
          error: { message: 'Invalid code' },
        },
        { status: 400 }
      );
    }

    const result = await consumePasswordResetToken(code);
    if (result.error || !result.user || !result.sessionToken) {
      return NextResponse.json(
        {
          data: { session: null },
          error: { message: '代码交换失败' },
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      data: {
        session: {
          user: result.user,
        },
      },
      error: null,
    });

    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: { session: null },
        error: {
          message: error instanceof Error ? error.message : 'Exchange code failed',
        },
      },
      { status: 500 }
    );
  }
}
