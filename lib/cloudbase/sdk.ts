import 'server-only';

import cloudbase from '@cloudbase/node-sdk';
import { env } from '@/lib/env';

type CloudBaseApp = any;

let appInstance: CloudBaseApp | null = null;

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

  appInstance = cloudbase.init({
    env: cloudbaseEnvId,
    secretId,
    secretKey,
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
