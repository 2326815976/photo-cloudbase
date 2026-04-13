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
export const PROFILE_SECONDARY_PAGE_KEYS = [
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'profile-edit',
  'profile-bookings',
  'profile-change-password',
  'about',
  'profile-delete-account',
] as const;

export const ALBUM_SECONDARY_PAGE_KEYS = ['album-detail'] as const;

export const SECONDARY_PAGE_PARENT_KEY_MAP = {
  login: 'profile',
  register: 'profile',
  'forgot-password': 'profile',
  'reset-password': 'profile',
  about: 'profile',
  'profile-edit': 'profile',
  'profile-bookings': 'profile',
  'profile-change-password': 'profile',
  'profile-delete-account': 'profile',
  'album-detail': 'album',
} as const;

export function resolveSecondaryParentPageKey(input: unknown): string {
  const pageKey = normalizeText(input);
  return SECONDARY_PAGE_PARENT_KEY_MAP[
    pageKey as keyof typeof SECONDARY_PAGE_PARENT_KEY_MAP
  ] || '';
}

export function isSecondaryPageKey(input: unknown): boolean {
  return Boolean(resolveSecondaryParentPageKey(input));
}

export function isProfileSecondaryPageKey(input: unknown): boolean {
  return resolveSecondaryParentPageKey(input) === 'profile';
}

export function isAlbumSecondaryPageKey(input: unknown): boolean {
  return resolveSecondaryParentPageKey(input) === 'album';
}

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
    pageKey: 'album-detail',
    pageName: '专属返图空间',
    pageDescription: '提取页进入的返图空间详情',
    routePathWeb: '/album/[id]',
    routePathMiniProgram: 'pages/album/detail',
    previewRoutePathWeb: '',
    previewRoutePathMiniProgram: '',
    tabKey: null,
    iconKey: null,
    defaultTabText: '专属返图空间',
    defaultGuestTabText: '专属返图空间',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: false,
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
    pageKey: 'login',
    pageName: '登录',
    pageDescription: '我的页访客登录入口',
    routePathWeb: '/login',
    routePathMiniProgram: 'pages/login/index',
    previewRoutePathWeb: '/login?presentation=preview&page_key=login',
    previewRoutePathMiniProgram: '/pages/login/index?presentation=preview&page_key=login',
    tabKey: null,
    iconKey: null,
    defaultTabText: '登录',
    defaultGuestTabText: '登录',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'register',
    pageName: '注册',
    pageDescription: '我的页访客注册入口',
    routePathWeb: '/register',
    routePathMiniProgram: 'pages/register/index',
    previewRoutePathWeb: '/register?presentation=preview&page_key=register',
    previewRoutePathMiniProgram: '/pages/register/index?presentation=preview&page_key=register',
    tabKey: null,
    iconKey: null,
    defaultTabText: '注册',
    defaultGuestTabText: '注册',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'forgot-password',
    pageName: '忘记密码',
    pageDescription: '登录页访客找回密码说明',
    routePathWeb: '/auth/forgot-password',
    routePathMiniProgram: 'pages/auth/forgot-password/index',
    previewRoutePathWeb: '/auth/forgot-password?presentation=preview&page_key=forgot-password',
    previewRoutePathMiniProgram:
      '/pages/auth/forgot-password/index?presentation=preview&page_key=forgot-password',
    tabKey: null,
    iconKey: null,
    defaultTabText: '忘记密码',
    defaultGuestTabText: '忘记密码',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'reset-password',
    pageName: '重置密码',
    pageDescription: '访客态密码重置说明页',
    routePathWeb: '/auth/reset-password',
    routePathMiniProgram: 'pages/auth/reset-password/index',
    previewRoutePathWeb: '/auth/reset-password?presentation=preview&page_key=reset-password',
    previewRoutePathMiniProgram:
      '/pages/auth/reset-password/index?presentation=preview&page_key=reset-password',
    tabKey: null,
    iconKey: null,
    defaultTabText: '重置密码',
    defaultGuestTabText: '重置密码',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
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
    tabKey: null,
    iconKey: null,
    defaultTabText: '关于',
    defaultGuestTabText: '关于',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'profile-edit',
    pageName: '编辑个人资料',
    pageDescription: '我的页个人资料编辑入口',
    routePathWeb: '/profile/edit',
    routePathMiniProgram: 'pages/profile/edit/index',
    previewRoutePathWeb: '/profile/edit?presentation=preview&page_key=profile-edit',
    previewRoutePathMiniProgram: '/pages/profile/edit/index?presentation=preview&page_key=profile-edit',
    tabKey: null,
    iconKey: null,
    defaultTabText: '编辑个人资料',
    defaultGuestTabText: '编辑个人资料',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'profile-bookings',
    pageName: '我的预约记录',
    pageDescription: '我的页预约记录入口',
    routePathWeb: '/profile/bookings',
    routePathMiniProgram: 'pages/profile/bookings/index',
    previewRoutePathWeb: '/profile/bookings?presentation=preview&page_key=profile-bookings',
    previewRoutePathMiniProgram: '/pages/profile/bookings/index?presentation=preview&page_key=profile-bookings',
    tabKey: null,
    iconKey: null,
    defaultTabText: '我的预约记录',
    defaultGuestTabText: '我的预约记录',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'profile-change-password',
    pageName: '修改密码',
    pageDescription: '我的页密码修改入口',
    routePathWeb: '/profile/change-password',
    routePathMiniProgram: 'pages/profile/change-password/index',
    previewRoutePathWeb: '/profile/change-password?presentation=preview&page_key=profile-change-password',
    previewRoutePathMiniProgram:
      '/pages/profile/change-password/index?presentation=preview&page_key=profile-change-password',
    tabKey: null,
    iconKey: null,
    defaultTabText: '修改密码',
    defaultGuestTabText: '修改密码',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
    supportsPreview: true,
    isBuiltIn: true,
  },
  {
    pageKey: 'profile-delete-account',
    pageName: '删除账户',
    pageDescription: '我的页账户删除入口',
    routePathWeb: '/profile/delete-account',
    routePathMiniProgram: 'pages/profile/delete-account/index',
    previewRoutePathWeb: '/profile/delete-account?presentation=preview&page_key=profile-delete-account',
    previewRoutePathMiniProgram:
      '/pages/profile/delete-account/index?presentation=preview&page_key=profile-delete-account',
    tabKey: null,
    iconKey: null,
    defaultTabText: '删除账户',
    defaultGuestTabText: '删除账户',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: false,
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
];

