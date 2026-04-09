import 'server-only';

import cloudbase from '@cloudbase/node-sdk';
import { env } from '@/lib/env';

type CloudBaseApp = any;

type CloudBaseContextConfig = {
  URL?: unknown;
  url?: unknown;
  [key: string]: unknown;
};

let appInstance: CloudBaseApp | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const CLOUDBASE_TIMEOUT_MS = parsePositiveInt(process.env.CLOUDBASE_SQL_TIMEOUT_MS, 10000);
const CLOUDBASE_RETRIES = parsePositiveInt(process.env.CLOUDBASE_SQL_RETRIES, 0);

function normalizeProtocol(raw: string | undefined): 'http' | 'https' {
  const normalized = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/:+$/, '');

  return normalized === 'http' ? 'http' : 'https';
}

function normalizeInjectedCloudBaseUrl(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) {
    return '';
  }

  return value.replace(/^(https?):+\/\//i, '$1://');
}

function buildCloudBaseAdminUrl(
  cloudbaseEnvId: string,
  region: string,
  protocol: 'http' | 'https'
): string {
  const normalizedEnvId = String(cloudbaseEnvId || '').trim();
  const normalizedRegion = String(region || '').trim();
  if (!normalizedEnvId) {
    return '';
  }

  const endpoint = normalizedRegion
    ? `${normalizedEnvId}.${normalizedRegion}.tcb-api.tencentcloudapi.com`
    : `${normalizedEnvId}.tcb-api.tencentcloudapi.com`;

  return `${protocol}://${endpoint}/admin`;
}

function sanitizeCloudBaseContextConfig(
  cloudbaseEnvId: string,
  region: string,
  protocol: 'http' | 'https'
): void {
  const raw = process.env.TCB_CONTEXT_CNFG;
  let parsed: CloudBaseContextConfig = {};

  if (raw) {
    try {
      parsed = JSON.parse(raw) as CloudBaseContextConfig;
    } catch {
      parsed = {};
    }
  }

  const currentUrl = normalizeInjectedCloudBaseUrl(parsed.URL ?? parsed.url);
  const expectedUrl = buildCloudBaseAdminUrl(cloudbaseEnvId, region, protocol);
  const shouldForceLocalUrl = !String(process.env.TENCENTCLOUD_RUNENV || '').trim() && Boolean(expectedUrl);
  const nextUrl = shouldForceLocalUrl ? expectedUrl : currentUrl;

  if (!nextUrl) {
    if (raw && !Object.keys(parsed).length) {
      delete process.env.TCB_CONTEXT_CNFG;
    }
    return;
  }

  const nextConfig: CloudBaseContextConfig = {
    ...parsed,
    URL: nextUrl,
  };

  if (Object.prototype.hasOwnProperty.call(nextConfig, 'url')) {
    delete nextConfig.url;
  }

  const nextRaw = JSON.stringify(nextConfig);
  if (nextRaw === raw) {
    return;
  }

  process.env.TCB_CONTEXT_CNFG = nextRaw;

  if (process.env.DEBUG_CLOUDBASE_SDK === 'true') {
    console.info('[cloudbase.sdk] normalized TCB_CONTEXT_CNFG', {
      from: parsed.URL ?? parsed.url ?? null,
      to: nextUrl,
      forced: shouldForceLocalUrl,
    });
  }
}

function assertCloudBaseConfig() {
  const cloudbaseEnvId = env.CLOUDBASE_ID();
  const secretId = env.CLOUDBASE_SECRET_ID();
  const secretKey = env.CLOUDBASE_SECRET_KEY();

  if (!cloudbaseEnvId || !secretId || !secretKey) {
    throw new Error(
      'CloudBase 配置缺失：请检查 CLOUDBASE_ID、CLOUDBASE_SECRET_ID、CLOUDBASE_SECRET_KEY'
    );
  }

  return {
    cloudbaseEnvId,
    secretId,
    secretKey,
  };
}

export function getCloudBaseApp(): CloudBaseApp {
  if (appInstance) {
    return appInstance;
  }

  const { cloudbaseEnvId, secretId, secretKey } = assertCloudBaseConfig();
  const region = env.CLOUDBASE_SQL_REGION();
  const protocol = normalizeProtocol(process.env.CLOUDBASE_PROTOCOL);

  sanitizeCloudBaseContextConfig(cloudbaseEnvId, region, protocol);

  appInstance = cloudbase.init({
    env: cloudbaseEnvId,
    secretId,
    secretKey,
    region: region || undefined,
    protocol,
    timeout: CLOUDBASE_TIMEOUT_MS,
    keepalive: true,
    retries: CLOUDBASE_RETRIES,
  });

  return appInstance;
}

export function getCloudBaseSqlModel(): any {
  const dbName = env.CLOUDBASE_SQL_DB_NAME();
  if (!dbName) {
    throw new Error('CloudBase SQL 数据库名缺失：请设置 CLOUDBASE_SQL_DB_NAME');
  }

  return getCloudBaseApp().models;
}

export function resetCloudBaseApp(): void {
  appInstance = null;
}
