import { NextResponse } from 'next/server';
import { getSessionTokenFromCookieHeader } from '@/lib/auth/context';
import { revokeSessionByToken } from '@/lib/auth/session-store';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = getSessionTokenFromCookieHeader(request.headers.get('cookie'));
    if (token) {
      await revokeSessionByToken(token);
    }

    const response = NextResponse.json({ error: null });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...getSessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : 'Logout failed',
        },
      },
      { status: 500 }
    );
  }
}
