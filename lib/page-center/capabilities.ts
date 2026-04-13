import type { AppChannel, AppPageRegistryItem } from '@/lib/page-center/config';
import { isSecondaryPageKey } from '@/lib/page-center/config';

export const MAX_WEB_NAV_ITEMS = 5;
export const MAX_MINIPROGRAM_NAV_ITEMS = 5;
export const MIN_NAV_ITEMS_PER_CHANNEL = 1;

type PageNavCapabilitySource = Pick<
  AppPageRegistryItem,
  'pageKey' | 'iconKey' | 'tabKey' | 'isNavCandidateWeb' | 'isTabCandidateMiniProgram'
>;

export function canPageShowInNav(page: PageNavCapabilitySource, channel: AppChannel): boolean {
  if (isSecondaryPageKey(page.pageKey)) {
    return false;
  }

  if (channel === 'web') {
    return Boolean(page.isNavCandidateWeb);
  }

  return Boolean(page.isTabCandidateMiniProgram && page.iconKey);
}

export function canPageBeHomeEntry(page: PageNavCapabilitySource, channel: AppChannel): boolean {
  return canPageShowInNav(page, channel);
}

export function getChannelNavLimit(channel: AppChannel): number {
  return channel === 'miniprogram' ? MAX_MINIPROGRAM_NAV_ITEMS : MAX_WEB_NAV_ITEMS;
}
