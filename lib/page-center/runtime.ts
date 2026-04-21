import { executeSQL } from '@/lib/cloudbase/sql-executor';
import {
  buildRuntimeConfigPreset,
  MiniProgramRuntimeConfig,
  normalizeRuntimeConfigRow,
} from '@/lib/miniprogram/runtime-config';
import {
  AppChannel,
  AppPageBetaCodeItem,
  AppPagePublishRuleItem,
  AppPageRegistryItem,
  buildRegistryFallbackItems,
  createFallbackMiniProgramRuleMap,
  createFallbackWebRuleMap,
  isRemovedAppPageKey,
  isSecondaryPageKey,
  normalizeBoolean,
  normalizeMiniProgramPath,
  normalizeNumber,
  normalizePath,
  normalizePublishState,
  normalizeText,
  PageCenterOverviewItem,
  PageCenterRows,
  resolvePageRuleView,
  toMiniProgramTabBarItems,
  WebPageAccessItem,
  WebShellRuntime,
} from '@/lib/page-center/config';
import { canPageShowInNav, MAX_MINIPROGRAM_NAV_ITEMS } from '@/lib/page-center/capabilities';
import {
  loadLegacyOverviewBetaCodes,
  mergeCompatibleAdminBetaCodes,
} from '@/lib/page-center/legacy-beta-admin';
import { hasTableColumns, tableExists } from '@/lib/page-center/sql-compat';

function buildDefaultRuntimeConfig() {
  return buildRuntimeConfigPreset('standard');
}

function buildDefaultMiniProgramPreviewRoute(pageKey: string, routePath: unknown) {
  const normalizedPageKey = normalizeText(pageKey);
  const normalizedRoutePath = normalizeMiniProgramPath(routePath);
  if (!normalizedRoutePath) {
    return '';
  }
  if (normalizedPageKey === 'pose') {
    return '/pages/profile/beta/pose/index';
  }
  return `/${normalizedRoutePath}?presentation=preview&page_key=${encodeURIComponent(normalizedPageKey)}`;
}

function resolveMiniProgramPreviewRoute(pageKey: string, previewRoute: unknown, routePath: unknown) {
  const rawPreviewRoute = normalizeText(previewRoute);
  const normalizedRoutePath = normalizeMiniProgramPath(routePath);
  const defaultPreviewRoute = buildDefaultMiniProgramPreviewRoute(pageKey, normalizedRoutePath);
  if (!rawPreviewRoute) {
    return defaultPreviewRoute;
  }

  const normalizedPreviewPath = normalizeMiniProgramPath(rawPreviewRoute);
  if (normalizedPreviewPath === normalizedRoutePath && !rawPreviewRoute.includes('presentation=preview')) {
    return defaultPreviewRoute;
  }

  return normalizePath(rawPreviewRoute);
}

async function hasRegistryWebNavCandidateColumn() {
  return hasTableColumns('app_page_registry', ['is_nav_candidate_web']);
}

async function loadPagePublishRuleRowsWithCompat() {
  const hasHeaderMetaColumns = await hasTableColumns('app_page_publish_rules', [
    'header_title',
    'header_subtitle',
  ]);

  if (hasHeaderMetaColumns) {
    const result = await executeSQL(
      `
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
        WHERE p.is_active = 1
        ORDER BY r.channel ASC, r.nav_order ASC, r.id ASC
      `
    );

    return Array.isArray(result.rows) ? result.rows : [];
  }

  const legacyResult = await executeSQL(
    `
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
      WHERE p.is_active = 1
      ORDER BY r.channel ASC, r.nav_order ASC, r.id ASC
    `
  );

  return Array.isArray(legacyResult.rows) ? legacyResult.rows : [];
}

export async function loadActiveMiniProgramRuntimeConfigFromDatabase(): Promise<MiniProgramRuntimeConfig | null> {
  try {
    const hasTable = await tableExists('miniprogram_runtime_settings');
    if (!hasTable) {
      return null;
    }

    const result = await executeSQL(
      `
        SELECT
          id,
          config_key,
          config_name,
          scene_code,
          home_mode,
          guest_profile_mode,
          auth_mode,
          tab_bar_items_json,
          feature_flags_json,
          notes,
          updated_at
        FROM miniprogram_runtime_settings
        WHERE is_active = 1
        ORDER BY updated_at DESC, id DESC
        LIMIT 1
      `
    );

    const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
    return normalizeRuntimeConfigRow(row);
  } catch {
    return null;
  }
}

