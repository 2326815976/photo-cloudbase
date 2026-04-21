export const MINIPROGRAM_TAB_PAGE_OPTIONS = [
  {
    key: 'home',
    iconKey: 'home',
    pagePath: 'pages/index/index',
    defaultText: '首页',
    defaultGuestText: '首页',
  },
  {
    key: 'album',
    iconKey: 'album',
    pagePath: 'pages/album/index',
    defaultText: '提取',
    defaultGuestText: '提取',
  },
  {
    key: 'gallery',
    iconKey: 'gallery',
    pagePath: 'pages/gallery/index',
    defaultText: '照片墙',
    defaultGuestText: '照片墙',
  },
  {
    key: 'booking',
    iconKey: 'booking',
    pagePath: 'pages/booking/index',
    defaultText: '约拍',
    defaultGuestText: '约拍',
  },
  {
    key: 'profile',
    iconKey: 'profile',
    pagePath: 'pages/profile/index',
    defaultText: '我的',
    defaultGuestText: '我的',
  },
] as const;

export const SUPPORTED_MINIPROGRAM_ICON_KEYS = ['home', 'album', 'gallery', 'booking', 'profile'] as const;

export type MiniProgramTabKey = string;
export type MiniProgramIconKey = (typeof SUPPORTED_MINIPROGRAM_ICON_KEYS)[number] | string;
export type MiniProgramSceneCode = 'standard' | 'review' | 'custom';
export type MiniProgramHomeMode = 'pose' | 'gallery';
export type MiniProgramGuestProfileMode = 'login';
export type MiniProgramAuthMode = 'phone_password' | 'wechat_only' | 'mixed';
export type MiniProgramRuntimeConfigSource = 'database' | 'default_fallback';

export interface MiniProgramTabBarItem {
  key: MiniProgramTabKey;
  iconKey: MiniProgramIconKey;
  pagePath: string;
  text: string;
  guestText: string;
  enabled: boolean;
}

export interface MiniProgramFeatureFlags {
  showDonationQrCode: boolean;
  allowPoseBetaBypass: boolean;
}

export interface MiniProgramManagedPageAccessItem {
  pageKey: string;
  routePath: string;
  previewRoutePath: string;
  publishState: 'offline' | 'beta' | 'online';
  navOrder: number;
  navText: string;
  guestNavText: string;
  headerTitle: string;
  headerSubtitle: string;
}

export interface MiniProgramRuntimeConfig {
  configKey: string;
  configName: string;
  sceneCode: MiniProgramSceneCode;
  homeMode: MiniProgramHomeMode;
  homeEntryPagePath: string;
  guestProfileMode: MiniProgramGuestProfileMode;
  authMode: MiniProgramAuthMode;
  tabBarItems: MiniProgramTabBarItem[];
  featureFlags: MiniProgramFeatureFlags;
  managedPageMetaMap?: Record<string, { title: string; subtitle: string }>;
  managedPageAccessMap?: Record<string, MiniProgramManagedPageAccessItem>;
  notes: string;
  source: MiniProgramRuntimeConfigSource;
  updatedAt: string | null;
}

export interface MiniProgramRuntimeConfigRow {
  id?: number | string | null;
  config_key?: unknown;
  config_name?: unknown;
  scene_code?: unknown;
  home_mode?: unknown;
  guest_profile_mode?: unknown;
  auth_mode?: unknown;
  tab_bar_items_json?: unknown;
  feature_flags_json?: unknown;
  notes?: unknown;
  updated_at?: unknown;
}

const tabPageOptionMap = new Map<string, (typeof MINIPROGRAM_TAB_PAGE_OPTIONS)[number]>(
  MINIPROGRAM_TAB_PAGE_OPTIONS.map((item) => [item.pagePath, item])
);

const tabKeyOptionMap = new Map<string, (typeof MINIPROGRAM_TAB_PAGE_OPTIONS)[number]>(
  MINIPROGRAM_TAB_PAGE_OPTIONS.map((item) => [item.key, item])
);
const MAX_TAB_BAR_ITEMS = 5;

const supportedIconKeySet = new Set<string>(SUPPORTED_MINIPROGRAM_ICON_KEYS);

function normalizeTabKey(value: unknown, fallback: string): string {
  const text = toText(value);
  return text || fallback;
}

function normalizeIconKey(value: unknown, fallback: MiniProgramIconKey): MiniProgramIconKey {
  const text = toText(value);
  if (text && supportedIconKeySet.has(text)) {
    return text;
  }
  return fallback;
}

function toText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }
  const normalized = text.toLowerCase();
  if (normalized === 'null' || normalized === 'undefined' || normalized === 'nil' || normalized === 'none') {
    return '';
  }
  return text;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value !== 0 : fallback;
  }

  const text = toText(value).toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function parseJsonObject(input: unknown): Record<string, unknown> | null {
  if (!input) return null;

  if (typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }

  if (typeof input !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }

  return null;
}

