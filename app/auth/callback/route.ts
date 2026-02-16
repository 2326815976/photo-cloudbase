import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  return NextResponse.redirect(new URL('/login?error=当前版本仅支持手机号登录', requestUrl.origin));
}
