import { NextResponse } from 'next/server';
import { consumePasswordResetToken } from '@/lib/auth/service';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const tokenHash = String(body?.token_hash ?? '').trim();

    if (!tokenHash) {
      return NextResponse.json(
        {
          data: null,
          error: { message: 'Invalid token' },
        },
        { status: 400 }
      );
    }

    const result = await consumePasswordResetToken(tokenHash);
    if (result.error || !result.user || !result.sessionToken) {
      return NextResponse.json(
        {
          data: null,
          error: { message: '验证失败，请重试' },
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      data: null,
      error: null,
    });

    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Verify OTP failed',
        },
      },
      { status: 500 }
    );
  }
}
