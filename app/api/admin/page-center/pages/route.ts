import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { resolvePageCenterAdminError } from '@/lib/page-center/errors';
import {
  countAvailableBetaCodes,
  loadPagePublishRule,
  loadRegistryItemByPageKey,
  normalizeAppChannel,
  upsertPageRegistryItem,
  upsertPagePublishRule,
  validateChannelNavLimit,
} from '@/lib/page-center/admin';
import { buildPageCenterOverview } from '@/lib/page-center/runtime';
import { MIN_NAV_ITEMS_PER_CHANNEL, canPageShowInNav } from '@/lib/page-center/capabilities';
import {
  isSecondaryPageKey,
  isRemovedAppPageKey,
  normalizeNumber,
  normalizePublishState,
  normalizeText,
  PAGE_KEY_MAP,
} from '@/lib/page-center/config';

export const dynamic = 'force-dynamic';

function countEffectiveOnlineNavItems(
  overviewItems: Awaited<ReturnType<typeof buildPageCenterOverview>>,
  channel: 'web' | 'miniprogram',
  pageKey: string,
  nextPublishState: 'offline' | 'beta' | 'online',
  nextShowInNav: boolean,
  resolvedNavOrder: number
) {
  return overviewItems.reduce((count, item) => {
    const currentView = item.channels[channel];
    const effectiveView = item.pageKey === pageKey
      ? {
          ...currentView,
          publishState: nextPublishState,
          showInNav: nextShowInNav,
          navOrder: resolvedNavOrder,
          isHomeEntry: false,
        }
      : currentView;

    return count + (effectiveView.publishState === 'online' && effectiveView.showInNav ? 1 : 0);
  }, 0);
}

export async function POST(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as Record<string, unknown>;
    const pageKey = normalizeText(body.pageKey);
    const channel = normalizeAppChannel(body.channel, 'web');
    const publishState = normalizePublishState(body.publishState, 'offline');
    const navOrder = normalizeNumber(body.navOrder, 99);
    const navText = normalizeText(body.navText);
    const guestNavText = normalizeText(body.guestNavText) || navText;
    const headerTitle = normalizeText(body.headerTitle);
    const headerSubtitle = normalizeText(body.headerSubtitle);
    const notes = normalizeText(body.notes);

    if (!pageKey) {
      return NextResponse.json({ error: '缺少页面标识' }, { status: 400 });
    }
    if (isRemovedAppPageKey(pageKey)) {
      return NextResponse.json({ error: '目标页面已删除' }, { status: 404 });
    }

    let registryItem = await loadRegistryItemByPageKey(pageKey);
    if ((!registryItem || registryItem.id <= 0) && PAGE_KEY_MAP.has(pageKey)) {
      const builtIn = PAGE_KEY_MAP.get(pageKey);
      if (builtIn) {
        await upsertPageRegistryItem({
          ...builtIn,
          isActive: true,
        });
        registryItem = await loadRegistryItemByPageKey(pageKey);
      }
    }
    if (!registryItem || registryItem.id <= 0) {
      return NextResponse.json({ error: '目标页面不存在' }, { status: 404 });
    }

    const isSecondaryPage = isSecondaryPageKey(pageKey);
    const currentChannelRoutePath =
      channel === 'miniprogram' ? registryItem.routePathMiniProgram : registryItem.routePathWeb;
    if (publishState !== 'offline' && !currentChannelRoutePath) {
      return NextResponse.json(
        {
          error:
            channel === 'miniprogram'
              ? '该页面缺少小程序正式路由，无法切换为内测或上线'
              : '该页面缺少 Web 正式路由，无法切换为内测或上线',
        },
        { status: 400 }
      );
    }

    const navSupported = canPageShowInNav(registryItem, channel);
    if (publishState === 'online' && !navSupported && !isSecondaryPage) {
      return NextResponse.json(
        {
          error:
            channel === 'miniprogram'
              ? '该页面当前不支持进入小程序底部菜单'
              : '该页面当前不支持进入 Web 底部菜单',
        },
        { status: 400 }
      );
    }

    if (publishState === 'beta') {
      if (!registryItem.supportsBeta) {
        return NextResponse.json({ error: '该页面当前未开启内测能力' }, { status: 400 });
      }

      const availableBetaCodes = await countAvailableBetaCodes(registryItem.id, channel);
      if (availableBetaCodes <= 0) {
        return NextResponse.json({ error: '请先为该页面创建至少一个有效内测码，再切换到内测' }, { status: 400 });
      }
    }

    const currentRule = await loadPagePublishRule(registryItem.id, channel);
    const nextShowInNav = publishState === 'online' && navSupported;
    const resolvedNavOrder = navOrder;
    const resolvedNavText = navText || registryItem.defaultTabText;
    const resolvedGuestNavText = isSecondaryPage
      ? resolvedNavText
      : guestNavText || registryItem.defaultGuestTabText || resolvedNavText;
    const resolvedHeaderTitle = isSecondaryPage ? resolvedNavText : headerTitle;

    const overviewItems = await buildPageCenterOverview();
    const nextEffectiveOnlineCount = countEffectiveOnlineNavItems(
      overviewItems,
      channel,
      pageKey,
      publishState,
      nextShowInNav,
      resolvedNavOrder
    );

    if (nextShowInNav) {
      validateChannelNavLimit(channel, nextEffectiveOnlineCount);
    }

    const isCurrentlyOnline = Boolean(
      currentRule && currentRule.publishState === 'online' && currentRule.showInNav
    );
    if (isCurrentlyOnline && !nextShowInNav && nextEffectiveOnlineCount < MIN_NAV_ITEMS_PER_CHANNEL) {
      return NextResponse.json(
        { error: `当前端至少需要保留 ${MIN_NAV_ITEMS_PER_CHANNEL} 个已上线页面，不能下线最后一个底部菜单页面` },
        { status: 400 }
      );
    }

    await upsertPagePublishRule({
      pageId: registryItem.id,
      channel,
      publishState,
      showInNav: nextShowInNav,
      navOrder: resolvedNavOrder,
      navText: resolvedNavText,
      guestNavText: resolvedGuestNavText,
      headerTitle: resolvedHeaderTitle,
      headerSubtitle,
      isHomeEntry: false,
      notes,
      updatedBy: adminCheck.userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('保存页面发布规则失败:', error);
    const resolved = resolvePageCenterAdminError(error, {
      fallbackMessage: '保存页面发布规则失败',
    });
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
