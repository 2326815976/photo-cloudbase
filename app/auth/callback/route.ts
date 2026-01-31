import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.error('代码交换失败:', error);
      return NextResponse.redirect(new URL('/login?error=验证失败，请重试', requestUrl.origin));
    }
  }

  // 重定向到个人中心
  return NextResponse.redirect(new URL('/profile', requestUrl.origin));
}
