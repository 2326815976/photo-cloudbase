import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/context';

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