export async function loadEffectiveMiniProgramRuntimeConfig(): Promise<MiniProgramRuntimeConfig> {
  return (await loadActiveMiniProgramRuntimeConfigFromDatabase()) || buildDefaultRuntimeConfig();
}

export async function loadPageCenterRows(): Promise<PageCenterRows> {
  const fallback: PageCenterRows = {
    registryItems: buildRegistryFallbackItems(),
    publishRuleItems: [],
    betaCodeItems: [],
  };

  const [hasRegistry, hasRules, hasCodes] = await Promise.all([
    tableExists('app_page_registry'),
    tableExists('app_page_publish_rules'),
    tableExists('app_page_beta_codes'),
  ]);

  if (!hasRegistry) {
    return fallback;
  }

  try {
    const hasWebNavCandidateColumn = await hasRegistryWebNavCandidateColumn();
    const registryResult = await executeSQL(
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
        WHERE is_active = 1
        ORDER BY is_builtin DESC, id ASC
      `
    );

    const registryItems = (Array.isArray(registryResult.rows) ? registryResult.rows : [])
      .map((row, index): AppPageRegistryItem => ({
        id: normalizeNumber(row.id, index + 1),
        pageKey: normalizeText(row.page_key),
        pageName: normalizeText(row.page_name),
        pageDescription: normalizeText(row.page_description),
        routePathWeb: normalizePath(row.route_path_web),
        routePathMiniProgram: normalizeMiniProgramPath(row.route_path_miniprogram),
        previewRoutePathWeb: normalizePath(row.preview_route_path_web || row.route_path_web),
        previewRoutePathMiniProgram: resolveMiniProgramPreviewRoute(
          normalizeText(row.page_key),
          row.preview_route_path_miniprogram,
          row.route_path_miniprogram
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
      }))
      .filter((item) => item.pageKey);

    const publishRuleItems: AppPagePublishRuleItem[] = [];
    if (hasRules) {
      const ruleRows = await loadPagePublishRuleRowsWithCompat();
      publishRuleItems.push(
        ...ruleRows
          .map((row, index): AppPagePublishRuleItem => ({
            id: normalizeNumber(row.id, index + 1),
            pageKey: normalizeText(row.page_key),
            channel: normalizeText(row.channel) === 'miniprogram' ? 'miniprogram' : 'web',
            publishState: normalizePublishState(row.publish_state, 'offline'),
            showInNav: normalizeBoolean(row.show_in_nav, false),
            navOrder: normalizeNumber(row.nav_order, 99),
            navText: normalizeText(row.nav_text),
            guestNavText: normalizeText(row.guest_nav_text),
            headerTitle: normalizeText(row.header_title),
            headerSubtitle: normalizeText(row.header_subtitle),
            isHomeEntry: normalizeBoolean(row.is_home_entry, false),
            notes: normalizeText(row.notes),
            updatedAt: normalizeText(row.updated_at),
          }))
          .filter((item) => item.pageKey && !isRemovedAppPageKey(item.pageKey))
      );
    }

    const betaCodeItems: AppPageBetaCodeItem[] = [];
    if (hasCodes) {
      const codeResult = await executeSQL(
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
          WHERE p.is_active = 1
          ORDER BY c.updated_at DESC, c.created_at DESC, c.id DESC
        `
      );
      betaCodeItems.push(
        ...(Array.isArray(codeResult.rows) ? codeResult.rows : [])
          .map((row): AppPageBetaCodeItem => ({
            id: normalizeText(row.id),
            pageKey: normalizeText(row.page_key),
            channel:
              normalizeText(row.channel) === 'web'
                ? 'web'
                : normalizeText(row.channel) === 'miniprogram'
                  ? 'miniprogram'
                  : 'shared',
            betaName: normalizeText(row.beta_name),
            betaCode: normalizeText(row.beta_code),
            isActive: normalizeBoolean(row.is_active, true),
            expiresAt: normalizeText(row.expires_at),
            createdAt: normalizeText(row.created_at),
            updatedAt: normalizeText(row.updated_at),
          }))
          .filter((item) => item.id && item.pageKey && !isRemovedAppPageKey(item.pageKey))
      );
    }

    return {
      registryItems: registryItems.length > 0 ? registryItems : fallback.registryItems,
      publishRuleItems,
      betaCodeItems,
    };
  } catch {
    return fallback;
  }
}

