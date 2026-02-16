import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    {
      data: { session: null },
      error: {
        message: '该验证流程已下线，请使用手机号登录',
      },
    },
    { status: 410 }
  );
}
