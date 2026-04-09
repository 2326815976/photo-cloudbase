import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { buildPageCenterOverview } from '@/lib/page-center/runtime';
import { mapLegacyFeatureRowsToPageCenterRows } from '@/lib/page-center/legacy-beta';
import { canUsePageCenterBeta, checkUserPageBetaAccess } from '@/lib/page-center/user-beta';

export const dynamic = 'force-dynamic';

function readRpcRows(data: unknown) {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) {
    return (data as { data: unknown[] }).data;
  }
  return [];
}

function normalizeChannel(input: unknown): 'web' | 'miniprogram' {
  return String(input || '').trim() === 'miniprogram' ? 'miniprogram' : 'web';
}

function normalizePresentation(input: unknown): 'preview' | 'beta' | 'tabbar' {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'preview') {
    return 'preview';
  }
  if (value === 'beta') {
    return 'beta';
  }
  return 'tabbar';
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const pageKey = String(url.searchParams.get('page_key') || '').trim();
    const channel = normalizeChannel(url.searchParams.get('channel'));
    const presentationMode = normalizePresentation(url.searchParams.get('presentation'));
    const isPreview = presentationMode === 'preview';
    const isBeta = presentationMode === 'beta';

    if (!pageKey) {
      return NextResponse.json({ error: '缺少页面标识' }, { status: 400 });
    }

    const overview = await buildPageCenterOverview();
    const pageItem = overview.find((item) => item.pageKey === pageKey) || null;
    const channelView = pageItem ? pageItem.channels[channel] : null;
    if (!pageItem || !channelView) {
      return NextResponse.json({ allowed: false, reason: 'missing' });
    }

    const dbClient = await createClient();
    const {
      data: { user },
    } = await dbClient.auth.getUser();
    let isAdmin = false;

    if (user?.id) {
      const { data: profile } = await dbClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      isAdmin = String(profile?.role || '').trim() === 'admin';
    }

    if (isPreview) {
      if (!pageItem.supportsPreview || !channelView.previewRoutePath) {
        return NextResponse.json({ allowed: false, reason: 'preview_disabled' });
      }
      if (!isAdmin) {
        return NextResponse.json({ allowed: false, reason: 'preview_admin_only' });
      }
      return NextResponse.json({ allowed: true, reason: 'admin_preview' });
    }

    if (channelView.publishState === 'offline') {
      return NextResponse.json({ allowed: false, reason: 'offline' });
    }

    if (channelView.publishState === 'online') {
      if (isBeta) {
        return NextResponse.json({ allowed: false, reason: 'beta_disabled' });
      }
      return NextResponse.json({ allowed: true, reason: 'online' });
    }

    if (channelView.publishState !== 'beta' || !pageItem.supportsBeta) {
      return NextResponse.json({ allowed: false, reason: 'beta_disabled' });
    }

    if (channel === 'miniprogram' && !isBeta) {
      return NextResponse.json({ allowed: false, reason: 'beta_preview_only' });
    }

    if (!user?.id) {
      return NextResponse.json({ allowed: false, reason: 'unauthorized' });
    }

    if (await canUsePageCenterBeta()) {
      try {
        const row = await checkUserPageBetaAccess(String(user.id), pageKey, channel);
        if (row) {
          return NextResponse.json({
            allowed: true,
            reason: isBeta ? 'beta_route' : 'beta_direct',
            data: row,
          });
        }
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === '该页面当前未开放内测入口') {
            return NextResponse.json({ allowed: false, reason: 'beta_disabled' });
          }
          if (error.message === '该内测功能已下线' || error.message === '该内测功能已过期') {
            return NextResponse.json({ allowed: false, reason: 'forbidden' });
          }
        }
        // 页面中心内测表不可用时，继续回退到旧内测逻辑
      }
    }

    const { data, error } = await dbClient.rpc('get_user_beta_features');
    if (error) {
      return NextResponse.json({ allowed: false, reason: 'forbidden' });
    }

    const mappedRows = mapLegacyFeatureRowsToPageCenterRows(readRpcRows(data), channel);
    const matched = mappedRows.find((item) => item.feature_id === pageKey) || null;
    return NextResponse.json({
      allowed: Boolean(matched),
      reason: matched ? (isBeta ? 'legacy_beta_route' : 'legacy_beta_direct') : 'forbidden',
      data: matched || undefined,
    });
  } catch (error) {
    console.error('校验页面访问权限失败:', error);
    return NextResponse.json({ error: '校验页面访问权限失败' }, { status: 500 });
  }
}
