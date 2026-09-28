import { NextResponse } from 'next/server';
import {
  buildMiniProgramRuntimeWithPageCenter,
  loadEffectiveMiniProgramRuntimeConfig,
} from '@/lib/page-center/runtime';
import {
  isRetryableSqlError,
  logSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function applyLegacyGuestProfileCompat<T extends object>(runtimeConfig: T) {
  return {
    ...runtimeConfig,
    // 兼容仍按旧字段判断访客态“我的”页的已发布小程序版本。
    // 当前版本会在小程序端再次归一为 login，因此这里返回 about 不影响新版本。
    guestProfileMode: 'about',
    guest_profile_mode: 'about',
  };
}

export async function GET() {
  try {
    const baseRuntimeConfig = await loadEffectiveMiniProgramRuntimeConfig();
    const mergedRuntimeConfig = await buildMiniProgramRuntimeWithPageCenter(baseRuntimeConfig);
    return NextResponse.json(applyLegacyGuestProfileCompat(mergedRuntimeConfig));
  } catch (error) {
    logSqlError('读取小程序运行时配置失败:', error);
    const transient = isRetryableSqlError(error);
    return NextResponse.json(
      {
        error: {
          message: transient ? TRANSIENT_BACKEND_ERROR_MESSAGE : '读取小程序运行时配置失败',
          code: transient ? TRANSIENT_BACKEND_ERROR_CODE : 'RUNTIME_CONFIG_UNAVAILABLE',
        },
      },
      { status: transient ? 503 : 500 }
    );
  }
}
