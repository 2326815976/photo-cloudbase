import { randomUUID } from 'crypto';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { AppChannel, normalizeText } from '@/lib/page-center/config';
import { BETA_FEATURE_CODE_LENGTH, normalizeBetaFeatureCode } from '@/lib/utils/admin-beta';

const NOW_UTC8_EXPR = "CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+08:00')";

export interface UserPageBetaFeatureRow {
  binding_id: string;
  bound_at: string | null;
  feature_id: string;
  feature_name: string;
  feature_description: string | null;
  feature_code: string;
  expires_at: string | null;
  route_id: number;
  route_path: string;
  route_title: string;
  route_description: string | null;
  route_path_web?: string;
  preview_route_path_web?: string;
}

function normalizeChannel(input: unknown, fallback: AppChannel = 'miniprogram'): AppChannel {
  return normalizeText(input) === 'web' ? 'web' : fallback;
}

function getChannelLabel(channel: unknown) {
  return normalizeText(channel) === 'web' ? 'Web' : '小程序';
}

async function tableExists(tableName: string): Promise<boolean> {
  try {
    const result = await executeSQL(
      `
        SELECT COUNT(*) AS row_count
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = {{table_name}}
        LIMIT 1
      `,
      { table_name: tableName }
    );
    const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
    return Number(row?.row_count || 0) > 0;
  } catch {
    return false;
  }
}

export async function canUsePageCenterBeta(): Promise<boolean> {
  const [hasCodes, hasRegistry, hasRules, hasBindings] = await Promise.all([
    tableExists('app_page_beta_codes'),
    tableExists('app_page_registry'),
    tableExists('app_page_publish_rules'),
    tableExists('user_page_beta_bindings'),
  ]);

  return hasCodes && hasRegistry && hasRules && hasBindings;
}

function normalizeNullableText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function toNumber(value: unknown, fallback = 0): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? Math.round(numberValue) : fallback;
}

function normalizeRoutePath(value: unknown): string {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.startsWith('/') ? text : `/${text}`;
}

