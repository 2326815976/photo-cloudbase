import {
  MiniProgramIconKey,
  MiniProgramRuntimeConfig,
  MiniProgramTabBarItem,
  MiniProgramTabKey,
} from '@/lib/miniprogram/runtime-config';

export type AppChannel = 'web' | 'miniprogram';
export type BetaCodeChannel = AppChannel | 'shared';
export type PagePublishState = 'offline' | 'beta' | 'online';

export interface BuiltInAppPageDefinition {
  pageKey: string;
  pageName: string;
  pageDescription: string;
  routePathWeb: string;
  routePathMiniProgram: string;
  previewRoutePathWeb: string;
  previewRoutePathMiniProgram: string;
  tabKey: MiniProgramTabKey | null;
  iconKey: MiniProgramIconKey | null;
  defaultTabText: string;
  defaultGuestTabText: string;
  isNavCandidateWeb: boolean;
  isTabCandidateMiniProgram: boolean;
  supportsBeta: boolean;
  supportsPreview: boolean;
  isBuiltIn: boolean;
}

export interface AppPageRegistryItem {
  id: number;
  pageKey: string;
  pageName: string;
  pageDescription: string;
  routePathWeb: string;
  routePathMiniProgram: string;
  previewRoutePathWeb: string;
  previewRoutePathMiniProgram: string;
  tabKey: MiniProgramTabKey | null;
  iconKey: MiniProgramIconKey | null;
  defaultTabText: string;
  defaultGuestTabText: string;
  isNavCandidateWeb: boolean;
  isTabCandidateMiniProgram: boolean;
  supportsBeta: boolean;
  supportsPreview: boolean;
  isBuiltIn: boolean;
  isActive: boolean;
}

export interface AppPagePublishRuleItem {
  id: number;
  pageKey: string;
  channel: AppChannel;
  publishState: PagePublishState;
  showInNav: boolean;
  navOrder: number;
  navText: string;
  guestNavText: string;
  headerTitle: string;
  headerSubtitle: string;
  isHomeEntry: boolean;
  notes: string;
  updatedAt: string;
}

