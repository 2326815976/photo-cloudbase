import { NextResponse } from 'next/server';
import { signInWithPassword } from '@/lib/auth/service';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';

export const dynamic = 'force-dynamic';

function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const phone = String(body?.phone ?? '').trim();
    const password = String(body?.password ?? '');

    if (!phone || !password) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'Phone and password are required' },
        },
        { status: 400 }
      );
    }

    const userAgent = request.headers.get('user-agent') ?? undefined;
    const ipAddress = getClientIp(request);

    const result = await signInWithPassword(phone, password, userAgent, ipAddress);

    if (result.error || !result.user || !result.sessionToken) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'Invalid login credentials' },
        },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      data: { user: result.user },
      error: null,
    });

    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: { user: null },
        error: {
          message: error instanceof Error ? error.message : 'Login failed',
        },
      },
      { status: 500 }
    );
  }
}
