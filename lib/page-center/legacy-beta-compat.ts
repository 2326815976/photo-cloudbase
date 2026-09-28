import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { AppChannel, normalizeText } from '@/lib/page-center/config';
import { mapLegacyFeatureRowsToPageCenterRows } from '@/lib/page-center/legacy-beta';
import { tableExists } from '@/lib/page-center/sql-compat';
import { type UserPageBetaFeatureRow } from '@/lib/page-center/user-beta';
import { BETA_FEATURE_CODE_LENGTH, normalizeBetaFeatureCode } from '@/lib/utils/admin-beta';

const NOW_UTC8_EXPR = "CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')";

function normalizeChannel(input: unknown, fallback: AppChannel = 'miniprogram'): AppChannel {
  return normalizeText(input) === 'web' ? 'web' : fallback;
}

function buildFeatureIndex(rows: UserPageBetaFeatureRow[]) {
  const map = new Map<string, UserPageBetaFeatureRow>();
  for (const row of Array.isArray(rows) ? rows : []) {
    const featureId = normalizeText(row && row.feature_id);
    if (!featureId || map.has(featureId)) {
      continue;
    }
    map.set(featureId, row);
  }
  return map;
}

export async function canUseLegacyPageCenterBeta(): Promise<boolean> {
  const [hasVersions, hasRoutes, hasBindings] = await Promise.all([
    tableExists('feature_beta_versions'),
    tableExists('feature_beta_routes'),
    tableExists('user_beta_feature_bindings'),
  ]);

  return hasVersions && hasRoutes && hasBindings;
}

async function loadLegacyBinding(userId: string, featureId: string) {
  const result = await executeSQL(
    `
      SELECT
        id AS binding_id,
        created_at AS bound_at
      FROM user_beta_feature_bindings
      WHERE user_id = {{user_id}}
        AND feature_id = {{feature_id}}
      LIMIT 1
    `,
    {
      user_id: userId,
      feature_id: featureId,
    }
  );

  return Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
}

export async function bindUserToLegacyPageBetaByCode(
  userId: string,
  featureCodeInput: unknown,
  channelInput: unknown = 'miniprogram'
): Promise<UserPageBetaFeatureRow | null> {
  const channel = normalizeChannel(channelInput, 'miniprogram');
  const featureCode = normalizeBetaFeatureCode(featureCodeInput);
  if (!featureCode) {
    throw new Error('请输入内测码');
  }
  if (featureCode.length !== BETA_FEATURE_CODE_LENGTH) {
    throw new Error(`内测码必须是 ${BETA_FEATURE_CODE_LENGTH} 位大写字母或数字`);
  }

  const result = await executeSQL(
    `
      SELECT
        v.id AS feature_id,
        v.feature_name,
        v.feature_description,
        v.feature_code,
        v.is_active AS feature_is_active,
        v.expires_at,
        CASE
          WHEN NOT (v.expires_at <=> NULL) AND v.expires_at < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired,
        r.id AS route_id,
        r.route_path,
        r.route_title,
        r.route_description,
        r.is_active AS route_is_active
      FROM feature_beta_versions v
      JOIN feature_beta_routes r ON r.id = v.route_id
      WHERE LEFT(REPLACE(REPLACE(REPLACE(UPPER(v.feature_code), '-', ''), '_', ''), ' ', ''), ${BETA_FEATURE_CODE_LENGTH}) = {{feature_code}}
      LIMIT 1
    `,
    {
      feature_code: featureCode,
    }
  );

  const feature = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!feature) {
    return null;
  }

  if (Number(feature.feature_is_active || 0) !== 1) {
    throw new Error('该内测功能已下线');
  }
  if (Number(feature.route_is_active || 0) !== 1) {
    throw new Error('该内测功能入口已关闭');
  }
  if (Number(feature.is_expired || 0) === 1) {
    throw new Error('该内测码已过期');
  }

  const featureId = normalizeText(feature.feature_id);
  if (!featureId) {
    return null;
  }

  await executeSQL(
    `
      INSERT IGNORE INTO user_beta_feature_bindings (id, user_id, feature_id, created_at)
      VALUES ({{id}}, {{user_id}}, {{feature_id}}, ${NOW_UTC8_EXPR})
    `,
    {
      id: randomUUID(),
      user_id: userId,
      feature_id: featureId,
    }
  );

  const binding = await loadLegacyBinding(userId, featureId);
  const rows = mapLegacyFeatureRowsToPageCenterRows(
    [
      {
        binding_id: normalizeText(binding?.binding_id),
        bound_at: binding?.bound_at ?? null,
        feature_id: featureId,
        feature_name: feature.feature_name,
        feature_description: feature.feature_description,
        feature_code: feature.feature_code,
        expires_at: feature.expires_at,
        route_id: feature.route_id,
        route_path: feature.route_path,
        route_title: feature.route_title,
        route_description: feature.route_description,
      },
    ],
    channel
  );

  return rows[0] || null;
}

