import { NextResponse } from 'next/server';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';
import { signInWithPassword } from '@/lib/auth/service';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';
import { isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';
const WECHAT_LOGIN_BRIDGE_DELAY_MS = 900;

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

function buildCompleteLoginUrl(request: Request, redirectTarget: string) {
  const completeUrl = buildAbsoluteUrl(request, '/auth/complete-login');
  completeUrl.searchParams.set('redirectTo', redirectTarget);
  return completeUrl;
}

function buildLoginRedirectUrl(request: Request, message: string, redirectTarget: string) {
  const loginUrl = buildAbsoluteUrl(request, '/login');
  loginUrl.searchParams.set('error', message);
  if (redirectTarget && redirectTarget !== '/profile' && isValidRedirectPath(redirectTarget)) {
    loginUrl.searchParams.set('from', redirectTarget);
  }
  return loginUrl;
}

function buildBridgeHtml(nextUrl: URL) {
  const escapedUrl = nextUrl.toString().replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const scriptUrl = JSON.stringify(nextUrl.toString());
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta http-equiv="Cache-Control" content="no-store, no-cache, must-revalidate" />
    <meta http-equiv="Pragma" content="no-cache" />
    <meta http-equiv="Expires" content="0" />
    <title>正在完成登录</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: #fffbf0;
        color: #5d4037;
        font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      }
      .card {
        width: min(100%, 360px);
        background: #fffdf8;
        border: 1px solid rgba(93, 64, 55, 0.1);
        border-radius: 28px;
        padding: 28px 24px;
        text-align: center;
        box-shadow: 0 24px 48px rgba(93, 64, 55, 0.14);
      }
      .spinner {
        width: 42px;
        height: 42px;
        margin: 0 auto 18px;
        border-radius: 999px;
        border: 4px solid rgba(93, 64, 55, 0.14);
        border-top-color: #5d4037;
        animation: spin 1s linear infinite;
      }
      h1 {
        margin: 0;
        font-size: 20px;
        font-weight: 800;
      }
      p {
        margin: 10px 0 0;
        font-size: 14px;
        line-height: 1.7;
        color: rgba(93, 64, 55, 0.74);
      }
      a {
        color: #c48b5a;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="spinner" aria-hidden="true"></div>
      <h1>正在完成登录</h1>
      <p>正在同步微信浏览器的登录状态，请稍候。</p>
      <p><a href="${escapedUrl}">如果没有自动继续，请点这里</a></p>
    </main>
    <script>
      window.setTimeout(function () {
        window.location.replace(${scriptUrl});
      }, ${WECHAT_LOGIN_BRIDGE_DELAY_MS});
    </script>
  </body>
</html>`;
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

    const completeUrl = buildCompleteLoginUrl(request, redirectTarget);
    const response = new NextResponse(buildBridgeHtml(completeUrl), {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store, no-cache, must-revalidate',
      },
    });
    response.cookies.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
    return response;
  } catch (error) {
    const message = isRetryableSqlError(error)
      ? TRANSIENT_BACKEND_ERROR_MESSAGE
      : '登录失败，请稍后重试';
    return NextResponse.redirect(buildLoginRedirectUrl(request, message, '/profile'), 303);
  }
}
