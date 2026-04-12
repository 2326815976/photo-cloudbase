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
    defaultText: '返图',
    defaultGuestText: '返图',
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

export const SUPPORTED_MINIPROGRAM_ICON_KEYS = ['home', 'album', 'gallery', 'booking', 'profile', 'about'] as const;

export type MiniProgramTabKey = string;
export type MiniProgramIconKey = (typeof SUPPORTED_MINIPROGRAM_ICON_KEYS)[number] | string;
export type MiniProgramSceneCode = 'standard' | 'review' | 'custom';
export type MiniProgramHomeMode = 'pose' | 'gallery';
export type MiniProgramGuestProfileMode = 'login' | 'about';
export type MiniProgramAuthMode = 'phone_password' | 'wechat_only' | 'mixed';
export type MiniProgramRuntimeConfigSource = 'database' | 'env_legacy' | 'default_fallback';

export interface MiniProgramTabBarItem {
  key: MiniProgramTabKey;
  iconKey: MiniProgramIconKey;
  pagePath: string;
  text: string;
  guestText: string;
  enabled: boolean;
}

export interface MiniProgramFeatureFlags {
  showProfileEdit: boolean;
  showProfileBookings: boolean;
  showDonationQrCode: boolean;
  allowPoseBetaBypass: boolean;
}

export interface MiniProgramManagedPageAccessItem {
  pageKey: string;
  routePath: string;
  previewRoutePath: string;
  publishState: 'offline' | 'beta' | 'online';
  navText: string;
  guestNavText: string;
  headerTitle: string;
  headerSubtitle: string;
}

export interface MiniProgramRuntimeConfig {
  configKey: string;
  configName: string;
  sceneCode: MiniProgramSceneCode;
  hideAudit: boolean;
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
  legacy_hide_audit?: unknown;
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
  return String(value ?? '').trim();
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
      navText: toText(current.navText),
      guestNavText: toText(current.guestNavText),
      headerTitle: toText(current.headerTitle),
      headerSubtitle: toText(current.headerSubtitle),
    };
    return map;
  }, {});
}

function normalizeSceneCode(value: unknown, hideAudit: boolean): MiniProgramSceneCode {
  const text = toText(value);
  if (text === 'standard' || text === 'review' || text === 'custom') {
    return text;
  }
  return hideAudit ? 'review' : 'standard';
}

function normalizeHomeMode(value: unknown, hideAudit: boolean): MiniProgramHomeMode {
  const text = toText(value);
  if (text === 'pose' || text === 'gallery') {
    return text;
  }
  return hideAudit ? 'gallery' : 'pose';
}

function normalizeGuestProfileMode(value: unknown, hideAudit: boolean): MiniProgramGuestProfileMode {
  const text = toText(value);
  if (text === 'login' || text === 'about') {
    return text;
  }
  return hideAudit ? 'about' : 'login';
}

function normalizeAuthMode(value: unknown, hideAudit: boolean): MiniProgramAuthMode {
  const text = toText(value);
  if (text === 'phone_password' || text === 'wechat_only' || text === 'mixed') {
    return text;
  }
  return hideAudit ? 'wechat_only' : 'phone_password';
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
      text: '返图',
      guestText: '返图',
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
  return [
    {
      key: 'gallery',
      iconKey: 'gallery',
      pagePath: 'pages/gallery/index',
      text: '照片墙',
      guestText: '照片墙',
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
      key: 'profile',
      iconKey: 'profile',
      pagePath: 'pages/profile/index',
      text: '我的',
      guestText: '关于',
      enabled: true,
    },
  ];
}

export function buildFeatureFlagsPreset(hideAudit: boolean): MiniProgramFeatureFlags {
  return hideAudit
    ? {
        showProfileEdit: false,
        showProfileBookings: false,
        showDonationQrCode: false,
        allowPoseBetaBypass: true,
      }
    : {
        showProfileEdit: true,
        showProfileBookings: true,
        showDonationQrCode: true,
        allowPoseBetaBypass: false,
      };
}

