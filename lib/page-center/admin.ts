import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import {
  AppChannel,
  AppPageBetaCodeItem,
  AppPagePublishRuleItem,
  AppPageRegistryItem,
  BetaCodeChannel,
  normalizeBoolean,
  normalizeNumber,
  normalizePath,
  normalizeText,
  PagePublishState,
} from '@/lib/page-center/config';
import { getChannelNavLimit } from '@/lib/page-center/capabilities';
import { createPageCenterSchemaError } from '@/lib/page-center/errors';
import { hasTableColumns, tableExists } from '@/lib/page-center/sql-compat';
import { generateAdminBetaFeatureCode, normalizeBetaExpiresAt } from '@/lib/utils/admin-beta';

const PAGE_REGISTRY_ICON_KEYS = new Set(['home', 'album', 'gallery', 'booking', 'profile', 'about']);
const NOW_UTC8_EXPR = "CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')";
const PAGE_CENTER_MIGRATION_MESSAGE =
  '页面管理依赖的数据表结构未完成升级，请先执行最新数据库迁移（至少同步 12、 13、 16、 21 号迁移）。';

async function hasRegistryWebNavCandidateColumn() {
  return hasTableColumns('app_page_registry', ['is_nav_candidate_web']);
}

async function hasPublishRuleHeaderColumns() {
  return hasTableColumns('app_page_publish_rules', ['header_title', 'header_subtitle']);
}

async function ensurePageCenterTableReady(tableName: string, featureLabel: string) {
  if (await tableExists(tableName)) {
    return;
  }

  throw createPageCenterSchemaError(
    `${featureLabel}依赖的数据表 ${tableName} 缺失。${PAGE_CENTER_MIGRATION_MESSAGE}`
  );
}

export function normalizeAppChannel(input: unknown, fallback: AppChannel = 'web'): AppChannel {
  return normalizeText(input) === 'miniprogram' ? 'miniprogram' : fallback;
}

export function normalizeBetaChannel(
  input: unknown,
  fallback: BetaCodeChannel = 'shared'
): BetaCodeChannel {
  const text = normalizeText(input);
  if (text === 'web' || text === 'miniprogram' || text === 'shared') {
    return text;
  }
  return fallback;
}

export function normalizePageRegistryKey(input: unknown, fallback = ''): string {
  const text = normalizeText(input)
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 64);
  return text || fallback;
}

function normalizePageRegistryTabKey(
  input: unknown,
  fallback: AppPageRegistryItem['tabKey'] = null
): AppPageRegistryItem['tabKey'] {
  const text = normalizePageRegistryKey(input);
  return (text || fallback) as AppPageRegistryItem['tabKey'];
}

export function normalizePageIconKey(
  input: unknown,
  fallback: AppPageRegistryItem['iconKey'] = null
): AppPageRegistryItem['iconKey'] {
  const text = normalizeText(input).toLowerCase();
  if (!text) {
    return fallback;
  }
  return (PAGE_REGISTRY_ICON_KEYS.has(text) ? text : fallback) as AppPageRegistryItem['iconKey'];
}

