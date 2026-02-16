import 'server-only';

import cloudbase from '@cloudbase/node-sdk';
import { env } from '@/lib/env';

type CloudBaseApp = any;

let appInstance: CloudBaseApp | null = null;

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const CLOUDBASE_TIMEOUT_MS = parsePositiveInt(process.env.CLOUDBASE_SQL_TIMEOUT_MS, 12000);
const CLOUDBASE_RETRIES = parsePositiveInt(process.env.CLOUDBASE_SQL_RETRIES, 2);

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

  appInstance = cloudbase.init({
    env: cloudbaseEnvId,
    secretId,
    secretKey,
    region: region || undefined,
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
