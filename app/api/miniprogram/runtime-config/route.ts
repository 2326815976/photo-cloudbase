import { NextResponse } from 'next/server';
import {
  buildMiniProgramRuntimeWithPageCenter,
  loadEffectiveMiniProgramRuntimeConfig,
} from '@/lib/page-center/runtime';
import { buildLegacyEnvRuntimeConfig, parseBooleanEnv } from '@/lib/miniprogram/runtime-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const legacyHideAudit = parseBooleanEnv(process.env.HIDE_AUDIT);
  const legacyRuntimeConfig = buildLegacyEnvRuntimeConfig(legacyHideAudit === true);

  try {
    const baseRuntimeConfig = await loadEffectiveMiniProgramRuntimeConfig();
    const mergedRuntimeConfig = await buildMiniProgramRuntimeWithPageCenter(baseRuntimeConfig);
    return NextResponse.json(mergedRuntimeConfig);
  } catch {
    // 保持向下兼容：数据库未迁移或暂时不可用时，回退到旧环境变量逻辑
  }

  return NextResponse.json(legacyRuntimeConfig);
}