export function buildRuntimeConfigPreset(sceneCode: MiniProgramSceneCode): MiniProgramRuntimeConfig {
  if (sceneCode === 'review') {
    return {
      configKey: 'default',
      configName: '审核版配置',
      sceneCode: 'review',
      hideAudit: true,
      homeMode: 'gallery',
      homeEntryPagePath: 'pages/gallery/index',
      guestProfileMode: 'about',
      authMode: 'wechat_only',
      tabBarItems: buildReviewTabBarItems(),
      featureFlags: buildFeatureFlagsPreset(true),
      managedPageMetaMap: {},
      managedPageAccessMap: {},
      notes: '',
      source: 'default_fallback',
      updatedAt: null,
    };
  }

  return {
    configKey: 'default',
    configName: sceneCode === 'custom' ? '自定义配置' : '正式版配置',
    sceneCode,
    hideAudit: false,
    homeMode: 'pose',
    homeEntryPagePath: 'pages/index/index',
    guestProfileMode: 'login',
    authMode: 'phone_password',
    tabBarItems: buildStandardTabBarItems(),
    featureFlags: buildFeatureFlagsPreset(false),
    managedPageMetaMap: {},
    managedPageAccessMap: {},
    notes: '',
    source: 'default_fallback',
    updatedAt: null,
  };
}

export function parseBooleanEnv(input: string | undefined): boolean | null {
  const text = toText(input).toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return null;
}

export function normalizeTabBarItems(
  input: unknown,
  options?: { hideAudit?: boolean }
): MiniProgramTabBarItem[] {
  const hideAudit = Boolean(options?.hideAudit);
  const fallback = hideAudit ? buildReviewTabBarItems() : buildStandardTabBarItems();
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
    const resolvedPagePath = toText(row.pagePath) || option?.pagePath || '';
    if (!resolvedPagePath) {
      return;
    }

    if (seen.has(resolvedPagePath)) {
      return;
    }
    seen.add(resolvedPagePath);

    const text = toText(row.text) || option?.defaultText || '页面';
    const guestText = toText(row.guestText) || toText(row.guest_label) || option?.defaultGuestText || text;
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
  input: unknown,
  options?: { hideAudit?: boolean }
): MiniProgramFeatureFlags {
  const hideAudit = Boolean(options?.hideAudit);
  const fallback = buildFeatureFlagsPreset(hideAudit);
  const row = parseJsonObject(input);
  if (!row) {
    return fallback;
  }

  return {
    showProfileEdit: toBoolean(row.showProfileEdit, fallback.showProfileEdit),
    showProfileBookings: toBoolean(row.showProfileBookings, fallback.showProfileBookings),
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

  const hideAudit = toBoolean(row.legacy_hide_audit, false);
  const sceneCode = normalizeSceneCode(row.scene_code, hideAudit);
  const homeMode = normalizeHomeMode(row.home_mode, hideAudit);
  const guestProfileMode = normalizeGuestProfileMode(row.guest_profile_mode, hideAudit);
  const authMode = normalizeAuthMode(row.auth_mode, hideAudit);
  const tabBarItems = normalizeTabBarItems(row.tab_bar_items_json, { hideAudit });
  const featureFlags = normalizeFeatureFlags(row.feature_flags_json, { hideAudit });
  const homeEntryPagePath = normalizeHomeEntryPagePath(null, tabBarItems, homeMode);

  return {
    configKey: toText(row.config_key) || 'default',
    configName: toText(row.config_name) || (hideAudit ? '审核版配置' : '正式版配置'),
    sceneCode,
    hideAudit,
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

export function buildLegacyEnvRuntimeConfig(hideAudit: boolean): MiniProgramRuntimeConfig {
  const preset = buildRuntimeConfigPreset(hideAudit ? 'review' : 'standard');
  return {
    ...preset,
    managedPageMetaMap: {},
    configName: hideAudit ? '环境变量审核版回退' : '环境变量正式版回退',
    source: 'env_legacy',
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
    showProfileEdit: Boolean(flags.showProfileEdit),
    showProfileBookings: Boolean(flags.showProfileBookings),
    showDonationQrCode: Boolean(flags.showDonationQrCode),
    allowPoseBetaBypass: Boolean(flags.allowPoseBetaBypass),
  });
}
