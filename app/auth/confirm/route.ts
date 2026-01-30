import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const code = requestUrl.searchParams.get('code');

  if (token_hash && type) {
    const supabase = await createClient();

    const { error } = await supabase.auth.verifyOtp({
      type: type as any,
      token_hash,
    });

    if (error) {
      console.error('邮箱验证失败:', error);
      return NextResponse.redirect(new URL('/login?error=验证失败，请重试', requestUrl.origin));
    }

    // 验证成功，重定向到个人中心
    const response = NextResponse.redirect(new URL('/profile', requestUrl.origin));
    return response;
  }

  if (code) {
    const supabase = await createClient();

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      console.error('代码交换失败:', error);
      return NextResponse.redirect(new URL('/login?error=验证失败，请重试', requestUrl.origin));
    }

    // 验证成功，重定向到个人中心
    const response = NextResponse.redirect(new URL('/profile', requestUrl.origin));
    return response;
  }

  // 没有有效的验证参数
  return NextResponse.redirect(new URL('/login?error=无效的验证链接', requestUrl.origin));
}
