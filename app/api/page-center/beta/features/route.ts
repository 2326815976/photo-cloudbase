import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import {
  canUseLegacyPageCenterBeta,
  getLegacyUserPageBetaFeatures,
  mergeCompatibleBetaFeatures,
} from '@/lib/page-center/legacy-beta-compat';
import { canUsePageCenterBeta, getUserPageBetaFeatures, type UserPageBetaFeatureRow } from '@/lib/page-center/user-beta';

export const dynamic = 'force-dynamic';

function normalizeChannel(input: string | null) {
  return input === 'miniprogram' ? 'miniprogram' : 'web';
}

export async function GET(request: Request) {
  try {
    const channel = normalizeChannel(new URL(request.url).searchParams.get('channel'));
    const dbClient = await createClient();
    const {
      data: { user },
    } = await dbClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const [pageCenterEnabled, legacyAvailable] = await Promise.all([
      canUsePageCenterBeta(),
      canUseLegacyPageCenterBeta(),
    ]);
    const legacyEnabled = legacyAvailable;

    if (!pageCenterEnabled && !legacyEnabled) {
      return NextResponse.json(
        { error: '页面内测新体系未就绪，请先完成页面中心内测配置', source: 'page_center_only' },
        { status: 503 }
      );
    }

    let pageCenterRows: UserPageBetaFeatureRow[] = [];
    if (pageCenterEnabled) {
      try {
        pageCenterRows = await getUserPageBetaFeatures(String(user.id), channel);
      } catch (error) {
        if (!legacyEnabled) {
          throw error;
        }
        console.error('读取页面内测功能列表失败（新体系，Web 兼容旧体系）:', error);
      }
    }

    const legacyRows = legacyEnabled
      ? await getLegacyUserPageBetaFeatures(String(user.id), channel)
      : [];

    if (!pageCenterEnabled || (pageCenterEnabled && pageCenterRows.length === 0 && legacyRows.length > 0)) {
      return NextResponse.json({ data: legacyRows, source: 'legacy_compatible' });
    }

    const rows = mergeCompatibleBetaFeatures(pageCenterRows, legacyRows);
    return NextResponse.json({
      data: rows,
      source: legacyRows.length > 0 ? 'page_center_with_legacy' : 'page_center',
    });
  } catch (error) {
    console.error('读取页面内测功能列表失败:', error);
    return NextResponse.json({ error: '读取页面内测功能列表失败' }, { status: 500 });
  }
}
