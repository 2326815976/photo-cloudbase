import { NextResponse } from 'next/server';
import { appendAuthRefreshQuery } from '@/lib/auth/client-session';
import { getSessionUserFromRequest } from '@/lib/auth/context';
import { isRetryableSqlError } from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';
const COMPLETE_LOGIN_RETRY_DELAY_MS = 700;
const COMPLETE_LOGIN_MAX_ATTEMPTS = 4;

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

function buildLoginUrl(request: Request, message: string, redirectTarget: string) {
  const loginUrl = buildAbsoluteUrl(request, '/login');
  loginUrl.searchParams.set('error', message);
  if (redirectTarget && redirectTarget !== '/profile' && isValidRedirectPath(redirectTarget)) {
    loginUrl.searchParams.set('from', redirectTarget);
  }
  return loginUrl;
}

function buildRetryUrl(request: Request, redirectTarget: string, attempt: number) {
  const retryUrl = buildAbsoluteUrl(request, '/auth/complete-login');
  retryUrl.searchParams.set('redirectTo', redirectTarget);
  retryUrl.searchParams.set('attempt', String(attempt));
  return retryUrl;
}

function buildWaitingHtml(nextUrl: URL, attempt: number) {
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
    <title>正在确认登录状态</title>
    <style>
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
      <h1>正在确认登录状态</h1>
      <p>微信浏览器同步会话较慢，正在进行第 ${attempt} 次确认。</p>
      <p><a href="${escapedUrl}">如果没有自动继续，请点这里</a></p>
    </main>
    <script>
      window.setTimeout(function () {
        window.location.replace(${scriptUrl});
      }, ${COMPLETE_LOGIN_RETRY_DELAY_MS});
    </script>
  </body>
</html>`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const redirectTo = String(searchParams.get('redirectTo') || '').trim();
  const redirectTarget = isValidRedirectPath(redirectTo) ? redirectTo : '/profile';
  const attemptValue = Number.parseInt(String(searchParams.get('attempt') || '1'), 10);
  const attempt = Number.isFinite(attemptValue) && attemptValue > 0 ? attemptValue : 1;

  try {
    const user = await getSessionUserFromRequest(request);
    if (user) {
      return NextResponse.redirect(
        buildAbsoluteUrl(request, appendAuthRefreshQuery(redirectTarget)),
        303
      );
    }
  } catch (error) {
    if (!isRetryableSqlError(error)) {
      return NextResponse.redirect(
        buildLoginUrl(request, '登录状态确认失败，请重新登录', redirectTarget),
        303
      );
    }
  }

  if (attempt >= COMPLETE_LOGIN_MAX_ATTEMPTS) {
    return NextResponse.redirect(
      buildLoginUrl(request, '微信浏览器未完成登录状态同步，请重试', redirectTarget),
      303
    );
  }

  const retryUrl = buildRetryUrl(request, redirectTarget, attempt + 1);
  return new NextResponse(buildWaitingHtml(retryUrl, attempt), {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
    },
  });
}
