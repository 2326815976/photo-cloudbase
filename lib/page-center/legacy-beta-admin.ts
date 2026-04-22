import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { type AppPageBetaCodeItem, normalizeBoolean, normalizeText } from '@/lib/page-center/config';
import { resolveLegacyBetaPageKeyFromRoute } from '@/lib/page-center/legacy-beta';
import { tableExists } from '@/lib/page-center/sql-compat';

export function extractLegacyOverviewBetaVersionId(codeId: unknown): string {
  const normalizedCodeId = normalizeText(codeId);
  if (!normalizedCodeId.startsWith('legacy:')) {
    return '';
  }
  return normalizeText(normalizedCodeId.slice('legacy:'.length));
}

export function isLegacyOverviewBetaCodeId(codeId: unknown): boolean {
  return Boolean(extractLegacyOverviewBetaVersionId(codeId));
}

export async function canUseLegacyOverviewBetaCodes(): Promise<boolean> {
  const [hasVersions, hasRoutes] = await Promise.all([
    tableExists('feature_beta_versions'),
    tableExists('feature_beta_routes'),
  ]);

  return hasVersions && hasRoutes;
}

export async function loadLegacyOverviewBetaCodes(): Promise<AppPageBetaCodeItem[]> {
  if (!(await canUseLegacyOverviewBetaCodes())) {
    return [];
  }

  const result = await executeSQL(`
    SELECT
      v.id AS feature_id,
      v.feature_name,
      v.feature_code,
      v.is_active AS feature_is_active,
      v.expires_at,
      v.created_at,
      v.updated_at,
      r.route_path,
      r.is_active AS route_is_active
    FROM feature_beta_versions v
    JOIN feature_beta_routes r ON r.id = v.route_id
    ORDER BY v.updated_at DESC, v.created_at DESC, v.id DESC
  `);

  const rows = Array.isArray(result.rows) ? result.rows : [];
  const items: AppPageBetaCodeItem[] = [];

  for (const row of rows) {
    const pageKey = resolveLegacyBetaPageKeyFromRoute(row.route_path);
    if (!pageKey) {
      continue;
    }

    const betaCode = normalizeText(row.feature_code);
    if (!betaCode) {
      continue;
    }

    items.push({
      id: `legacy:${normalizeText(row.feature_id)}`,
      pageKey,
      channel: 'web',
      betaName: normalizeText(row.feature_name) || '旧体系内测码',
      betaCode,
      isActive:
        normalizeBoolean(row.feature_is_active, true) &&
        normalizeBoolean(row.route_is_active, true),
      expiresAt: normalizeText(row.expires_at),
      createdAt: normalizeText(row.created_at),
      updatedAt: normalizeText(row.updated_at || row.created_at),
      source: 'legacy',
      readOnly: true,
      manageHint: '旧体系兼容码仅在 Web 页面管理中展示；小程序端已切换为页面中心新体系。',
    });
  }

  return items;
}

export async function loadLegacyOverviewBetaCodeById(codeId: unknown): Promise<AppPageBetaCodeItem | null> {
  const versionId = extractLegacyOverviewBetaVersionId(codeId);
  if (!versionId || !(await canUseLegacyOverviewBetaCodes())) {
    return null;
  }

  const result = await executeSQL(
    `
      SELECT
        v.id AS feature_id,
        v.feature_name,
        v.feature_code,
        v.is_active AS feature_is_active,
        v.expires_at,
        v.created_at,
        v.updated_at,
        r.route_path,
        r.is_active AS route_is_active
      FROM feature_beta_versions v
      JOIN feature_beta_routes r ON r.id = v.route_id
      WHERE v.id = {{feature_id}}
      LIMIT 1
    `,
    { feature_id: versionId }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!row) {
    return null;
  }

  const pageKey = resolveLegacyBetaPageKeyFromRoute(row.route_path);
  const betaCode = normalizeText(row.feature_code);
  if (!pageKey || !betaCode) {
    return null;
  }

  return {
    id: `legacy:${normalizeText(row.feature_id)}`,
    pageKey,
    channel: 'web',
    betaName: normalizeText(row.feature_name) || '旧体系内测码',
    betaCode,
    isActive:
      normalizeBoolean(row.feature_is_active, true) &&
      normalizeBoolean(row.route_is_active, true),
    expiresAt: normalizeText(row.expires_at),
    createdAt: normalizeText(row.created_at),
    updatedAt: normalizeText(row.updated_at || row.created_at),
    source: 'legacy',
    readOnly: true,
    manageHint: '旧体系兼容码仅在 Web 页面管理中展示；小程序端已切换为页面中心新体系。',
  };
}

export function mergeCompatibleAdminBetaCodes(
  pageCenterCodes: AppPageBetaCodeItem[],
  legacyCodes: AppPageBetaCodeItem[]
): AppPageBetaCodeItem[] {
  const merged = new Map<string, AppPageBetaCodeItem>();

  for (const item of Array.isArray(pageCenterCodes) ? pageCenterCodes : []) {
    const key = normalizeText(item && item.id);
    if (!key || merged.has(key)) {
      continue;
    }
    merged.set(key, item);
  }

  for (const item of Array.isArray(legacyCodes) ? legacyCodes : []) {
    const key = normalizeText(item && item.id);
    if (!key || merged.has(key)) {
      continue;
    }
    merged.set(key, item);
  }

  return Array.from(merged.values());
}