export function buildMiniProgramBetaRoutePath(routePathInput: unknown, pageKeyInput: unknown): string {
  const routePath = normalizeRoutePath(routePathInput);
  if (!routePath) {
    return '';
  }

  const [pathname, rawQuery = ''] = routePath.split('?');
  const params = new URLSearchParams(rawQuery);
  params.set('presentation', 'beta');

  const pageKey = normalizeText(pageKeyInput);
  if (pageKey && !params.get('page_key')) {
    params.set('page_key', pageKey);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function buildFeatureRow(row: Record<string, unknown>, channel: AppChannel): UserPageBetaFeatureRow {
  const directRoutePathWeb = normalizeRoutePath(row.route_path_web);
  const previewRoutePathWeb = normalizeRoutePath(row.preview_route_path_web || row.route_path_web);
  const routePathMiniProgram = buildMiniProgramBetaRoutePath(
    row.preview_route_path_miniprogram || row.route_path_miniprogram,
    row.page_key
  );

  return {
    binding_id: normalizeText(row.binding_id),
    bound_at: normalizeNullableText(row.bound_at),
    feature_id: normalizeText(row.page_key),
    feature_name: normalizeText(row.page_name),
    feature_description: normalizeNullableText(row.page_description),
    feature_code: normalizeBetaFeatureCode(row.beta_code),
    expires_at: normalizeNullableText(row.expires_at),
    route_id: toNumber(row.page_id, 0),
    route_path: channel === 'web' ? directRoutePathWeb || previewRoutePathWeb : routePathMiniProgram,
    route_title: normalizeText(row.page_name),
    route_description: normalizeNullableText(row.page_description),
    route_path_web: directRoutePathWeb || previewRoutePathWeb,
    preview_route_path_web: previewRoutePathWeb,
  };
}

async function deleteBinding(userId: string, pageId: number, channel: AppChannel) {
  await executeSQL(
    `
      DELETE FROM user_page_beta_bindings
      WHERE user_id = {{user_id}}
        AND page_id = {{page_id}}
        AND channel = {{channel}}
      LIMIT 1
    `,
    {
      user_id: userId,
      page_id: pageId,
      channel,
    }
  );
}

export async function bindUserToPageBetaByCode(
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
        c.id AS beta_code_id,
        c.beta_code,
        c.beta_name,
        c.channel AS beta_channel,
        c.is_active AS code_is_active,
        c.expires_at,
        CASE
          WHEN NOT (c.expires_at <=> NULL) AND c.expires_at < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired,
        p.id AS page_id,
        p.page_key,
        p.page_name,
        p.page_description,
        p.route_path_web,
        p.preview_route_path_web,
        p.route_path_miniprogram,
        p.preview_route_path_miniprogram,
        p.supports_beta AS page_supports_beta,
        IFNULL(r.publish_state, 'offline') AS publish_state,
        CASE
          WHEN c.channel = {{channel}} THEN 0
          WHEN c.channel = 'shared' THEN 1
          ELSE 2
        END AS channel_match_rank
      FROM app_page_beta_codes c
      JOIN app_page_registry p ON p.id = c.page_id
      LEFT JOIN app_page_publish_rules r ON r.page_id = p.id AND r.channel = {{channel}}
      WHERE p.is_active = 1
        AND LEFT(REPLACE(REPLACE(REPLACE(UPPER(c.beta_code), '-', ''), '_', ''), ' ', ''), ${BETA_FEATURE_CODE_LENGTH}) = {{feature_code}}
      ORDER BY
        channel_match_rank ASC,
        c.updated_at DESC,
        c.created_at DESC,
        c.id DESC
      LIMIT 1
    `,
    {
      channel,
      feature_code: featureCode,
    }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!row) {
    return null;
  }

  if (![channel, 'shared'].includes(normalizeText(row.beta_channel))) {
    throw new Error(`该内测码仅适用于${getChannelLabel(row.beta_channel)}端`);
  }

  if (Number(row.page_supports_beta || 0) !== 1) {
    throw new Error('该页面当前未开放内测入口');
  }
  if (Number(row.code_is_active || 0) !== 1) {
    throw new Error('该内测功能已下线');
  }
  if (Number(row.is_expired || 0) === 1) {
    throw new Error('该内测码已过期');
  }

  const publishState = normalizeText(row.publish_state);
  if (publishState !== 'beta') {
    throw new Error('该页面当前未开放内测入口');
  }

  await executeSQL(
    `
      INSERT INTO user_page_beta_bindings (id, user_id, page_id, beta_code_id, channel, created_at)
      VALUES ({{id}}, {{user_id}}, {{page_id}}, {{beta_code_id}}, {{channel}}, ${NOW_UTC8_EXPR})
      ON DUPLICATE KEY UPDATE
        beta_code_id = VALUES(beta_code_id),
        created_at = VALUES(created_at)
    `,
    {
      id: randomUUID(),
      user_id: userId,
      page_id: Number(row.page_id || 0),
      beta_code_id: String(row.beta_code_id || ''),
      channel,
    }
  );

  return buildFeatureRow(row, channel);
}

export async function getUserPageBetaFeatures(
  userId: string,
  channelInput: unknown = 'miniprogram'
): Promise<UserPageBetaFeatureRow[]> {
  const channel = normalizeChannel(channelInput, 'miniprogram');
  const result = await executeSQL(
    `
      SELECT
        b.id AS binding_id,
        b.created_at AS bound_at,
        p.id AS page_id,
        p.page_key,
        p.page_name,
        p.page_description,
        p.supports_beta AS page_supports_beta,
        c.beta_code,
        c.expires_at,
        p.route_path_web,
        p.preview_route_path_web,
        p.route_path_miniprogram,
        p.preview_route_path_miniprogram,
        IFNULL(r.publish_state, 'offline') AS publish_state,
        c.is_active AS code_is_active
      FROM user_page_beta_bindings b
      JOIN app_page_registry p ON p.id = b.page_id
      JOIN app_page_beta_codes c ON c.id = b.beta_code_id
      LEFT JOIN app_page_publish_rules r ON r.page_id = p.id AND r.channel = {{channel}}
      WHERE b.user_id = {{user_id}}
        AND b.channel = {{channel}}
        AND p.is_active = 1
        AND c.is_active = 1
        AND c.channel IN ({{channel}}, 'shared')
        AND ((c.expires_at <=> NULL) OR c.expires_at >= ${NOW_UTC8_EXPR})
        AND IFNULL(r.publish_state, 'offline') = 'beta'
      ORDER BY b.created_at DESC
    `,
    {
      user_id: userId,
      channel,
    }
  );

  return (Array.isArray(result.rows) ? result.rows : [])
    .filter((row) => Number((row as Record<string, unknown>).page_supports_beta || 0) === 1)
    .map((row) => buildFeatureRow(row as Record<string, unknown>, channel));
}

export async function unbindUserPageBetaFeature(
  userId: string,
  featureIdInput: unknown,
  channelInput: unknown = 'miniprogram'
): Promise<boolean> {
  const channel = normalizeChannel(channelInput, 'miniprogram');
  const pageKey = normalizeText(featureIdInput);
  if (!pageKey) {
    throw new Error('参数错误：缺少功能标识');
  }

  const result = await executeSQL(
    `
      SELECT p.id AS page_id
      FROM user_page_beta_bindings b
      JOIN app_page_registry p ON p.id = b.page_id
      WHERE b.user_id = {{user_id}}
        AND b.channel = {{channel}}
        AND p.page_key = {{page_key}}
      LIMIT 1
    `,
    {
      user_id: userId,
      channel,
      page_key: pageKey,
    }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  const pageId = Number(row?.page_id || 0);
  if (!pageId) {
    return false;
  }

  await deleteBinding(userId, pageId, channel);
  return true;
}

export async function checkUserPageBetaAccess(
  userId: string,
  featureIdInput: unknown,
  channelInput: unknown = 'miniprogram'
): Promise<UserPageBetaFeatureRow | null> {
  const channel = normalizeChannel(channelInput, 'miniprogram');
  const pageKey = normalizeText(featureIdInput);
  if (!pageKey) {
    throw new Error('参数错误：缺少功能标识');
  }

  const result = await executeSQL(
    `
      SELECT
        b.id AS binding_id,
        b.created_at AS bound_at,
        p.id AS page_id,
        p.page_key,
        p.page_name,
        p.page_description,
        p.supports_beta AS page_supports_beta,
        c.beta_code,
        c.is_active AS code_is_active,
        c.expires_at,
        CASE
          WHEN NOT (c.expires_at <=> NULL) AND c.expires_at < ${NOW_UTC8_EXPR} THEN 1
          ELSE 0
        END AS is_expired,
        p.route_path_web,
        p.preview_route_path_web,
        p.route_path_miniprogram,
        p.preview_route_path_miniprogram,
        IFNULL(r.publish_state, 'offline') AS publish_state
      FROM user_page_beta_bindings b
      JOIN app_page_registry p ON p.id = b.page_id
      JOIN app_page_beta_codes c ON c.id = b.beta_code_id
      LEFT JOIN app_page_publish_rules r ON r.page_id = p.id AND r.channel = {{channel}}
      WHERE b.user_id = {{user_id}}
        AND b.channel = {{channel}}
        AND p.page_key = {{page_key}}
      LIMIT 1
    `,
    {
      user_id: userId,
      channel,
      page_key: pageKey,
    }
  );

  const row = Array.isArray(result.rows) && result.rows.length > 0 ? result.rows[0] : null;
  if (!row) {
    return null;
  }

  const pageId = Number(row.page_id || 0);
  const supportsBeta = Number(row.page_supports_beta || 0) === 1;
  const publishState = normalizeText(row.publish_state);
  const codeIsActive = Number(row.code_is_active || 0) === 1;
  const isExpired = Number(row.is_expired || 0) === 1;

  if (!supportsBeta || !codeIsActive || isExpired || publishState !== 'beta') {
    if (pageId > 0) {
      await deleteBinding(userId, pageId, channel);
    }

    if (!supportsBeta || publishState !== 'beta') {
      throw new Error('该页面当前未开放内测入口');
    }
    if (!codeIsActive) {
      throw new Error('该内测功能已下线');
    }
    throw new Error('该内测功能已过期');
  }

  return buildFeatureRow(row, channel);
}
