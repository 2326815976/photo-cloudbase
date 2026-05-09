import { NextResponse } from 'next/server';
import {
  buildMiniProgramRuntimeWithPageCenter,
  loadEffectiveMiniProgramRuntimeConfig,
} from '@/lib/page-center/runtime';
import { buildRuntimeConfigPreset } from '@/lib/miniprogram/runtime-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const baseRuntimeConfig = await loadEffectiveMiniProgramRuntimeConfig();
    const mergedRuntimeConfig = await buildMiniProgramRuntimeWithPageCenter(baseRuntimeConfig);
    return NextResponse.json(mergedRuntimeConfig);
  } catch {
    // 数据库未迁移或暂时不可用时，回退到标准默认配置
  }

  return NextResponse.json(buildRuntimeConfigPreset('standard'));
}
