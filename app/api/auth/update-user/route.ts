import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/context';
import { updateUserPassword } from '@/lib/auth/service';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/cookie';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'Not authenticated' },
        },
        { status: 401 }
      );
    }

    const body = await request.json();
    const password = String(body?.password ?? '');

    if (!password || password.length < 6) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'Password should be at least 6 characters' },
        },
        { status: 400 }
      );
    }

    const result = await updateUserPassword(user.id, password);
    if (result.error) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: result.error },
        },
        { status: 400 }
      );
    }

    const response = NextResponse.json({
      data: { user },
      error: null,
    });
    response.cookies.set(SESSION_COOKIE_NAME, '', {
      ...getSessionCookieOptions(),
      maxAge: 0,
    });
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: { user: null },
        error: {
          message: error instanceof Error ? error.message : 'Update user failed',
        },
      },
      { status: 500 }
    );
  }
}