function mergeRegistryItems(rows: PageCenterRows): AppPageRegistryItem[] {
  const map = new Map<string, AppPageRegistryItem>();
  buildRegistryFallbackItems().forEach((item) => map.set(item.pageKey, item));
  rows.registryItems.forEach((item) => {
    if (!item.pageKey || isRemovedAppPageKey(item.pageKey)) return;
    map.set(item.pageKey, item);
  });
  return Array.from(map.values());
}

function hasChannelRules(rows: PageCenterRows, channel: AppChannel) {
  return rows.publishRuleItems.some((item) => item.channel === channel);
}

function buildRuleMap(
  rows: PageCenterRows,
  channel: AppChannel,
  runtimeConfig?: MiniProgramRuntimeConfig
): Map<string, AppPagePublishRuleItem> {
  const fallbackMap =
    channel === 'web'
      ? createFallbackWebRuleMap()
      : createFallbackMiniProgramRuleMap(runtimeConfig || buildDefaultRuntimeConfig());
  const map = new Map<string, AppPagePublishRuleItem>(fallbackMap);
  rows.publishRuleItems
    .filter((item) => item.channel === channel)
    .forEach((item) => map.set(item.pageKey, item));
  return map;
}

function compareNavView(
  left: Pick<WebPageAccessItem, 'routePath'> & { showInNav: boolean; navOrder: number },
  right: Pick<WebPageAccessItem, 'routePath'> & { showInNav: boolean; navOrder: number }
) {
  if (left.showInNav !== right.showInNav) {
    return left.showInNav ? -1 : 1;
  }
  if (left.navOrder !== right.navOrder) {
    return left.navOrder - right.navOrder;
  }
  return left.routePath.localeCompare(right.routePath);
}

function applyMiniProgramNavLimitToViews<T extends { pageKey: string; publishState: AppPagePublishRuleItem['publishState']; showInNav: boolean; navOrder: number; routePath: string; isHomeEntry: boolean }>(
  items: T[]
): T[] {
  const allowedKeys = new Set(
    items
      .filter((item) => item.publishState === 'online' && item.showInNav)
      .sort((left, right) => compareNavView(left, right))
      .slice(0, MAX_MINIPROGRAM_NAV_ITEMS)
      .map((item) => item.pageKey)
  );

  return items.map((item) => {
    if (item.publishState !== 'online' || !item.showInNav || allowedKeys.has(item.pageKey)) {
      return item;
    }

    return {
      ...item,
      showInNav: false,
      isHomeEntry: false,
    };
  });
}

function applyMiniProgramNavLimitToOverviewItems<T extends { pageKey: string; channels: Record<AppChannel, { publishState: AppPagePublishRuleItem['publishState']; showInNav: boolean; navOrder: number; routePath: string; isHomeEntry: boolean }> }>(
  items: T[]
): T[] {
  const allowedKeys = new Set(
    items
      .map((item) => ({ pageKey: item.pageKey, view: item.channels.miniprogram }))
      .filter((item) => item.view.publishState === 'online' && item.view.showInNav)
      .sort((left, right) => compareNavView(left.view, right.view))
      .slice(0, MAX_MINIPROGRAM_NAV_ITEMS)
      .map((item) => item.pageKey)
  );

  return items.map((item) => {
    const currentView = item.channels.miniprogram;
    if (currentView.publishState !== 'online' || !currentView.showInNav || allowedKeys.has(item.pageKey)) {
      return item;
    }

    return {
      ...item,
      channels: {
        ...item.channels,
        miniprogram: {
          ...currentView,
          showInNav: false,
          isHomeEntry: false,
        },
      },
    };
  });
}

