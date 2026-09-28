import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import {
  canUseLegacyPageCenterBeta,
  checkLegacyUserPageBetaAccess,
} from '@/lib/page-center/legacy-beta-compat';
import { canUsePageCenterBeta, checkUserPageBetaAccess } from '@/lib/page-center/user-beta';

export const dynamic = 'force-dynamic';

function normalizeChannel(input: string | null) {
  return input === 'miniprogram' ? 'miniprogram' : 'web';
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

    const [pageCenterEnabled, legacyAvailable] = await Promise.all([
      canUsePageCenterBeta(),
      canUseLegacyPageCenterBeta(),
    ]);
    const legacyEnabled = legacyAvailable;

    if (pageCenterEnabled) {
      try {
        const row = await checkUserPageBetaAccess(String(user.id), pageKey, channel);
        if (row) {
          return NextResponse.json({ allowed: true, data: row, reason: 'page_center' });
        }
      } catch (error) {
        if (isPageCenterBusinessError(error)) {
          if (!legacyEnabled) {
            return NextResponse.json({
              allowed: false,
              error: readBusinessErrorMessage(error),
              reason: 'page_center_denied',
            });
          }
        } else if (!legacyEnabled) {
          throw error;
        } else {
          console.error('校验页面内测权限失败（新体系，Web 兼容旧体系）:', error);
        }
      }
    }

    if (legacyEnabled) {
      const row = await checkLegacyUserPageBetaAccess(String(user.id), pageKey, channel);
      if (row) {
        return NextResponse.json({ allowed: true, data: row, reason: 'legacy_compatible' });
      }
    }

    if (!pageCenterEnabled && !legacyEnabled) {
      return NextResponse.json({
        allowed: false,
        error: '页面内测新体系未就绪，请先完成页面中心内测配置',
        reason: 'beta_service_unavailable',
      });
    }

    return NextResponse.json({ allowed: false, reason: 'forbidden' });
  } catch (error) {
    console.error('校验页面内测权限失败:', error);
    return NextResponse.json({ error: '校验页面内测权限失败' }, { status: 500 });
  }
}
