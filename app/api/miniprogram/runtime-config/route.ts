import { NextResponse } from 'next/server';
import {
  buildMiniProgramRuntimeWithPageCenter,
  loadEffectiveMiniProgramRuntimeConfig,
} from '@/lib/page-center/runtime';
import { buildRuntimeConfigPreset } from '@/lib/miniprogram/runtime-config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseBooleanLike(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    return value !== 0;
  }

  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return null;
}

function resolveLegacyHideAuditFlag(runtimeConfig: unknown): boolean {
  const envValue = parseBooleanLike(process.env.HIDE_AUDIT);
  if (typeof envValue === 'boolean') {
    return envValue;
  }

  if (!runtimeConfig || typeof runtimeConfig !== 'object') {
    return false;
  }

  const source = runtimeConfig as Record<string, unknown>;
  const directValue =
    parseBooleanLike(source.hideAudit) ??
    parseBooleanLike(source.hide_audit) ??
    parseBooleanLike(source.legacyHideAudit) ??
    parseBooleanLike(source.legacy_hide_audit);

  return typeof directValue === 'boolean' ? directValue : false;
}

function buildLegacyCompatiblePayload(runtimeConfig: unknown) {
  const hideAudit = resolveLegacyHideAuditFlag(runtimeConfig);
  const base =
    runtimeConfig && typeof runtimeConfig === 'object'
      ? (runtimeConfig as Record<string, unknown>)
      : {};

  return {
    ...base,
    hideAudit,
    hide_audit: hideAudit,
    legacyHideAudit: hideAudit,
    legacy_hide_audit: hideAudit,
  };
}

export async function GET() {
  try {
    const baseRuntimeConfig = await loadEffectiveMiniProgramRuntimeConfig();
    const mergedRuntimeConfig = await buildMiniProgramRuntimeWithPageCenter(baseRuntimeConfig);
    return NextResponse.json(buildLegacyCompatiblePayload(mergedRuntimeConfig));
  } catch {
    // 数据库未迁移或暂时不可用时，回退到标准默认配置
  }

  return NextResponse.json(buildLegacyCompatiblePayload(buildRuntimeConfigPreset('standard')));
}