export interface AppPageBetaCodeItem {
  id: string;
  pageKey: string;
  channel: BetaCodeChannel;
  betaName: string;
  betaCode: string;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageCenterChannelRuleView {
  channel: AppChannel;
  publishState: PagePublishState;
  showInNav: boolean;
  navOrder: number;
  navText: string;
  guestNavText: string;
  headerTitle: string;
  headerSubtitle: string;
  isHomeEntry: boolean;
  notes: string;
  routePath: string;
  previewRoutePath: string;
}

export interface PageCenterOverviewItem extends AppPageRegistryItem {
  channels: Record<AppChannel, PageCenterChannelRuleView>;
  betaCodes: AppPageBetaCodeItem[];
}

export interface WebNavItem {
  pageKey: string;
  label: string;
  guestLabel: string;
  href: string;
  iconKey: MiniProgramIconKey | 'profile';
  isHomeEntry: boolean;
}

export interface WebPageAccessItem {
  pageKey: string;
  routePath: string;
  previewRoutePath: string;
  publishState: PagePublishState;
  supportsBeta: boolean;
  supportsPreview: boolean;
  navText: string;
  guestNavText: string;
  headerTitle: string;
  headerSubtitle: string;
}

export interface WebShellRuntime {
  navItems: WebNavItem[];
  homePath: string;
  pageAccessItems: WebPageAccessItem[];
  source: 'database' | 'derived_default';
}

export interface PageCenterRows {
  registryItems: AppPageRegistryItem[];
  publishRuleItems: AppPagePublishRuleItem[];
  betaCodeItems: AppPageBetaCodeItem[];
}

export interface MiniProgramPageCenterRuntimeResult {
  runtimeConfig: MiniProgramRuntimeConfig;
  source: 'database' | 'derived_default';
}

export const PAGE_CENTER_CHANNELS: AppChannel[] = ['web', 'miniprogram'];
export const PAGE_PUBLISH_STATES: PagePublishState[] = ['offline', 'beta', 'online'];

export const BUILT_IN_APP_PAGES: BuiltInAppPageDefinition[] = [
  {
    pageKey: 'pose',
    pageName: '摆姿推荐',
    pageDescription: '首页摆姿内容',
    routePathWeb: '/',
    routePathMiniProgram: 'pages/index/index',
    previewRoutePathWeb: '/?presentation=preview&page_key=pose',
    previewRoutePathMiniProgram: '/pages/profile/beta/pose/index',
    tabKey: 'home',
    iconKey: 'home',
    defaultTabText: '首页',
    defaultGuestTabText: '首页',
    isNavCandidateWeb: true,
    isTabCandidateMiniProgram: true,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'album',
    pageName: '提取',
    pageDescription: '返图与相册入口',
    routePathWeb: '/album',
    routePathMiniProgram: 'pages/album/index',
    previewRoutePathWeb: '/album?presentation=preview&page_key=album',
    previewRoutePathMiniProgram: '/pages/album/index?presentation=preview&page_key=album',
    tabKey: 'album',
    iconKey: 'album',
    defaultTabText: '提取',
    defaultGuestTabText: '提取',
    isNavCandidateWeb: true,
    isTabCandidateMiniProgram: true,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'gallery',
    pageName: '照片墙',
    pageDescription: '公开照片墙',
    routePathWeb: '/gallery',
    routePathMiniProgram: 'pages/gallery/index',
    previewRoutePathWeb: '/gallery?presentation=preview&page_key=gallery',
    previewRoutePathMiniProgram: '/pages/gallery/index?presentation=preview&page_key=gallery',
    tabKey: 'gallery',
    iconKey: 'gallery',
    defaultTabText: '照片墙',
    defaultGuestTabText: '照片墙',
    isNavCandidateWeb: true,
    isTabCandidateMiniProgram: true,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'booking',
    pageName: '约拍',
    pageDescription: '预约入口',
    routePathWeb: '/booking',
    routePathMiniProgram: 'pages/booking/index',
    previewRoutePathWeb: '/booking?presentation=preview&page_key=booking',
    previewRoutePathMiniProgram: '/pages/booking/index?presentation=preview&page_key=booking',
    tabKey: 'booking',
    iconKey: 'booking',
    defaultTabText: '约拍',
    defaultGuestTabText: '约拍',
    isNavCandidateWeb: true,
    isTabCandidateMiniProgram: true,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'profile',
    pageName: '我的',
    pageDescription: '个人中心',
    routePathWeb: '/profile',
    routePathMiniProgram: 'pages/profile/index',
    previewRoutePathWeb: '/profile?presentation=preview&page_key=profile',
    previewRoutePathMiniProgram: '/pages/profile/index?presentation=preview&page_key=profile',
    tabKey: 'profile',
    iconKey: 'profile',
    defaultTabText: '我的',
    defaultGuestTabText: '我的',
    isNavCandidateWeb: true,
    isTabCandidateMiniProgram: true,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'about',
    pageName: '关于',
    pageDescription: '关于页面',
    routePathWeb: '/profile/about',
    routePathMiniProgram: 'pages/profile/about/index',
    previewRoutePathWeb: '/profile/about?presentation=preview&page_key=about',
    previewRoutePathMiniProgram: '/pages/profile/about/index?presentation=preview&page_key=about',
    tabKey: 'about',
    iconKey: 'about',
    defaultTabText: '关于',
    defaultGuestTabText: '关于',
    isNavCandidateWeb: true,
    isTabCandidateMiniProgram: true,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: true,
  },
];

export const DEFAULT_WEB_NAV_RULES: Array<Pick<AppPagePublishRuleItem, 'pageKey' | 'publishState' | 'showInNav' | 'navOrder' | 'navText' | 'guestNavText' | 'headerTitle' | 'headerSubtitle' | 'isHomeEntry' | 'notes'>> = [
  { pageKey: 'pose', publishState: 'online', showInNav: true, navOrder: 0, navText: '首页', guestNavText: '首页', headerTitle: '', headerSubtitle: '', isHomeEntry: true, notes: '' },
  { pageKey: 'album', publishState: 'online', showInNav: true, navOrder: 1, navText: '提取', guestNavText: '提取', headerTitle: '', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'gallery', publishState: 'online', showInNav: true, navOrder: 2, navText: '照片墙', guestNavText: '照片墙', headerTitle: '', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'booking', publishState: 'online', showInNav: true, navOrder: 3, navText: '约拍', guestNavText: '约拍', headerTitle: '', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'profile', publishState: 'online', showInNav: true, navOrder: 4, navText: '我的', guestNavText: '我的', headerTitle: '', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'about', publishState: 'offline', showInNav: false, navOrder: 99, navText: '关于', guestNavText: '关于', headerTitle: '', headerSubtitle: '', isHomeEntry: false, notes: '' },
];

export const PAGE_KEY_MAP = new Map(BUILT_IN_APP_PAGES.map((item) => [item.pageKey, item]));

export function normalizePath(input: unknown): string {
  const text = String(input ?? '').trim();
  if (!text) return '';
  return text.startsWith('/') ? text : `/${text}`;
}

export function normalizeMiniProgramPath(input: unknown): string {
  return normalizePath(input).replace(/^\/+/, '');
}

export function normalizeText(input: unknown): string {
  return String(input ?? '').trim();
}

export function normalizeBoolean(input: unknown, fallback = false): boolean {
  if (input === true || input === 1 || input === '1') return true;
  if (input === false || input === 0 || input === '0') return false;
  const text = normalizeText(input).toLowerCase();
  if (!text) return fallback;
  if (['true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

export function normalizeNumber(input: unknown, fallback = 0): number {
  const value = Number(input);
  return Number.isFinite(value) ? Math.round(value) : fallback;
}

export function normalizePublishState(input: unknown, fallback: PagePublishState = 'offline'): PagePublishState {
  const text = normalizeText(input);
  if (text === 'beta' || text === 'online' || text === 'offline') {
    return text;
  }
  return fallback;
}

export function buildRegistryFallbackItems(): AppPageRegistryItem[] {
  return BUILT_IN_APP_PAGES.map((item, index) => ({
    id: index + 1,
    pageKey: item.pageKey,
    pageName: item.pageName,
    pageDescription: item.pageDescription,
    routePathWeb: item.routePathWeb,
    routePathMiniProgram: item.routePathMiniProgram,
    previewRoutePathWeb: item.previewRoutePathWeb,
    previewRoutePathMiniProgram: item.previewRoutePathMiniProgram,
    tabKey: item.tabKey,
    iconKey: item.iconKey,
    defaultTabText: item.defaultTabText,
    defaultGuestTabText: item.defaultGuestTabText,
    isNavCandidateWeb: item.isNavCandidateWeb,
    isTabCandidateMiniProgram: item.isTabCandidateMiniProgram,
    supportsBeta: item.supportsBeta,
    supportsPreview: item.supportsPreview,
    isBuiltIn: item.isBuiltIn,
    isActive: true,
  }));
}

export function createFallbackMiniProgramRuleMap(runtimeConfig: MiniProgramRuntimeConfig): Map<string, AppPagePublishRuleItem> {
  const map = new Map<string, AppPagePublishRuleItem>();
  const enabledItems = Array.isArray(runtimeConfig.tabBarItems) ? runtimeConfig.tabBarItems.filter((item) => item && item.enabled) : [];
  const pagePathToRule = new Map(enabledItems.map((item, index) => [normalizeMiniProgramPath(item.pagePath), { item, index }]));
  buildRegistryFallbackItems().forEach((page, index) => {
    const matched = pagePathToRule.get(normalizeMiniProgramPath(page.routePathMiniProgram));
    map.set(page.pageKey, {
      id: index + 1,
      pageKey: page.pageKey,
      channel: 'miniprogram',
      publishState: matched ? 'online' : 'offline',
      showInNav: Boolean(matched),
      navOrder: matched ? matched.index : 99,
      navText: matched ? matched.item.text : page.defaultTabText,
      guestNavText: matched ? matched.item.guestText : page.defaultGuestTabText,
      headerTitle: '',
      headerSubtitle: '',
      isHomeEntry: Boolean(matched && matched.index === 0),
      notes: '',
      updatedAt: '',
    });
  });
  return map;
}

export function createFallbackWebRuleMap(): Map<string, AppPagePublishRuleItem> {
  const map = new Map<string, AppPagePublishRuleItem>();
  DEFAULT_WEB_NAV_RULES.forEach((item, index) => {
    map.set(item.pageKey, {
      id: index + 1,
      pageKey: item.pageKey,
      channel: 'web',
      publishState: item.publishState,
      showInNav: item.showInNav,
      navOrder: item.navOrder,
      navText: item.navText,
      guestNavText: item.guestNavText,
      headerTitle: item.headerTitle,
      headerSubtitle: item.headerSubtitle,
      isHomeEntry: item.isHomeEntry,
      notes: item.notes,
      updatedAt: '',
    });
  });
  return map;
}

export function resolvePageRuleView(
  page: AppPageRegistryItem,
  channel: AppChannel,
  rule: AppPagePublishRuleItem | undefined,
  runtimeConfig?: MiniProgramRuntimeConfig,
  options?: { useFallback?: boolean }
): PageCenterChannelRuleView {
  const fallbackMap =
    options?.useFallback === false
      ? null
      : channel === 'web'
        ? createFallbackWebRuleMap()
        : createFallbackMiniProgramRuleMap(runtimeConfig || buildRuntimeConfigPresetForFallback());
  const fallback = fallbackMap?.get(page.pageKey);
  const resolved = rule || fallback;
  return {
    channel,
    publishState: resolved?.publishState || 'offline',
    showInNav: Boolean(resolved?.showInNav),
    navOrder: normalizeNumber(resolved?.navOrder, 99),
    navText: normalizeText(resolved?.navText) || page.defaultTabText,
    guestNavText: normalizeText(resolved?.guestNavText) || page.defaultGuestTabText || normalizeText(resolved?.navText) || page.defaultTabText,
    headerTitle: normalizeText(resolved?.headerTitle),
    headerSubtitle: normalizeText(resolved?.headerSubtitle),
    isHomeEntry: Boolean(resolved?.isHomeEntry),
    notes: normalizeText(resolved?.notes),
    routePath: channel === 'web' ? page.routePathWeb : page.routePathMiniProgram,
    previewRoutePath: channel === 'web' ? page.previewRoutePathWeb : page.previewRoutePathMiniProgram,
  };
}

function buildRuntimeConfigPresetForFallback(): MiniProgramRuntimeConfig {
  return {
    configKey: 'default',
    configName: 'fallback',
    sceneCode: 'standard',
    hideAudit: false,
    homeMode: 'pose',
    homeEntryPagePath: 'pages/index/index',
    guestProfileMode: 'login',
    authMode: 'phone_password',
    tabBarItems: [
      { key: 'home', iconKey: 'home', pagePath: 'pages/index/index', text: '首页', guestText: '首页', enabled: true },
      { key: 'album', iconKey: 'album', pagePath: 'pages/album/index', text: '提取', guestText: '提取', enabled: true },
      { key: 'gallery', iconKey: 'gallery', pagePath: 'pages/gallery/index', text: '照片墙', guestText: '照片墙', enabled: true },
      { key: 'booking', iconKey: 'booking', pagePath: 'pages/booking/index', text: '约拍', guestText: '约拍', enabled: true },
      { key: 'profile', iconKey: 'profile', pagePath: 'pages/profile/index', text: '我的', guestText: '我的', enabled: true },
    ],
    featureFlags: {
      showProfileEdit: true,
      showProfileBookings: true,
      showDonationQrCode: true,
      allowPoseBetaBypass: false,
    },
    notes: '',
    source: 'default_fallback',
    updatedAt: null,
  };
}

export function sortRuleViews<T extends { showInNav: boolean; navOrder: number; isHomeEntry: boolean; routePath: string }>(items: T[]): T[] {
  return items.slice().sort((left, right) => {
    if (left.showInNav !== right.showInNav) {
      return left.showInNav ? -1 : 1;
    }
    if (left.navOrder !== right.navOrder) {
      return left.navOrder - right.navOrder;
    }
    return left.routePath.localeCompare(right.routePath);
  });
}

export function toMiniProgramTabBarItems(
  items: Array<
    PageCenterChannelRuleView & {
      pageKey: string;
      tabKey: MiniProgramTabKey | null;
      iconKey: MiniProgramIconKey | null;
    }
  >
): MiniProgramTabBarItem[] {
  return sortRuleViews(items)
    .filter((item) => item.showInNav && item.publishState === 'online' && item.iconKey)
    .map((item) => ({
      key: (item.tabKey || item.pageKey) as MiniProgramTabKey,
      iconKey: item.iconKey as MiniProgramIconKey,
      pagePath: normalizeMiniProgramPath(item.routePath),
      text: item.navText,
      guestText: item.guestNavText || item.navText,
      enabled: true,
    }));
}

