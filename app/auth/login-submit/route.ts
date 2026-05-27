import { NextResponse } from 'next/server';
import { appendAuthRefreshQuery } from '@/lib/auth/client-session';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';
import { signInWithPassword } from '@/lib/auth/service';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';
import { isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
}

function isValidRedirectPath(path: string): boolean {
  if (!path.startsWith('/')) {
    return false;
  }
  if (path.includes('://') || path.startsWith('//')) {
    return false;
  }
  if (path.includes('\\')) {
    return false;
  }
  return true;
}

function buildAbsoluteUrl(request: Request, path: string) {
  return new URL(path, request.url);
}

function buildLoginRedirectUrl(request: Request, message: string, redirectTarget: string) {
  const loginUrl = buildAbsoluteUrl(request, '/login');
  loginUrl.searchParams.set('error', message);
  if (redirectTarget && redirectTarget !== '/profile' && isValidRedirectPath(redirectTarget)) {
    loginUrl.searchParams.set('from', redirectTarget);
  }
  return loginUrl;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const phone = normalizeChinaMobile(String(formData.get('phone') ?? ''));
    const password = String(formData.get('password') ?? '');
    const redirectTo = String(formData.get('redirectTo') ?? '').trim();
    const redirectTarget = isValidRedirectPath(redirectTo) ? redirectTo : '/profile';

    if (!phone || !password || !isValidChinaMobile(phone)) {
      return NextResponse.redirect(
        buildLoginRedirectUrl(request, '请输入正确的手机号和密码', redirectTarget),
        303
      );
    }

    const userAgent = request.headers.get('user-agent') ?? undefined;
    const ipAddress = getClientIp(request);
    const result = await signInWithPassword(phone, password, userAgent, ipAddress);

    if (result.error || !result.user || !result.sessionToken) {
      const isDisabled = result.error === 'account_disabled';
      const message = isDisabled ? '账号已被禁用，请联系管理员' : '手机号或密码错误';
      return NextResponse.redirect(buildLoginRedirectUrl(request, message, redirectTarget), 303);
    }

    const response = NextResponse.redirect(
      buildAbsoluteUrl(request, appendAuthRefreshQuery(redirectTarget)),
      303
    );
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    const message = isRetryableSqlError(error)
      ? TRANSIENT_BACKEND_ERROR_MESSAGE
      : '登录失败，请稍后重试';
    return NextResponse.redirect(buildLoginRedirectUrl(request, message, '/profile'), 303);
  }
}
