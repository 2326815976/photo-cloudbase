import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { mapLegacyFeatureRowsToPageCenterRows } from '@/lib/page-center/legacy-beta';
import { canUsePageCenterBeta, checkUserPageBetaAccess } from '@/lib/page-center/user-beta';

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

function readBusinessErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.trim() : '';
}

function isPageCenterBusinessError(error: unknown) {
  const message = readBusinessErrorMessage(error);
  if (!message) return false;
  return (
    message.startsWith('参数错误：') ||
    [
      '该页面当前未开放内测入口',
      '该内测功能已下线',
      '该内测功能已过期',
      '该内测码已过期',
    ].some((item) => message.includes(item))
  );
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageKey = String(url.searchParams.get('page_key') || '').trim();
    const channel = normalizeChannel(url.searchParams.get('channel'));

    if (!pageKey) {
      return NextResponse.json({ error: '缺少页面标识' }, { status: 400 });
    }

    const dbClient = await createClient();
    const {
      data: { user },
    } = await dbClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ allowed: false, reason: 'unauthorized' });
    }

    if (await canUsePageCenterBeta()) {
      try {
        const row = await checkUserPageBetaAccess(String(user.id), pageKey, channel);
        if (row) {
          return NextResponse.json({ allowed: true, data: row, reason: 'page_center' });
        }
      } catch (error) {
        if (isPageCenterBusinessError(error)) {
          return NextResponse.json({
            allowed: false,
            error: readBusinessErrorMessage(error),
            reason: 'page_center_denied',
          });
        }
        // 回退到旧版内测能力
      }
    }

    const { data, error } = await dbClient.rpc('get_user_beta_features');
    if (error) {
      return NextResponse.json({ allowed: false, reason: 'legacy_empty' });
    }

    const mappedRows = mapLegacyFeatureRowsToPageCenterRows(readRpcRows(data), channel);
    const matched = mappedRows.find((item) => item.feature_id === pageKey) || null;
    if (!matched) {
      return NextResponse.json({ allowed: false, reason: 'forbidden' });
    }

    return NextResponse.json({ allowed: true, data: matched, reason: 'legacy_rpc' });
  } catch (error) {
    console.error('校验页面内测权限失败:', error);
    return NextResponse.json({ error: '校验页面内测权限失败' }, { status: 500 });
  }
}