function applyDerivedHomeEntry<T extends { pageKey: string; channels: Record<AppChannel, { publishState: AppPagePublishRuleItem['publishState']; showInNav: boolean; navOrder: number; routePath: string; isHomeEntry: boolean }> }>(
  items: T[]
): T[] {
  const homeEntryByChannel = new Map<AppChannel, string>();

  (['web', 'miniprogram'] as AppChannel[]).forEach((channel) => {
    const homeEntry = items
      .map((item) => ({ pageKey: item.pageKey, view: item.channels[channel] }))
      .filter((item) => item.view.publishState === 'online' && item.view.showInNav)
      .sort((left, right) => compareNavView(left.view, right.view))[0];

    if (homeEntry?.pageKey) {
      homeEntryByChannel.set(channel, homeEntry.pageKey);
    }
  });

  return items.map((item) => ({
    ...item,
    channels: {
      web: {
        ...item.channels.web,
        isHomeEntry: homeEntryByChannel.get('web') === item.pageKey,
      },
      miniprogram: {
        ...item.channels.miniprogram,
        isHomeEntry: homeEntryByChannel.get('miniprogram') === item.pageKey,
      },
    },
  }));
}

function resolveManagedHeaderTitle(
  page: Pick<AppPageRegistryItem, 'pageKey' | 'defaultTabText' | 'pageName'>,
  view: Pick<WebPageAccessItem, 'headerTitle' | 'navText'>
) {
  const explicitTitle = normalizeText(view.headerTitle);
  if (explicitTitle) {
    return explicitTitle;
  }

  if (isSecondaryPageKey(page.pageKey)) {
    return normalizeText(view.navText) || page.defaultTabText || page.pageName;
  }

  return '';
}

export async function buildPageCenterOverview(): Promise<PageCenterOverviewItem[]> {
  const [rows, effectiveRuntimeConfig, legacyBetaCodes] = await Promise.all([
    loadPageCenterRows(),
    loadEffectiveMiniProgramRuntimeConfig(),
    loadLegacyOverviewBetaCodes(),
  ]);
  const registryItems = mergeRegistryItems(rows);
  const webRuleMap = buildRuleMap(rows, 'web', effectiveRuntimeConfig);
  const miniRuleMap = buildRuleMap(rows, 'miniprogram', effectiveRuntimeConfig);

  const overviewItems = registryItems.map((page) => ({
    ...page,
    channels: {
        web: resolvePageRuleView(page, 'web', webRuleMap.get(page.pageKey), effectiveRuntimeConfig, { useFallback: false }),
        miniprogram: resolvePageRuleView(page, 'miniprogram', miniRuleMap.get(page.pageKey), effectiveRuntimeConfig, { useFallback: false }),
      },
    betaCodes: mergeCompatibleAdminBetaCodes(
      rows.betaCodeItems.filter((item) => item.pageKey === page.pageKey),
      legacyBetaCodes.filter((item) => item.pageKey === page.pageKey)
    ),
  }));

  return applyDerivedHomeEntry(applyMiniProgramNavLimitToOverviewItems(overviewItems));
}

