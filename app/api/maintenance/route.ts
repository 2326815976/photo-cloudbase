import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import {
  extractErrorMessage,
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

const MAINTENANCE_AUTH_TIMEOUT_MS = 15000;
const MAINTENANCE_RPC_TIMEOUT_MS = 30000;

function withTimeout<T>(promise: PromiseLike<T> | Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);

    Promise.resolve(promise)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function isTransientMaintenanceError(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    isRetryableSqlError(error) ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('etimedout') ||
    message.includes('connect timeout')
  );
}

function buildTransientResponse(details: string) {
  return NextResponse.json(
    {
      error: TRANSIENT_BACKEND_ERROR_MESSAGE,
      code: TRANSIENT_BACKEND_ERROR_CODE,
      details,
    },
    { status: 503 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.MAINTENANCE_TOKEN;
    const tokenValid = Boolean(expectedToken && authHeader === `Bearer ${expectedToken}`);
    const dbClient = await createClient();

    if (!tokenValid) {
      const authResult = await withTimeout(
        dbClient.auth.getUser(),
        MAINTENANCE_AUTH_TIMEOUT_MS,
        '管理员登录状态校验超时'
      );
      const user = authResult.data?.user ?? null;
      const authError = authResult.error;

      if (authError && !user) {
        if (isTransientMaintenanceError(authError)) {
          return buildTransientResponse('管理员登录状态校验超时，请稍后重试');
        }
        return NextResponse.json({ error: '未授权访问' }, { status: 401 });
      }

      if (!user) {
        return NextResponse.json({ error: '未授权访问' }, { status: 401 });
      }

      let isAdmin = String((user as { role?: unknown }).role ?? '').trim() === 'admin';

      if (!isAdmin) {
        const profileResult = await withTimeout(
          dbClient.from('profiles').select('role').eq('id', user.id).maybeSingle(),
          MAINTENANCE_AUTH_TIMEOUT_MS,
          '管理员资料读取超时'
        );

        if (profileResult.error) {
          if (isTransientMaintenanceError(profileResult.error)) {
            return buildTransientResponse('管理员资料读取超时，请稍后重试');
          }

          return NextResponse.json(
            { error: '读取管理员资料失败', details: profileResult.error.message },
            { status: 500 }
          );
        }

        isAdmin = String((profileResult.data as { role?: unknown } | null)?.role ?? '').trim() === 'admin';
      }

      if (!isAdmin) {
        return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
      }
    }

    const { data, error } = await withTimeout(
      dbClient.rpc('run_maintenance_tasks'),
      MAINTENANCE_RPC_TIMEOUT_MS,
      '维护任务执行超时'
    );

    if (error) {
      if (isTransientMaintenanceError(error)) {
        return buildTransientResponse('维护任务执行超时，请稍后重试');
      }

      console.error('维护任务执行失败:', error);
      return NextResponse.json(
        { error: '维护任务执行失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '维护任务执行完成',
      result: data,
    });
  } catch (error) {
    if (isTransientMaintenanceError(error)) {
      return buildTransientResponse('维护任务暂时不可用，请稍后重试');
    }

    console.error('维护任务执行失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '维护任务执行异常' },
      { status: 500 }
    );
  }
}
