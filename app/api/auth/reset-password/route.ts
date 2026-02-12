import { NextResponse } from 'next/server';
import { createPasswordResetToken } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const redirectTo = String(body?.redirectTo ?? '');

    if (!email) {
      return NextResponse.json(
        {
          data: null,
          error: { message: 'Invalid email' },
        },
        { status: 400 }
      );
    }

    const result = await createPasswordResetToken(email);
    if (result.error || !result.token) {
      return NextResponse.json(
        {
          data: null,
          error: { message: 'User not found' },
        },
        { status: 404 }
      );
    }

    const baseUrl = redirectTo || process.env.APP_URL || 'http://localhost:3000/auth/confirm';
    const url = baseUrl.includes('?')
      ? `${baseUrl}&token_hash=${encodeURIComponent(result.token)}&type=recovery`
      : `${baseUrl}?token_hash=${encodeURIComponent(result.token)}&type=recovery`;

    console.info(`[RESET_PASSWORD_LINK] ${email} -> ${url}`);

    return NextResponse.json({
      data: null,
      error: null,
    });
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'Reset password failed',
        },
      },
      { status: 500 }
    );
  }
}