export function normalizeWebRoutePath(input: unknown, fallback = ''): string {
  const raw = normalizeText(input).split('?')[0];
  if (!raw) {
    return fallback;
  }
  const normalized = normalizePath(raw).replace(/\/+/g, '/');
  if (normalized !== '/' && normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

export function normalizeMiniProgramRoutePath(input: unknown, fallback = ''): string {
  const raw = normalizeText(input).split('?')[0];
  if (!raw) {
    return fallback;
  }
  const normalized = normalizePath(raw).replace(/^\/+/, '').replace(/\/+/g, '/');
  if (normalized.endsWith('/')) {
    return normalized.slice(0, -1);
  }
  return normalized;
}

function normalizePreviewRoutePath(input: unknown, fallback = ''): string {
  const text = normalizeText(input);
  if (!text) {
    return fallback;
  }
  return text.startsWith('/') ? text : `/${text}`;
}

export function buildDefaultWebPreviewRoute(pageKey: string, routePathWeb: string): string {
  const normalizedPageKey = normalizePageRegistryKey(pageKey);
  const normalizedRoutePath = normalizeWebRoutePath(routePathWeb, '/');
  if (!normalizedPageKey || !normalizedRoutePath) {
    return '';
  }
  const query = `presentation=preview&page_key=${encodeURIComponent(normalizedPageKey)}`;
  return normalizedRoutePath === '/' ? `/?${query}` : `${normalizedRoutePath}?${query}`;
}

function buildDefaultMiniProgramPreviewRoute(pageKey: string, routePathMiniProgram: string): string {
  const normalizedRoutePath = normalizeMiniProgramRoutePath(routePathMiniProgram);
  const normalizedPageKey = normalizePageRegistryKey(pageKey);
  if (!normalizedRoutePath) {
    return '';
  }
  if (!normalizedPageKey) {
    return `/${normalizedRoutePath}`;
  }
  return `/${normalizedRoutePath}?presentation=preview&page_key=${encodeURIComponent(normalizedPageKey)}`;
}

export async function loadRegistryItemByPageKey(pageKey: string): Promise<AppPageRegistryItem | null> {
  await ensurePageCenterTableReady('app_page_registry', '页面注册');
  const hasWebNavCandidateColumn = await hasRegistryWebNavCandidateColumn();

  const result = await executeSQL(
    `
      SELECT
        id,
        page_key,
        page_name,
        page_description,
        route_path_web,
        route_path_miniprogram,
        preview_route_path_web,
        preview_route_path_miniprogram,
        tab_key,
        icon_key,
        default_tab_text,
        default_guest_tab_text,
        ${hasWebNavCandidateColumn ? 'is_nav_candidate_web,' : 'NULL AS is_nav_candidate_web,'}
        is_tab_candidate_miniprogram,
        supports_beta,
        supports_preview,
        is_builtin,
        is_active
      FROM app_page_registry
      WHERE page_key = {{page_key}}
        AND is_active = 1
      LIMIT 1
    `,
    { page_key: pageKey }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!row) {
    return null;
  }

  return {
    id: normalizeNumber(row.id, 0),
    pageKey: normalizeText(row.page_key),
    pageName: normalizeText(row.page_name),
    pageDescription: normalizeText(row.page_description),
    routePathWeb: normalizePath(row.route_path_web),
    routePathMiniProgram: normalizeText(row.route_path_miniprogram).replace(/^\/+/, ''),
    previewRoutePathWeb: normalizePath(row.preview_route_path_web || row.route_path_web),
    previewRoutePathMiniProgram: normalizePath(
      row.preview_route_path_miniprogram || row.route_path_miniprogram
    ),
    tabKey: (normalizeText(row.tab_key) || null) as AppPageRegistryItem['tabKey'],
    iconKey: (normalizeText(row.icon_key) || null) as AppPageRegistryItem['iconKey'],
    defaultTabText: normalizeText(row.default_tab_text),
    defaultGuestTabText: normalizeText(row.default_guest_tab_text),
    isNavCandidateWeb: normalizeBoolean(
      row.is_nav_candidate_web,
      Boolean(normalizeText(row.icon_key))
    ),
    isTabCandidateMiniProgram: normalizeBoolean(row.is_tab_candidate_miniprogram, false),
    supportsBeta: normalizeBoolean(row.supports_beta, true),
    supportsPreview: normalizeBoolean(row.supports_preview, true),
    isBuiltIn: normalizeBoolean(row.is_builtin, false),
    isActive: normalizeBoolean(row.is_active, true),
  };
}

export async function upsertPageRegistryItem(input: {
  pageKey: unknown;
  pageName: unknown;
  pageDescription?: unknown;
  routePathWeb: unknown;
  routePathMiniProgram: unknown;
  previewRoutePathWeb?: unknown;
  previewRoutePathMiniProgram?: unknown;
  tabKey?: unknown;
  iconKey?: unknown;
  defaultTabText?: unknown;
  defaultGuestTabText?: unknown;
  isNavCandidateWeb?: unknown;
  isTabCandidateMiniProgram?: unknown;
  supportsBeta?: unknown;
  supportsPreview?: unknown;
  isBuiltIn?: unknown;
  isActive?: unknown;
  scopeChannel?: unknown;
}) {
  await ensurePageCenterTableReady('app_page_registry', '页面注册');

  const pageKey = normalizePageRegistryKey(input.pageKey);
  if (!pageKey) {
    throw new Error('页面标识不能为空，仅支持英文、数字、下划线和中划线');
  }

  const hasWebNavCandidateColumn = await hasRegistryWebNavCandidateColumn();
  const scopeText = normalizeText(input.scopeChannel);
  const scopeChannel: AppChannel | 'all' =
    scopeText === 'web' || scopeText === 'miniprogram' ? (scopeText as AppChannel) : 'all';

  const existingResult = await executeSQL(
    `
      SELECT
        id,
        page_name,
        page_description,
        route_path_web,
        route_path_miniprogram,
        preview_route_path_web,
        preview_route_path_miniprogram,
        tab_key,
        icon_key,
        default_tab_text,
        default_guest_tab_text,
        ${hasWebNavCandidateColumn ? 'is_nav_candidate_web,' : 'NULL AS is_nav_candidate_web,'}
        is_tab_candidate_miniprogram,
        supports_beta,
        supports_preview,
        is_builtin,
        is_active
      FROM app_page_registry
      WHERE page_key = {{page_key}}
      LIMIT 1
    `,
    { page_key: pageKey }
  );
  const existingRow =
    Array.isArray(existingResult.rows) && existingResult.rows.length > 0 ? existingResult.rows[0] : null;

  const existingRegistry = existingRow
    ? {
        id: normalizeNumber(existingRow.id, 0),
        pageName: normalizeText(existingRow.page_name),
        pageDescription: normalizeText(existingRow.page_description),
        routePathWeb: normalizeWebRoutePath(existingRow.route_path_web),
        routePathMiniProgram: normalizeMiniProgramRoutePath(existingRow.route_path_miniprogram),
        previewRoutePathWeb: normalizePath(existingRow.preview_route_path_web || existingRow.route_path_web),
        previewRoutePathMiniProgram: normalizePath(
          existingRow.preview_route_path_miniprogram || existingRow.route_path_miniprogram
        ),
        tabKey: normalizePageRegistryTabKey(existingRow.tab_key, null),
        iconKey: normalizePageIconKey(existingRow.icon_key, null),
        defaultTabText: normalizeText(existingRow.default_tab_text),
        defaultGuestTabText: normalizeText(existingRow.default_guest_tab_text),
        isNavCandidateWeb: normalizeBoolean(
          existingRow.is_nav_candidate_web,
          Boolean(normalizeText(existingRow.icon_key))
        ),
        isTabCandidateMiniProgram: normalizeBoolean(existingRow.is_tab_candidate_miniprogram, false),
        supportsBeta: normalizeBoolean(existingRow.supports_beta, true),
        supportsPreview: normalizeBoolean(existingRow.supports_preview, true),
        isBuiltIn: normalizeBoolean(existingRow.is_builtin, false),
        isActive: normalizeBoolean(existingRow.is_active, true),
      }
    : null;

  const shouldLockSharedFields = scopeChannel !== 'all' && Boolean(existingRegistry);
  const pageName = shouldLockSharedFields
    ? existingRegistry?.pageName || pageKey
    : normalizeText(input.pageName) || existingRegistry?.pageName || pageKey;
  const routePathWebInput = normalizeWebRoutePath(input.routePathWeb);
  const routePathMiniProgramInput = normalizeMiniProgramRoutePath(input.routePathMiniProgram);
  const routePathWeb =
    scopeChannel === 'miniprogram' ? routePathWebInput || existingRegistry?.routePathWeb || '' : routePathWebInput;
  const routePathMiniProgram =
    scopeChannel === 'web'
      ? routePathMiniProgramInput || existingRegistry?.routePathMiniProgram || ''
      : routePathMiniProgramInput;

  if (!routePathWeb && scopeChannel !== 'miniprogram') {
    throw new Error('请填写有效的 Web 页面路由');
  }
  if (!routePathMiniProgram && scopeChannel !== 'web') {
    throw new Error('请填写有效的小程序页面路由');
  }

  const defaultWebPreviewRoute = routePathWeb
    ? buildDefaultWebPreviewRoute(pageKey, routePathWeb)
    : existingRegistry?.previewRoutePathWeb || '';
  const defaultMiniProgramPreviewRoute = routePathMiniProgram
    ? buildDefaultMiniProgramPreviewRoute(pageKey, routePathMiniProgram)
    : existingRegistry?.previewRoutePathMiniProgram || '';
  const previewRoutePathWeb = normalizePreviewRoutePath(input.previewRoutePathWeb, defaultWebPreviewRoute);
  const previewRoutePathMiniProgram = normalizePreviewRoutePath(
    input.previewRoutePathMiniProgram,
    defaultMiniProgramPreviewRoute
  );

  const iconKey = shouldLockSharedFields
    ? normalizePageIconKey(existingRegistry?.iconKey, null)
    : normalizePageIconKey(input.iconKey, existingRegistry?.iconKey || null);
  const tabKey =
    scopeChannel === 'web'
      ? normalizePageRegistryTabKey(existingRegistry?.tabKey, null)
      : normalizePageRegistryTabKey(input.tabKey, existingRegistry?.tabKey || (iconKey ? pageKey : null));
  const defaultTabText = shouldLockSharedFields
    ? existingRegistry?.defaultTabText || pageName
    : normalizeText(input.defaultTabText) || existingRegistry?.defaultTabText || pageName;
  const defaultGuestTabText = shouldLockSharedFields
    ? existingRegistry?.defaultGuestTabText || defaultTabText
    : normalizeText(input.defaultGuestTabText) || existingRegistry?.defaultGuestTabText || defaultTabText;

  const isNavCandidateWeb = Boolean(iconKey) && (
    scopeChannel === 'miniprogram'
      ? normalizeBoolean(existingRegistry?.isNavCandidateWeb, false)
      : normalizeBoolean(input.isNavCandidateWeb, existingRegistry?.isNavCandidateWeb ?? Boolean(iconKey))
  );
  const isTabCandidateMiniProgram = Boolean(iconKey) && Boolean(tabKey) && (
    scopeChannel === 'web'
      ? normalizeBoolean(existingRegistry?.isTabCandidateMiniProgram, false)
      : normalizeBoolean(
          input.isTabCandidateMiniProgram,
          existingRegistry?.isTabCandidateMiniProgram ?? Boolean(iconKey && tabKey)
        )
  );
  const supportsBeta = shouldLockSharedFields
    ? normalizeBoolean(existingRegistry?.supportsBeta, true)
    : normalizeBoolean(input.supportsBeta, existingRegistry?.supportsBeta ?? true);
  const supportsPreview = shouldLockSharedFields
    ? normalizeBoolean(existingRegistry?.supportsPreview, true)
    : normalizeBoolean(input.supportsPreview, existingRegistry?.supportsPreview ?? true);
  const isBuiltIn = shouldLockSharedFields
    ? normalizeBoolean(existingRegistry?.isBuiltIn, false)
    : normalizeBoolean(input.isBuiltIn, existingRegistry?.isBuiltIn ?? false);
  const isActive = shouldLockSharedFields
    ? normalizeBoolean(existingRegistry?.isActive, true)
    : normalizeBoolean(input.isActive, existingRegistry?.isActive ?? true);

  const payload = {
    page_key: pageKey,
    page_name: pageName,
    page_description: shouldLockSharedFields
      ? existingRegistry?.pageDescription || null
      : normalizeText(input.pageDescription) || existingRegistry?.pageDescription || null,
    route_path_web: routePathWeb,
    route_path_miniprogram: routePathMiniProgram,
    preview_route_path_web: previewRoutePathWeb,
    preview_route_path_miniprogram: previewRoutePathMiniProgram,
    tab_key: tabKey || null,
    icon_key: iconKey || null,
    default_tab_text: defaultTabText,
    default_guest_tab_text: defaultGuestTabText,
    is_nav_candidate_web: isNavCandidateWeb ? 1 : 0,
    is_tab_candidate_miniprogram: isTabCandidateMiniProgram ? 1 : 0,
    supports_beta: supportsBeta ? 1 : 0,
    supports_preview: supportsPreview ? 1 : 0,
    is_builtin: isBuiltIn ? 1 : 0,
    is_active: isActive ? 1 : 0,
  };

  if (existingRegistry && Number(existingRegistry.id || 0) > 0) {
    const updateAssignments = [
      'page_name = {{page_name}}',
      'page_description = {{page_description}}',
      'route_path_web = {{route_path_web}}',
      'route_path_miniprogram = {{route_path_miniprogram}}',
      'preview_route_path_web = {{preview_route_path_web}}',
      'preview_route_path_miniprogram = {{preview_route_path_miniprogram}}',
      'tab_key = {{tab_key}}',
      'icon_key = {{icon_key}}',
      'default_tab_text = {{default_tab_text}}',
      'default_guest_tab_text = {{default_guest_tab_text}}',
      'is_tab_candidate_miniprogram = {{is_tab_candidate_miniprogram}}',
      'supports_beta = {{supports_beta}}',
      'supports_preview = {{supports_preview}}',
      'is_builtin = {{is_builtin}}',
      'is_active = {{is_active}}',
    ];
    if (hasWebNavCandidateColumn) {
      updateAssignments.splice(10, 0, 'is_nav_candidate_web = {{is_nav_candidate_web}}');
    }

    await executeSQL(
      `
        UPDATE app_page_registry
        SET
          ${updateAssignments.join(',\n          ')},
          updated_at = CURRENT_TIMESTAMP
        WHERE id = {{id}}
      `,
      {
        id: Number(existingRegistry.id),
        ...payload,
      }
    );
  } else {
    const insertColumns = [
      'page_key',
      'page_name',
      'page_description',
      'route_path_web',
      'route_path_miniprogram',
      'preview_route_path_web',
      'preview_route_path_miniprogram',
      'tab_key',
      'icon_key',
      'default_tab_text',
      'default_guest_tab_text',
      'is_tab_candidate_miniprogram',
      'supports_beta',
      'supports_preview',
      'is_builtin',
      'is_active',
      'created_at',
      'updated_at',
    ];
    const insertValues = [
      '{{page_key}}',
      '{{page_name}}',
      '{{page_description}}',
      '{{route_path_web}}',
      '{{route_path_miniprogram}}',
      '{{preview_route_path_web}}',
      '{{preview_route_path_miniprogram}}',
      '{{tab_key}}',
      '{{icon_key}}',
      '{{default_tab_text}}',
      '{{default_guest_tab_text}}',
      '{{is_tab_candidate_miniprogram}}',
      '{{supports_beta}}',
      '{{supports_preview}}',
      '{{is_builtin}}',
      '{{is_active}}',
      'CURRENT_TIMESTAMP',
      'CURRENT_TIMESTAMP',
    ];
    if (hasWebNavCandidateColumn) {
      insertColumns.splice(11, 0, 'is_nav_candidate_web');
      insertValues.splice(11, 0, '{{is_nav_candidate_web}}');
    }

    await executeSQL(
      `
        INSERT INTO app_page_registry (
          ${insertColumns.join(',\n          ')}
        ) VALUES (
          ${insertValues.join(',\n          ')}
        )
      `,
      payload
    );
  }

  return pageKey;
}

export async function upsertPagePublishRule(input: {
  pageId: number;
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
  updatedBy: string | null;
}) {
  await Promise.all([
    ensurePageCenterTableReady('app_page_publish_rules', '页面发布规则'),
    ensurePageCenterTableReady('app_page_registry', '页面注册'),
  ]);
  const hasHeaderMetaColumns = await hasPublishRuleHeaderColumns();

  const existing = await executeSQL(
    `
      SELECT id
      FROM app_page_publish_rules
      WHERE page_id = {{page_id}}
        AND channel = {{channel}}
      LIMIT 1
    `,
    { page_id: input.pageId, channel: input.channel }
  );
  const existingRow = Array.isArray(existing.rows) && existing.rows.length > 0 ? existing.rows[0] : null;

  const payload = {
    page_id: input.pageId,
    channel: input.channel,
    publish_state: input.publishState,
    show_in_nav: input.showInNav ? 1 : 0,
    nav_order: input.navOrder,
    nav_text: input.navText || null,
    guest_nav_text: input.guestNavText || null,
    header_title: input.headerTitle || null,
    header_subtitle: input.headerSubtitle || null,
    is_home_entry: input.isHomeEntry ? 1 : 0,
    notes: input.notes || null,
    updated_by: input.updatedBy || null,
  };

  const updateAssignments = [
    'publish_state = {{publish_state}}',
    'show_in_nav = {{show_in_nav}}',
    'nav_order = {{nav_order}}',
    'nav_text = {{nav_text}}',
    'guest_nav_text = {{guest_nav_text}}',
    'is_home_entry = {{is_home_entry}}',
    'notes = {{notes}}',
    'updated_by = {{updated_by}}',
  ];
  const insertColumns = [
    'page_id',
    'channel',
    'publish_state',
    'show_in_nav',
    'nav_order',
    'nav_text',
    'guest_nav_text',
    'is_home_entry',
    'notes',
    'updated_by',
    'created_at',
    'updated_at',
  ];
  const insertValues = [
    '{{page_id}}',
    '{{channel}}',
    '{{publish_state}}',
    '{{show_in_nav}}',
    '{{nav_order}}',
    '{{nav_text}}',
    '{{guest_nav_text}}',
    '{{is_home_entry}}',
    '{{notes}}',
    '{{updated_by}}',
    'CURRENT_TIMESTAMP',
    'CURRENT_TIMESTAMP',
  ];

  if (hasHeaderMetaColumns) {
    updateAssignments.splice(5, 0, 'header_title = {{header_title}}', 'header_subtitle = {{header_subtitle}}');
    insertColumns.splice(7, 0, 'header_title', 'header_subtitle');
    insertValues.splice(7, 0, '{{header_title}}', '{{header_subtitle}}');
  }

  if (existingRow && Number(existingRow.id || 0) > 0) {
    await executeSQL(
      `
        UPDATE app_page_publish_rules
        SET
          ${updateAssignments.join(',\n          ')}
        WHERE id = {{id}}
      `,
      {
        id: Number(existingRow.id),
        ...payload,
      }
    );
  } else {
    await executeSQL(
      `
        INSERT INTO app_page_publish_rules (
          ${insertColumns.join(',\n          ')}
        ) VALUES (
          ${insertValues.join(',\n          ')}
        )
      `,
      payload
    );
  }
}

export async function countOnlineNavRules(channel: AppChannel, excludePageId?: number): Promise<number> {
  await Promise.all([
    ensurePageCenterTableReady('app_page_publish_rules', '页面发布规则'),
    ensurePageCenterTableReady('app_page_registry', '页面注册'),
  ]);

  const result = await executeSQL(
    `
      SELECT COUNT(*) AS row_count
      FROM app_page_publish_rules r
      JOIN app_page_registry p ON p.id = r.page_id
      WHERE p.is_active = 1
        AND r.channel = {{channel}}
        AND r.publish_state = 'online'
        AND r.show_in_nav = 1
        AND ({{exclude_page_id}} = 0 OR r.page_id <> {{exclude_page_id}})
      LIMIT 1
    `,
    {
      channel,
      exclude_page_id: Number.isFinite(Number(excludePageId)) ? Number(excludePageId) : 0,
    }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  return normalizeNumber(row?.row_count, 0);
}

export async function loadPagePublishRule(
  pageId: number,
  channel: AppChannel
): Promise<AppPagePublishRuleItem | null> {
  await Promise.all([
    ensurePageCenterTableReady('app_page_publish_rules', '页面发布规则'),
    ensurePageCenterTableReady('app_page_registry', '页面注册'),
  ]);
  const hasHeaderMetaColumns = await hasPublishRuleHeaderColumns();

  const result = await executeSQL(
    hasHeaderMetaColumns
      ? `
          SELECT
            r.id,
            p.page_key,
            r.channel,
            r.publish_state,
            r.show_in_nav,
            r.nav_order,
            r.nav_text,
            r.guest_nav_text,
            r.header_title,
            r.header_subtitle,
            r.is_home_entry,
            r.notes,
            r.updated_at
          FROM app_page_publish_rules r
          JOIN app_page_registry p ON p.id = r.page_id
          WHERE r.page_id = {{page_id}}
            AND r.channel = {{channel}}
          LIMIT 1
        `
      : `
          SELECT
            r.id,
            p.page_key,
            r.channel,
            r.publish_state,
            r.show_in_nav,
            r.nav_order,
            r.nav_text,
            r.guest_nav_text,
            NULL AS header_title,
            NULL AS header_subtitle,
            r.is_home_entry,
            r.notes,
            r.updated_at
          FROM app_page_publish_rules r
          JOIN app_page_registry p ON p.id = r.page_id
          WHERE r.page_id = {{page_id}}
            AND r.channel = {{channel}}
          LIMIT 1
        `,
    {
      page_id: pageId,
      channel,
    }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!row) {
    return null;
  }

  const publishState = normalizeText(row.publish_state);
  return {
    id: normalizeNumber(row.id, 0),
    pageKey: normalizeText(row.page_key),
    channel: normalizeAppChannel(row.channel, channel),
    publishState: publishState === 'beta' ? 'beta' : publishState === 'online' ? 'online' : 'offline',
    showInNav: normalizeBoolean(row.show_in_nav, false),
    navOrder: normalizeNumber(row.nav_order, 99),
    navText: normalizeText(row.nav_text),
    guestNavText: normalizeText(row.guest_nav_text),
    headerTitle: normalizeText(row.header_title),
    headerSubtitle: normalizeText(row.header_subtitle),
    isHomeEntry: normalizeBoolean(row.is_home_entry, false),
    notes: normalizeText(row.notes),
    updatedAt: normalizeText(row.updated_at),
  };
}

export function validateChannelNavLimit(channel: AppChannel, nextCount: number) {
  const limit = getChannelNavLimit(channel);
  if (nextCount > limit) {
    throw new Error(
      `${channel === 'miniprogram' ? '微信小程序' : 'Web'} 底部菜单最多只能上线 ${limit} 个页面`
    );
  }
}

export async function countAvailableBetaCodes(pageId: number, channel: AppChannel): Promise<number> {
  await ensurePageCenterTableReady('app_page_beta_codes', '页面内测码');

  const result = await executeSQL(
    `
      SELECT COUNT(*) AS row_count
      FROM app_page_beta_codes
      WHERE page_id = {{page_id}}
        AND is_active = 1
        AND channel IN ({{channel}}, 'shared')
        AND ((expires_at <=> NULL) OR expires_at >= ${NOW_UTC8_EXPR})
      LIMIT 1
    `,
    {
      page_id: pageId,
      channel,
    }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  return normalizeNumber(row?.row_count, 0);
}

export async function loadPageBetaCodes(pageId: number): Promise<AppPageBetaCodeItem[]> {
  await Promise.all([
    ensurePageCenterTableReady('app_page_beta_codes', '页面内测码'),
    ensurePageCenterTableReady('app_page_registry', '页面注册'),
  ]);

  const result = await executeSQL(
    `
      SELECT
        c.id,
        p.page_key,
        c.channel,
        c.beta_name,
        c.beta_code,
        c.is_active,
        c.expires_at,
        c.created_at,
        c.updated_at
      FROM app_page_beta_codes c
      JOIN app_page_registry p ON p.id = c.page_id
      WHERE c.page_id = {{page_id}}
        AND c.is_active = 1
      ORDER BY c.updated_at DESC, c.created_at DESC, c.id DESC
    `,
    { page_id: pageId }
  );
  return (Array.isArray(result.rows) ? result.rows : []).map((row) => ({
    id: normalizeText(row.id),
    pageKey: normalizeText(row.page_key),
    channel: normalizeBetaChannel(row.channel),
    betaName: normalizeText(row.beta_name),
    betaCode: normalizeText(row.beta_code),
    isActive: normalizeBoolean(row.is_active, true),
    expiresAt: normalizeText(row.expires_at),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  }));
}

export async function loadPageBetaCodeById(codeId: string): Promise<AppPageBetaCodeItem | null> {
  await Promise.all([
    ensurePageCenterTableReady('app_page_beta_codes', '页面内测码'),
    ensurePageCenterTableReady('app_page_registry', '页面注册'),
  ]);

  const normalizedId = normalizeText(codeId);
  if (!normalizedId) {
    return null;
  }

  const result = await executeSQL(
    `
      SELECT
        c.id,
        p.page_key,
        c.channel,
        c.beta_name,
        c.beta_code,
        c.is_active,
        c.expires_at,
        c.created_at,
        c.updated_at
      FROM app_page_beta_codes c
      JOIN app_page_registry p ON p.id = c.page_id
      WHERE c.id = {{id}}
      LIMIT 1
    `,
    { id: normalizedId }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!row) {
    return null;
  }

  return {
    id: normalizeText(row.id),
    pageKey: normalizeText(row.page_key),
    channel: normalizeBetaChannel(row.channel),
    betaName: normalizeText(row.beta_name),
    betaCode: normalizeText(row.beta_code),
    isActive: normalizeBoolean(row.is_active, true),
    expiresAt: normalizeText(row.expires_at),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at),
  };
}

export async function savePageBetaCode(input: {
  codeId?: string;
  pageId: number;
  channel: BetaCodeChannel;
  betaName: string;
  betaCode?: string;
  expiresAt?: string;
  createdBy: string | null;
}) {
  await ensurePageCenterTableReady('app_page_beta_codes', '页面内测码');

  const currentCodeId = normalizeText(input.codeId);
  const previousCode = currentCodeId ? await loadPageBetaCodeById(currentCodeId) : null;
  const betaCode = normalizeText(input.betaCode) || generateAdminBetaFeatureCode();
  const expiresAt = normalizeBetaExpiresAt(input.expiresAt);
  const expiresAtSql = expiresAt ? '{{expires_at}}' : 'NULL';
  const values = {
    page_id: input.pageId,
    channel: input.channel,
    beta_name: normalizeText(input.betaName) || '页面内测码',
    beta_code: betaCode,
    expires_at: expiresAt,
  };

  if (currentCodeId) {
    await executeSQL(
      `
        UPDATE app_page_beta_codes
        SET
          channel = {{channel}},
          beta_name = {{beta_name}},
          beta_code = {{beta_code}},
          expires_at = ${expiresAtSql},
          is_active = 1
        WHERE id = {{id}}
      `,
      {
        id: currentCodeId,
        ...values,
      }
    );
    return {
      id: currentCodeId,
      mode: previousCode && !previousCode.isActive ? 'restored' : 'updated',
    } as const;
  }

  const nextId = randomUUID();
  await executeSQL(
    `
      INSERT INTO app_page_beta_codes (
        id,
        page_id,
        channel,
        beta_name,
        beta_code,
        is_active,
        expires_at,
        created_by,
        created_at,
        updated_at
      ) VALUES (
        {{id}},
        {{page_id}},
        {{channel}},
        {{beta_name}},
        {{beta_code}},
        1,
        ${expiresAtSql},
        {{created_by}},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
    `,
    {
      id: nextId,
      created_by: input.createdBy || null,
      ...values,
    }
  );
  return {
    id: nextId,
    mode: 'created',
  } as const;
}

export async function deletePageBetaCode(codeId: string) {
  await ensurePageCenterTableReady('app_page_beta_codes', '页面内测码');

  await executeSQL(
    `
      DELETE FROM app_page_beta_codes
      WHERE id = {{id}}
      LIMIT 1
    `,
    { id: codeId }
  );
}
