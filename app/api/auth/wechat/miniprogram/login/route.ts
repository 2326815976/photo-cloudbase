import { NextResponse } from 'next/server';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';
import { signInWithWechatMiniProgram } from '@/lib/auth/service';

export const dynamic = 'force-dynamic';

function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
}

function isMiniProgramRequest(request: Request): boolean {
  const headerKeys = Array.from(request.headers.keys()).map((key) => String(key || '').toLowerCase());
  if (headerKeys.some((key) => key.startsWith('x-wx-'))) {
    return true;
  }

  const userAgent = String(request.headers.get('user-agent') || '').toLowerCase();
  return userAgent.includes('miniprogram');
}

function mapLoginError(error: string): { status: number; message: string } {
  const normalized = String(error || '').toLowerCase();

  if (!normalized) {
    return { status: 500, message: '微信登录失败，请稍后重试' };
  }

  if (normalized.includes('invalid_code') || normalized.includes('wx_mini_openid_missing')) {
    return { status: 400, message: '微信登录凭证无效，请重新登录' };
  }

  if (normalized.includes('wx_mini_config_missing')) {
    return { status: 500, message: '微信登录服务未配置，请联系管理员' };
  }

  if (normalized.includes('account_disabled')) {
    return { status: 403, message: '当前账号已被禁用' };
  }

  if (normalized.includes('wx_mini_code_exchange_failed')) {
    const raw = String(error || '');
    if (raw.includes(':40013:') || raw.includes(':40125:')) {
      return { status: 500, message: '微信登录配置错误，请检查 AppID 和 Secret' };
    }
    if (raw.includes(':40029:') || raw.includes(':40226:')) {
      return { status: 401, message: '微信登录凭证已失效，请重新授权' };
    }
    if (raw.includes(':45011:')) {
      return { status: 429, message: '微信登录过于频繁，请稍后再试' };
    }
    return { status: 401, message: '微信登录失败，请重新授权' };
  }

  return { status: 500, message: '微信登录失败，请稍后重试' };
}

export async function POST(request: Request) {
  try {
    if (!isMiniProgramRequest(request)) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: '当前请求不是微信小程序环境' },
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const code = String(body?.code ?? '').trim();
    const nickName = String(body?.nickName ?? '').trim();

    if (!code) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: '缺少微信登录凭证' },
        },
        { status: 400 }
      );
    }

    const userAgent = request.headers.get('user-agent') ?? undefined;
    const ipAddress = getClientIp(request);
    const result = await signInWithWechatMiniProgram(code, {
      nickName: nickName || undefined,
      userAgent,
      ipAddress,
    });

    if (result.error || !result.user || !result.sessionToken) {
      const mapped = mapLoginError(result.error || '');
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: mapped.message },
        },
        { status: mapped.status }
      );
    }

    const response = NextResponse.json({
      data: {
        user: result.user,
      },
      error: null,
    });
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: { user: null },
        error: {
          message: error instanceof Error ? error.message : '微信登录失败',
        },
      },
      { status: 500 }
    );
  }
}
