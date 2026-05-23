import { NextResponse } from 'next/server';
import {
  buildMiniProgramRuntimeWithPageCenter,
  loadEffectiveMiniProgramRuntimeConfig,
} from '@/lib/page-center/runtime';
import { buildRuntimeConfigPreset } from '@/lib/miniprogram/runtime-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function applyLegacyGuestProfileCompat<T extends Record<string, unknown>>(runtimeConfig: T) {
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
  } catch {
    // 数据库未迁移或暂时不可用时，回退到标准默认配置
  }

  return NextResponse.json(
    applyLegacyGuestProfileCompat(buildRuntimeConfigPreset('standard'))
  );
}