export const DEFAULT_SECONDARY_PAGE_RULES: Array<
  Pick<
    AppPagePublishRuleItem,
    'pageKey' | 'publishState' | 'showInNav' | 'navOrder' | 'navText' | 'guestNavText' | 'headerTitle' | 'headerSubtitle' | 'isHomeEntry' | 'notes'
  >
> = [
  { pageKey: 'login', publishState: 'online', showInNav: false, navOrder: 99, navText: '登录', guestNavText: '登录', headerTitle: '登录', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'register', publishState: 'online', showInNav: false, navOrder: 99, navText: '注册', guestNavText: '注册', headerTitle: '注册', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'forgot-password', publishState: 'online', showInNav: false, navOrder: 99, navText: '忘记密码', guestNavText: '忘记密码', headerTitle: '忘记密码', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'reset-password', publishState: 'online', showInNav: false, navOrder: 99, navText: '重置密码', guestNavText: '重置密码', headerTitle: '重置密码', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'profile-edit', publishState: 'online', showInNav: false, navOrder: 99, navText: '编辑个人资料', guestNavText: '编辑个人资料', headerTitle: '编辑个人资料', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'profile-bookings', publishState: 'online', showInNav: false, navOrder: 99, navText: '我的预约记录', guestNavText: '我的预约记录', headerTitle: '我的预约记录', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'profile-change-password', publishState: 'online', showInNav: false, navOrder: 99, navText: '修改密码', guestNavText: '修改密码', headerTitle: '修改密码', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'about', publishState: 'online', showInNav: false, navOrder: 99, navText: '关于', guestNavText: '关于', headerTitle: '关于', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'profile-delete-account', publishState: 'online', showInNav: false, navOrder: 99, navText: '删除账户', guestNavText: '删除账户', headerTitle: '删除账户', headerSubtitle: '', isHomeEntry: false, notes: '' },
  { pageKey: 'album-detail', publishState: 'online', showInNav: false, navOrder: 99, navText: '专属返图空间', guestNavText: '专属返图空间', headerTitle: '专属返图空间', headerSubtitle: '', isHomeEntry: false, notes: '' },
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
  DEFAULT_SECONDARY_PAGE_RULES.forEach((item, index) => {
    map.set(item.pageKey, {
      id: buildRegistryFallbackItems().length + index + 1,
      pageKey: item.pageKey,
      channel: 'miniprogram',
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
  DEFAULT_SECONDARY_PAGE_RULES.forEach((item, index) => {
    map.set(item.pageKey, {
      id: DEFAULT_WEB_NAV_RULES.length + index + 1,
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
  const isSecondaryPage = isSecondaryPageKey(page.pageKey);
  const navText = normalizeText(resolved?.navText) || page.defaultTabText || page.pageName;
  const guestNavText = isSecondaryPage
    ? navText
    : normalizeText(resolved?.guestNavText) ||
      page.defaultGuestTabText ||
      navText ||
      page.defaultTabText ||
      page.pageName;

  return {
    channel,
    publishState: resolved?.publishState || 'offline',
    showInNav: isSecondaryPage ? false : Boolean(resolved?.showInNav),
    navOrder: isSecondaryPage ? 99 : normalizeNumber(resolved?.navOrder, 99),
    navText,
    guestNavText,
    headerTitle: isSecondaryPage ? navText : normalizeText(resolved?.headerTitle),
    headerSubtitle: normalizeText(resolved?.headerSubtitle),
    isHomeEntry: isSecondaryPage ? false : Boolean(resolved?.isHomeEntry),
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

