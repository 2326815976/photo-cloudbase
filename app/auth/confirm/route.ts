import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const type = requestUrl.searchParams.get('type');

  if (type === 'recovery') {
    return NextResponse.redirect(new URL('/auth/update-password', requestUrl.origin));
  }

  return NextResponse.redirect(new URL('/login?error=当前版本不支持该验证链接，请使用手机号登录', requestUrl.origin));
}
