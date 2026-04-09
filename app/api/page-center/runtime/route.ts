import { NextResponse } from 'next/server';
import {
  isRetryableSqlError,
  logSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';
import { buildWebShellRuntime } from '@/lib/page-center/runtime';

export const dynamic = 'force-dynamic';

const WEB_RUNTIME_CACHE_TTL_MS = 5 * 1000;

let webShellRuntimeCache:
  | {
      data: Awaited<ReturnType<typeof buildWebShellRuntime>>;
      expiresAt: number;
    }
  | null = null;

export async function GET() {
  const now = Date.now();

  if (webShellRuntimeCache && webShellRuntimeCache.expiresAt > now) {
    return NextResponse.json(webShellRuntimeCache.data);
  }

  try {
    const data = await buildWebShellRuntime();
    webShellRuntimeCache = {
      data,
      expiresAt: now + WEB_RUNTIME_CACHE_TTL_MS,
    };
    return NextResponse.json(data);
  } catch (error) {
    if (webShellRuntimeCache) {
      return NextResponse.json(webShellRuntimeCache.data);
    }

    if (isRetryableSqlError(error)) {
      logSqlError('读取 Web 页面壳运行时失败:', error);
      return NextResponse.json(
        {
          error: {
            message: TRANSIENT_BACKEND_ERROR_MESSAGE,
            code: TRANSIENT_BACKEND_ERROR_CODE,
          },
        },
        { status: 503 }
      );
    }

    logSqlError('读取 Web 页面壳运行时失败:', error);
    return NextResponse.json({ error: '读取 Web 页面壳运行时失败' }, { status: 500 });
  }
}
