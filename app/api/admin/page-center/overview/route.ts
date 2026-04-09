import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { buildPageCenterOverview, loadEffectiveMiniProgramRuntimeConfig } from '@/lib/page-center/runtime';
import { parseBooleanEnv } from '@/lib/miniprogram/runtime-config';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const [data, effectiveRuntimeConfig] = await Promise.all([
      buildPageCenterOverview(),
      loadEffectiveMiniProgramRuntimeConfig(),
    ]);
    const envHideAuditOverride = parseBooleanEnv(process.env.HIDE_AUDIT);
    return NextResponse.json({
      data,
      meta: {
        hideAudit: Boolean(effectiveRuntimeConfig.hideAudit),
        hideAuditSource: effectiveRuntimeConfig.source || 'default_fallback',
        envOverrideActive: envHideAuditOverride !== null,
      },
    });
  } catch (error) {
    console.error('读取页面管理概览失败:', error);
    return NextResponse.json({ error: '读取页面管理概览失败' }, { status: 500 });
  }
}
