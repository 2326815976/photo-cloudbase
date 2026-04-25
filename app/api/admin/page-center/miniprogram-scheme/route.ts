import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';

export const dynamic = 'force-dynamic';

let cachedAccessToken = '';
let cachedAccessTokenExpiresAt = 0;

function normalizeRoutePath(input: unknown) {
  const text = String(input || '').trim();
  if (!text) return '';
  return text.startsWith('/') ? text : `/${text}`;
}

function normalizeEnvVersion(input: unknown): 'release' | 'trial' | 'develop' {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'release' || value === 'trial' || value === 'develop') {
    return value;
  }
  return 'trial';
}

async function getWechatAccessToken() {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessTokenExpiresAt - now > 60_000) {
    return cachedAccessToken;
  }

  const appId = String(process.env.WX_MINI_APPID || '').trim();
  const appSecret = String(process.env.WX_MINI_SECRET || '').trim();
  if (!appId || !appSecret) {
    throw new Error('缺少微信小程序凭据');
  }

  const requestUrl = new URL('https://api.weixin.qq.com/cgi-bin/token');
  requestUrl.searchParams.set('grant_type', 'client_credential');
  requestUrl.searchParams.set('appid', appId);
  requestUrl.searchParams.set('secret', appSecret);

  const response = await fetch(requestUrl.toString(), {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    errcode?: number;
    errmsg?: string;
  };

  if (!response.ok || payload.errcode || !payload.access_token) {
    throw new Error(payload.errmsg || '获取微信 access_token 失败');
  }

  cachedAccessToken = String(payload.access_token);
  cachedAccessTokenExpiresAt = now + Math.max(300, Number(payload.expires_in || 7200) - 120) * 1000;
  return cachedAccessToken;
}

async function generateMiniProgramScheme(routePathInput: unknown, envVersionInput: unknown = 'trial') {
  const normalizedRoute = normalizeRoutePath(routePathInput);
  if (!normalizedRoute) {
    throw new Error('缺少小程序预览路由');
  }

  const [pathPart, queryPart] = normalizedRoute.split('?');
  const envVersion = normalizeEnvVersion(envVersionInput);
  const accessToken = await getWechatAccessToken();
  const requestUrl = new URL('https://api.weixin.qq.com/wxa/generatescheme');
  requestUrl.searchParams.set('access_token', accessToken);

  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      jump_wxa: {
        path: String(pathPart || '').replace(/^\//, ''),
        query: String(queryPart || '').trim(),
        env_version: envVersion,
      },
      is_expire: true,
      expire_interval: 1800,
    }),
  });

  const payload = (await response.json()) as {
    openlink?: string;
    errcode?: number;
    errmsg?: string;
  };

  if (!response.ok || payload.errcode || !payload.openlink) {
    throw new Error(payload.errmsg || '生成小程序 Scheme 失败');
  }

  return String(payload.openlink);
}

export async function POST(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as Record<string, unknown>;
    const routePath = normalizeRoutePath(body.routePath);
    const envVersion = normalizeEnvVersion(
      body.envVersion || process.env.WX_MINI_SCHEME_ENV_VERSION || 'trial'
    );
    if (!routePath) {
      return NextResponse.json({ error: '缺少小程序预览路由' }, { status: 400 });
    }

    const openlink = await generateMiniProgramScheme(routePath, envVersion);
    return NextResponse.json({ success: true, openlink });
  } catch (error) {
    console.error('生成小程序预览 Scheme 失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成小程序预览 Scheme 失败' },
      { status: 500 }
    );
  }
}
