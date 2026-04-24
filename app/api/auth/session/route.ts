import { NextResponse } from 'next/server';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';
import { getSessionUserFromRequest } from '@/lib/auth/context';
import { signInWithWechatMiniProgramOpenid } from '@/lib/auth/service';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
}

function maskOpenid(openid: string | null | undefined): string {
  const normalized = String(openid || '').trim();
  if (!normalized) {
    return '';
  }
  if (normalized.length <= 8) {
    return `${normalized.slice(0, 2)}***${normalized.slice(-1)}`;
  }
  return `${normalized.slice(0, 4)}***${normalized.slice(-4)}`;
}

function getWechatMiniProgramOpenid(request: Request): string | null {
  const openid = String(request.headers.get('x-wx-openid') || '').trim();
  if (!openid) {
    return null;
  }

  const headerKeys = Array.from(request.headers.keys()).map((key) => String(key || '').toLowerCase());
  const hasWechatProxyHeaders = headerKeys.some((key) => key.startsWith('x-wx-'));
  const userAgent = String(request.headers.get('user-agent') || '').toLowerCase();

  if (!hasWechatProxyHeaders && !userAgent.includes('miniprogram')) {
    return null;
  }

  return openid;
}

export async function GET(request: Request) {
  try {
    let user = await getSessionUserFromRequest(request);
    let issuedSessionToken: string | null = null;

    if (!user) {
      const openid = getWechatMiniProgramOpenid(request);
      if (openid) {
        const result = await signInWithWechatMiniProgramOpenid(openid, {
          userAgent: request.headers.get('user-agent') ?? undefined,
          ipAddress: getClientIp(request),
        });
        if (!result.error && result.user && result.sessionToken) {
          user = result.user;
          issuedSessionToken = result.sessionToken;
          console.info('[wechat-mini-auto-login][session] issued session', {
            openid: maskOpenid(openid),
            userId: result.user.id,
          });
        } else {
          console.warn('[wechat-mini-auto-login][session] issue session failed', {
            openid: maskOpenid(openid),
            error: result.error || 'unknown',
          });
        }
      }
    }

    const response = NextResponse.json({
      user,
      session: user ? { user } : null,
      error: null,
    });

    if (issuedSessionToken) {
      response.cookies.set(SESSION_COOKIE_NAME, issuedSessionToken, getSessionCookieOptions());
    }

    return response;
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return NextResponse.json(
        {
          user: null,
          session: null,
          error: {
            message: TRANSIENT_BACKEND_ERROR_MESSAGE,
            code: TRANSIENT_BACKEND_ERROR_CODE,
          },
        },
        { status: 503 }
      );
    }

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
