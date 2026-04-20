import { AppChannel, PAGE_KEY_MAP, normalizePath, normalizeText } from '@/lib/page-center/config';
import { buildMiniProgramBetaRoutePath, type UserPageBetaFeatureRow } from '@/lib/page-center/user-beta';

const ROUTE_PAGE_KEY_MAP = new Map<string, string>([
  ['/pages/profile/beta/pose/index', 'pose'],
  ['/pages/index/index', 'pose'],
  ['/pose', 'pose'],
  ['/poses', 'pose'],
  ['/pages/album/index', 'album'],
  ['/album', 'album'],
  ['/extract', 'album'],
  ['/pages/gallery/index', 'gallery'],
  ['/gallery', 'gallery'],
  ['/pages/booking/index', 'booking'],
  ['/booking', 'booking'],
  ['/pages/profile/index', 'profile'],
  ['/profile', 'profile'],
  ['/pages/profile/about/index', 'profile'],
  ['/about', 'profile'],
]);

function normalizeRouteLookup(input: unknown): string {
  return normalizePath(String(input || '').trim().split('?')[0]).replace(/\/+$/, '').toLowerCase();
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : fallback;
}

export function resolveLegacyBetaPageKeyFromRoute(routePath: unknown): string {
  return ROUTE_PAGE_KEY_MAP.get(normalizeRouteLookup(routePath)) || '';
}

export function mapLegacyFeatureRowsToPageCenterRows(
  rows: unknown[],
  channel: AppChannel
): UserPageBetaFeatureRow[] {
  const result: UserPageBetaFeatureRow[] = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const current = row && typeof row === 'object' ? (row as Record<string, unknown>) : {};
    const pageKey = resolveLegacyBetaPageKeyFromRoute(current.route_path);
    const page = PAGE_KEY_MAP.get(pageKey);
    if (!pageKey || !page) {
      continue;
    }

    const directRouteWeb = page.routePathWeb;
    const previewRouteWeb = page.previewRoutePathWeb || page.routePathWeb;
    const previewRouteMiniProgram = buildMiniProgramBetaRoutePath(
      normalizePath(page.previewRoutePathMiniProgram || page.routePathMiniProgram),
      pageKey
    );

    result.push({
      binding_id: normalizeText(current.binding_id),
      bound_at: normalizeNullableText(current.bound_at),
      feature_id: pageKey,
      feature_name: normalizeText(current.feature_name) || page.pageName,
      feature_description: normalizeNullableText(current.feature_description) || page.pageDescription,
      feature_code: normalizeText(current.feature_code),
      expires_at: normalizeNullableText(current.expires_at),
      route_id: toNumber(current.route_id, 0),
      route_path: channel === 'web' ? directRouteWeb || previewRouteWeb : previewRouteMiniProgram,
      route_title: normalizeText(current.route_title) || page.pageName,
      route_description: normalizeNullableText(current.route_description) || page.pageDescription,
      route_path_web: directRouteWeb || previewRouteWeb,
      preview_route_path_web: previewRouteWeb,
    });
  }

  return result;
}