function parseJsonArray(input: unknown): Array<Record<string, unknown>> | null {
  if (!input) return null;

  if (Array.isArray(input)) {
    return input.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  }

  if (typeof input !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(input);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeManagedPageAccessMap(
  input: unknown
): Record<string, MiniProgramManagedPageAccessItem> {
  const source =
    input && typeof input === 'object' && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : parseJsonObject(input) || {};

  return Object.keys(source).reduce<Record<string, MiniProgramManagedPageAccessItem>>((map, pageKey) => {
    const normalizedPageKey = toText(pageKey);
    if (!normalizedPageKey) {
      return map;
    }

    const current =
      source[pageKey] && typeof source[pageKey] === 'object' && !Array.isArray(source[pageKey])
        ? (source[pageKey] as Record<string, unknown>)
        : {};
    const publishState = toText(current.publishState);
    map[normalizedPageKey] = {
      pageKey: normalizedPageKey,
      routePath: toText(current.routePath),
      previewRoutePath: toText(current.previewRoutePath),
      publishState: publishState === 'online' || publishState === 'beta' ? publishState : 'offline',
      navOrder: Number.isFinite(Number(current.navOrder)) ? Number(current.navOrder) : 99,
      navText: toText(current.navText),
      guestNavText: toText(current.guestNavText),
      headerTitle: toText(current.headerTitle),
      headerSubtitle: toText(current.headerSubtitle),
    };
    return map;
  }, {});
}

function normalizeSceneCode(value: unknown): MiniProgramSceneCode {
  const text = toText(value);
  if (text === 'standard' || text === 'review' || text === 'custom') {
    return text;
  }
  return 'standard';
}

function normalizeHomeMode(value: unknown): MiniProgramHomeMode {
  const text = toText(value);
  if (text === 'pose' || text === 'gallery') {
    return text;
  }
  return 'pose';
}

function normalizeGuestProfileMode(value: unknown): MiniProgramGuestProfileMode {
  void value;
  return 'login';
}

function normalizeAuthMode(value: unknown): MiniProgramAuthMode {
  const text = toText(value);
  if (text === 'phone_password' || text === 'wechat_only' || text === 'mixed') {
    return text;
  }
  return 'wechat_only';
}

export function buildStandardTabBarItems(): MiniProgramTabBarItem[] {
  return [
    {
      key: 'home',
      iconKey: 'home',
      pagePath: 'pages/index/index',
      text: '首页',
      guestText: '首页',
      enabled: true,
    },
    {
      key: 'album',
      iconKey: 'album',
      pagePath: 'pages/album/index',
      text: '提取',
      guestText: '提取',
      enabled: true,
    },
    {
      key: 'gallery',
      iconKey: 'gallery',
      pagePath: 'pages/gallery/index',
      text: '照片墙',
      guestText: '照片墙',
      enabled: true,
    },
    {
      key: 'booking',
      iconKey: 'booking',
      pagePath: 'pages/booking/index',
      text: '约拍',
      guestText: '约拍',
      enabled: true,
    },
    {
      key: 'profile',
      iconKey: 'profile',
      pagePath: 'pages/profile/index',
      text: '我的',
      guestText: '我的',
      enabled: true,
    },
  ];
}

export function buildReviewTabBarItems(): MiniProgramTabBarItem[] {
  return buildStandardTabBarItems();
}

export function buildFeatureFlagsPreset(): MiniProgramFeatureFlags {
  return {
    showDonationQrCode: true,
    allowPoseBetaBypass: false,
  };
}

export function buildRuntimeConfigPreset(sceneCode: MiniProgramSceneCode): MiniProgramRuntimeConfig {
  return {
    configKey: 'default',
    configName:
      sceneCode === 'review'
        ? '审核场景配置'
        : sceneCode === 'custom'
          ? '自定义页面配置'
          : '标准发布配置',
    sceneCode,
    homeMode: 'pose',
    homeEntryPagePath: 'pages/index/index',
    guestProfileMode: 'login',
    authMode: 'wechat_only',
    tabBarItems: buildStandardTabBarItems(),
    featureFlags: buildFeatureFlagsPreset(),
    managedPageMetaMap: {},
    managedPageAccessMap: {},
    notes: '',
    source: 'default_fallback',
    updatedAt: null,
  };
}



export function normalizeTabBarItems(
  input: unknown
): MiniProgramTabBarItem[] {
  const fallback = buildStandardTabBarItems();
  const rows = parseJsonArray(input);
  if (!rows || rows.length === 0) {
    return fallback;
  }

  const normalized: MiniProgramTabBarItem[] = [];
  const seen = new Set<string>();

  rows.forEach((row) => {
    const pagePath = toText(row.pagePath);
    const matchedByPath = tabPageOptionMap.get(pagePath);
    const rawKey = toText(row.key);
    const matchedByKey = rawKey ? tabKeyOptionMap.get(rawKey) : undefined;
    const option = matchedByPath ?? matchedByKey;
    if (!option?.pagePath) {
      return;
    }
    const resolvedPagePath = toText(row.pagePath) || option?.pagePath || '';
    if (!resolvedPagePath) {
      return;
    }

    if (seen.has(resolvedPagePath)) {
      return;
    }
    seen.add(resolvedPagePath);

    const isProfileTab = resolvedPagePath === 'pages/profile/index' || option?.key === 'profile';
    const text = isProfileTab ? option?.defaultText || '我的' : toText(row.text) || option?.defaultText || '页面';
    const guestText = isProfileTab
      ? text
      : toText(row.guestText) || toText(row.guest_label) || option?.defaultGuestText || text;
    const keyFallback = option?.key || resolvedPagePath;
    const iconFallback = option?.iconKey || 'profile';
    normalized.push({
      key: normalizeTabKey(row.key, keyFallback),
      iconKey: normalizeIconKey(row.iconKey, iconFallback),
      pagePath: resolvedPagePath,
      text,
      guestText,
      enabled: toBoolean(row.enabled, true),
    });
  });

  const enabledRows = normalized.filter((item) => item.enabled);
  return (enabledRows.length > 0 ? enabledRows : fallback).slice(0, MAX_TAB_BAR_ITEMS);
}

export function normalizeFeatureFlags(
  input: unknown
): MiniProgramFeatureFlags {
  const fallback = buildFeatureFlagsPreset();
  const row = parseJsonObject(input);
  if (!row) {
    return fallback;
  }

  return {
    showDonationQrCode: toBoolean(row.showDonationQrCode, fallback.showDonationQrCode),
    allowPoseBetaBypass: toBoolean(row.allowPoseBetaBypass, fallback.allowPoseBetaBypass),
  };
}

export function normalizeHomeEntryPagePath(value: unknown, tabBarItems: MiniProgramTabBarItem[], homeMode: MiniProgramHomeMode): string {
  const raw = toText(value).replace(/^\/+/, '');
  const matched = tabBarItems.find((item) => item.pagePath === raw && item.enabled);
  if (matched) {
    return matched.pagePath;
  }
  if (homeMode === 'pose') {
    return 'pages/index/index';
  }
  const firstEnabled = tabBarItems.find((item) => item.enabled);
  return firstEnabled?.pagePath || 'pages/gallery/index';
}

export function normalizeRuntimeConfigRow(
  row: MiniProgramRuntimeConfigRow | null | undefined
): MiniProgramRuntimeConfig | null {
  if (!row) {
    return null;
  }

  const sceneCode = normalizeSceneCode(row.scene_code);
  const homeMode = normalizeHomeMode(row.home_mode);
  const guestProfileMode = normalizeGuestProfileMode(row.guest_profile_mode);
  const authMode = normalizeAuthMode(row.auth_mode);
  const tabBarItems = normalizeTabBarItems(row.tab_bar_items_json);
  const featureFlags = normalizeFeatureFlags(row.feature_flags_json);
  const homeEntryPagePath = normalizeHomeEntryPagePath(null, tabBarItems, homeMode);

  return {
    configKey: toText(row.config_key) || 'default',
    configName:
      toText(row.config_name) ||
      (sceneCode === 'review'
        ? '审核场景配置'
        : sceneCode === 'custom'
          ? '自定义页面配置'
          : '标准发布配置'),
    sceneCode,
    homeMode,
    homeEntryPagePath,
    guestProfileMode,
    authMode,
    tabBarItems,
    featureFlags,
    managedPageMetaMap: {},
    managedPageAccessMap: {},
    notes: toText(row.notes),
    source: 'database',
    updatedAt: toText(row.updated_at) || null,
  };
}



export function serializeTabBarItems(items: MiniProgramTabBarItem[]): string {
  return JSON.stringify(
    (Array.isArray(items) ? items : []).map((item) => ({
      key: item.key,
      iconKey: item.iconKey,
      pagePath: item.pagePath,
      text: toText(item.text),
      guestText: toText(item.guestText) || toText(item.text),
      enabled: Boolean(item.enabled),
    }))
  );
}

export function serializeFeatureFlags(flags: MiniProgramFeatureFlags): string {
  return JSON.stringify({
    showDonationQrCode: Boolean(flags.showDonationQrCode),
    allowPoseBetaBypass: Boolean(flags.allowPoseBetaBypass),
  });
}