export async function buildMiniProgramRuntimeWithPageCenter(
  baseRuntimeConfig: MiniProgramRuntimeConfig
): Promise<MiniProgramRuntimeConfig> {
  const rows = await loadPageCenterRows();
  const registryItems = mergeRegistryItems(rows);
  const ruleMap = buildRuleMap(rows, 'miniprogram', baseRuntimeConfig);
  const mergedViews = applyMiniProgramNavLimitToViews(registryItems.map((page) => {
    const view = resolvePageRuleView(page, 'miniprogram', ruleMap.get(page.pageKey), baseRuntimeConfig, { useFallback: false });
    return {
      ...view,
      pageKey: page.pageKey,
      tabKey: page.tabKey,
      iconKey: page.iconKey,
    };
  }));

  const tabBarItems = toMiniProgramTabBarItems(mergedViews);
  const homeEntryItem = mergedViews
    .filter((item) => item.publishState === 'online' && item.showInNav)
    .sort((left, right) => compareNavView(left, right))[0] || null;
  const homeEntryPagePath = normalizeMiniProgramPath(homeEntryItem?.routePath || tabBarItems[0]?.pagePath || '');
  const managedPageMetaMap = registryItems.reduce<Record<string, { title: string; subtitle: string }>>((map, page) => {
    const currentView = mergedViews.find((item) => item.pageKey === page.pageKey);
    if (!currentView) {
      return map;
    }

    map[page.pageKey] = {
      title: resolveManagedHeaderTitle(page, currentView),
      subtitle: currentView.headerSubtitle,
    };
    return map;
  }, {});
  const managedPageAccessMap = registryItems.reduce<
    Record<
      string,
      {
        pageKey: string;
        routePath: string;
        previewRoutePath: string;
        publishState: AppPagePublishRuleItem['publishState'];
        navOrder: number;
        navText: string;
        guestNavText: string;
        headerTitle: string;
        headerSubtitle: string;
      }
    >
  >((map, page) => {
    const currentView = mergedViews.find((item) => item.pageKey === page.pageKey);
    if (!currentView) {
      return map;
    }

    map[page.pageKey] = {
      pageKey: page.pageKey,
      routePath: normalizePath(currentView.routePath),
      previewRoutePath: normalizePath(currentView.previewRoutePath),
      publishState: currentView.publishState,
      navOrder: currentView.navOrder,
      navText: currentView.navText || page.defaultTabText || page.pageName,
      guestNavText:
        currentView.guestNavText ||
        currentView.navText ||
        page.defaultGuestTabText ||
        page.defaultTabText ||
        page.pageName,
      headerTitle: resolveManagedHeaderTitle(page, currentView),
      headerSubtitle: currentView.headerSubtitle,
    };
    return map;
  }, {});

  return {
    ...baseRuntimeConfig,
    homeMode: !homeEntryPagePath || homeEntryPagePath === 'pages/index/index' ? 'pose' : 'gallery',
    homeEntryPagePath: homeEntryPagePath || 'pages/index/index',
    tabBarItems,
    managedPageMetaMap,
    managedPageAccessMap,
  };
}

export async function buildWebShellRuntime(): Promise<WebShellRuntime> {
  const rows = await loadPageCenterRows();
  const effectiveRuntimeConfig = await loadEffectiveMiniProgramRuntimeConfig();
  const registryItems = mergeRegistryItems(rows);
  const ruleMap = buildRuleMap(rows, 'web', effectiveRuntimeConfig);

  const mergedItems = registryItems.map((page) => ({
    page,
    view: resolvePageRuleView(page, 'web', ruleMap.get(page.pageKey), effectiveRuntimeConfig, { useFallback: false }),
  }));

  const orderedItems = mergedItems.slice().sort((left, right) => compareNavView(left.view, right.view));

  const navCandidates = orderedItems
    .filter(({ page, view }) => canPageShowInNav(page, 'web') && view.showInNav && view.publishState === 'online')
    .map(({ page, view }) => ({
      pageKey: page.pageKey,
      label: view.navText || page.defaultTabText || page.pageName,
      guestLabel: view.guestNavText || view.navText || page.defaultGuestTabText || page.defaultTabText || page.pageName,
      href: page.routePathWeb,
      iconKey: page.iconKey || 'profile',
    }));

  const rawNavItems = navCandidates.map((item, index) => ({
    ...item,
    isHomeEntry: index === 0,
  }));

  const homeItem = rawNavItems.find((item) => item.isHomeEntry) || rawNavItems[0] || null;
  const homePath = normalizePath(homeItem?.href || '/');
  const navItems = rawNavItems.filter((item) => {
    if (!homeItem) {
      return true;
    }
    return !(homePath !== '/' && item.pageKey !== homeItem.pageKey && normalizePath(item.href) === '/');
  });
  const pageAccessItems: WebPageAccessItem[] = mergedItems.map(({ page, view }) => ({
    pageKey: page.pageKey,
    routePath: page.routePathWeb,
    previewRoutePath: page.previewRoutePathWeb,
    publishState: view.publishState,
    supportsBeta: page.supportsBeta,
    supportsPreview: page.supportsPreview,
    navOrder: view.navOrder,
    navText: view.navText || page.defaultTabText || page.pageName,
    guestNavText:
      view.guestNavText || view.navText || page.defaultGuestTabText || page.defaultTabText || page.pageName,
    headerTitle: resolveManagedHeaderTitle(page, view),
    headerSubtitle: view.headerSubtitle,
  }));

  return {
    navItems,
    homePath: homePath || '/',
    pageAccessItems,
    source: hasChannelRules(rows, 'web') ? 'database' : 'derived_default',
  };
}