export async function getLegacyUserPageBetaFeatures(
  userId: string,
  channelInput: unknown = 'miniprogram'
): Promise<UserPageBetaFeatureRow[]> {
  const channel = normalizeChannel(channelInput, 'miniprogram');
  const result = await executeSQL(
    `
      SELECT
        b.id AS binding_id,
        b.created_at AS bound_at,
        v.id AS feature_id,
        v.feature_name,
        v.feature_description,
        v.feature_code,
        v.expires_at,
        r.id AS route_id,
        r.route_path,
        r.route_title,
        r.route_description
      FROM user_beta_feature_bindings b
      JOIN feature_beta_versions v ON v.id = b.feature_id
      JOIN feature_beta_routes r ON r.id = v.route_id
      WHERE b.user_id = {{user_id}}
        AND v.is_active = 1
        AND r.is_active = 1
        AND ((v.expires_at <=> NULL) OR v.expires_at >= ${NOW_UTC8_EXPR})
      ORDER BY b.created_at DESC
    `,
    {
      user_id: userId,
    }
  );

  return mapLegacyFeatureRowsToPageCenterRows(Array.isArray(result.rows) ? result.rows : [], channel);
}

export async function checkLegacyUserPageBetaAccess(
  userId: string,
  pageKeyInput: unknown,
  channelInput: unknown = 'miniprogram'
): Promise<UserPageBetaFeatureRow | null> {
  const pageKey = normalizeText(pageKeyInput);
  if (!pageKey) {
    return null;
  }

  const rows = await getLegacyUserPageBetaFeatures(userId, channelInput);
  return buildFeatureIndex(rows).get(pageKey) || null;
}

export async function unbindLegacyUserPageBetaFeature(
  userId: string,
  featureIdInput: unknown,
  channelInput: unknown = 'miniprogram'
): Promise<boolean> {
  const featureId = normalizeText(featureIdInput);
  if (!featureId) {
    throw new Error('参数错误：缺少功能标识');
  }

  const rows = await getLegacyUserPageBetaFeatures(userId, channelInput);
  const bindingIds = rows
    .filter((row) => normalizeText(row && row.feature_id) === featureId)
    .map((row) => normalizeText(row && row.binding_id))
    .filter(Boolean);

  if (bindingIds.length === 0) {
    return false;
  }

  await Promise.all(
    bindingIds.map((bindingId) =>
      executeSQL(
        `
          DELETE FROM user_beta_feature_bindings
          WHERE user_id = {{user_id}}
            AND id = {{binding_id}}
        `,
        {
          user_id: userId,
          binding_id: bindingId,
        }
      )
    )
  );

  return true;
}

export function mergeCompatibleBetaFeatures(
  primaryRows: UserPageBetaFeatureRow[],
  fallbackRows: UserPageBetaFeatureRow[]
): UserPageBetaFeatureRow[] {
  const merged = new Map<string, UserPageBetaFeatureRow>();

  for (const row of Array.isArray(primaryRows) ? primaryRows : []) {
    const featureId = normalizeText(row && row.feature_id);
    if (!featureId || merged.has(featureId)) {
      continue;
    }
    merged.set(featureId, row);
  }

  for (const row of Array.isArray(fallbackRows) ? fallbackRows : []) {
    const featureId = normalizeText(row && row.feature_id);
    if (!featureId || merged.has(featureId)) {
      continue;
    }
    merged.set(featureId, row);
  }

  return Array.from(merged.values());
}
