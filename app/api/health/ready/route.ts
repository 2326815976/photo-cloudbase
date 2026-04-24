import { NextResponse } from 'next/server';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';
import { getSessionTokenFromCookieHeader } from '@/lib/auth/context';
import { signInWithWechatMiniProgramOpenid } from '@/lib/auth/service';
import {
  executeSQL,
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

const READY_SUCCESS_CACHE_MS = 1_000;
const READY_FAILURE_CACHE_MS = 300;

type ReadyPayload = {
  ok: boolean;
  error: { message: string; code?: string } | null;
  checked_at: string;
};

type ReadyResult = {
  payload: ReadyPayload;
  status: number;
};

type ReadyProbeState = {
  pending: Promise<ReadyResult> | null;
  cached: ReadyResult | null;
  cachedUntil: number;
};

declare global {
  var __photoReadyProbeState__: ReadyProbeState | undefined;
}

function getReadyProbeState(): ReadyProbeState {
  if (!globalThis.__photoReadyProbeState__) {
    globalThis.__photoReadyProbeState__ = {
      pending: null,
      cached: null,
      cachedUntil: 0,
    };
  }

  return globalThis.__photoReadyProbeState__;
}

function buildReadyResult(ok: boolean, status: number, error: ReadyPayload['error']): ReadyResult {
  return {
    payload: {
      ok,
      error,
      checked_at: new Date().toISOString(),
    },
    status,
  };
}

async function runReadyProbe(): Promise<ReadyResult> {
  try {
    await executeSQL('SELECT 1 AS ok');
    return buildReadyResult(true, 200, null);
  } catch (error) {
    const isTransient = isRetryableSqlError(error);
    return buildReadyResult(
      false,
      isTransient ? 503 : 500,
      {
        message: isTransient
          ? TRANSIENT_BACKEND_ERROR_MESSAGE
          : error instanceof Error
            ? error.message
            : '服务健康检查失败',
        code: isTransient ? TRANSIENT_BACKEND_ERROR_CODE : undefined,
      }
    );
  }
}

async function resolveReadyProbe(): Promise<ReadyResult> {
  const state = getReadyProbeState();
  const now = Date.now();

  if (state.cached && state.cachedUntil > now) {
    return state.cached;
  }

  if (state.pending) {
    return state.pending;
  }

  state.pending = runReadyProbe()
    .then((result) => {
      state.cached = result;
      state.cachedUntil = Date.now() + (result.status === 200 ? READY_SUCCESS_CACHE_MS : READY_FAILURE_CACHE_MS);
      return result;
    })
    .finally(() => {
      state.pending = null;
    });

  return state.pending;
}

function getClientIp(request: Request): string | undefined {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }
  return request.headers.get('x-real-ip') ?? undefined;
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

async function tryIssueWechatMiniProgramSession(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get('cookie');
  if (getSessionTokenFromCookieHeader(cookieHeader)) {
    return null;
  }

  const openid = getWechatMiniProgramOpenid(request);
  if (!openid) {
    return null;
  }

  const result = await signInWithWechatMiniProgramOpenid(openid, {
    userAgent: request.headers.get('user-agent') ?? undefined,
    ipAddress: getClientIp(request),
  });

  if (result.error || !result.sessionToken) {
    return null;
  }

  return result.sessionToken;
}

export async function GET(request: Request) {
  const result = await resolveReadyProbe();
  const response = NextResponse.json(result.payload, { status: result.status });

  if (result.status === 200) {
    const sessionToken = await tryIssueWechatMiniProgramSession(request);
    if (sessionToken) {
      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
    }
  }

  return response;
}
