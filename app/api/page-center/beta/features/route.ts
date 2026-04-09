import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { mapLegacyFeatureRowsToPageCenterRows } from '@/lib/page-center/legacy-beta';
import { canUsePageCenterBeta, getUserPageBetaFeatures } from '@/lib/page-center/user-beta';

export const dynamic = 'force-dynamic';

function normalizeChannel(input: string | null) {
  return input === 'miniprogram' ? 'miniprogram' : 'web';
}

function readRpcRows(data: unknown) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) {
    return (data as { data: unknown[] }).data;
  }
  return [];
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

    if (await canUsePageCenterBeta()) {
      const rows = await getUserPageBetaFeatures(String(user.id), channel);
      if (rows.length > 0) {
        return NextResponse.json({ data: rows, source: 'page_center' });
      }
    }

    const { data, error } = await dbClient.rpc('get_user_beta_features');
    if (error) {
      return NextResponse.json({ data: [], source: 'legacy_empty' });
    }

    return NextResponse.json({
      data: mapLegacyFeatureRowsToPageCenterRows(readRpcRows(data), channel),
      source: 'legacy_rpc',
    });
  } catch (error) {
    console.error('读取页面内测功能列表失败:', error);
    return NextResponse.json({ error: '读取页面内测功能列表失败' }, { status: 500 });
  }
}

