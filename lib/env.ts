// 统一的环境变量访问工具
// 支持运行时配置（CloudBase）和构建时配置（本地开发）

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      NEXT_PUBLIC_APP_URL?: string;
      NEXT_PUBLIC_CLOUDBASE_STORAGE_DOMAIN?: string;
      NEXT_PUBLIC_TMAP_KEY?: string;
    };
  }
}

/**
 * 获取环境变量的统一方法
 * 客户端优先级：window.__RUNTIME_CONFIG__ > process.env.NEXT_PUBLIC_* > process.env.*
 * 服务端优先级：process.env.* > process.env.NEXT_PUBLIC_*
 */
function normalizeEnvValue(value: string | undefined): string {
  if (!value) return '';

  const normalized = value.trim();
  // CloudBase 控制台不会展开 "$VAR" 语法，避免将其当作真实配置。
  if (/^\$[A-Z_][A-Z0-9_]*$/.test(normalized)) {
    return '';
  }

  return normalized;
}

function getServerEnv(...keys: string[]): string {
  for (let i = 0; i < keys.length; i += 1) {
    const key = String(keys[i] || '').trim();
    if (!key) continue;
    const value = normalizeEnvValue(process.env[key]);
    if (value) return value;
  }
  return '';
}

function getEnv(key: string): string {
  // 客户端：优先使用运行时配置
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__) {
    const runtimeKey = `NEXT_PUBLIC_${key}` as keyof typeof window.__RUNTIME_CONFIG__;
    const value = normalizeEnvValue(window.__RUNTIME_CONFIG__[runtimeKey]);
    if (value) return value;
  }

  // 降级到构建时环境变量
  const nextPublicKey = `NEXT_PUBLIC_${key}`;
  if (typeof window === 'undefined') {
    return normalizeEnvValue(process.env[key]) || normalizeEnvValue(process.env[nextPublicKey]);
  }

  return normalizeEnvValue(process.env[nextPublicKey]) || normalizeEnvValue(process.env[key]);
}

function resolveCloudBaseStorageDomain(): string {
  const configuredDomain = getEnv('CLOUDBASE_STORAGE_DOMAIN');
  if (configuredDomain) {
    return configuredDomain;
  }

  const bucketId =
    getServerEnv('CLOUDBASE_BUCKET_ID') ||
    getServerEnv('NEXT_PUBLIC_CLOUDBASE_BUCKET_ID');

  if (!bucketId) {
    return '';
  }

  return `https://${bucketId}.tcb.qcloud.la`;
}

// 导出所有环境变量访问函数
export const env = {
  // 应用配置
  APP_URL: () => getEnv('APP_URL'),

  // 腾讯地图配置
  TMAP_KEY: () => getEnv('TMAP_KEY') || getEnv('TMAP_SERVER_KEY') || getEnv('TMAP_WEBSERVICE_KEY'),
  TMAP_SERVER_KEY: () => getEnv('TMAP_SERVER_KEY') || getEnv('TMAP_WEBSERVICE_KEY') || getEnv('TMAP_KEY'),

  // 腾讯云 CloudBase 配置（服务端）
  CLOUDBASE_ID: () => getServerEnv('CLOUDBASE_ID'),
  CLOUDBASE_SECRET_ID: () => getServerEnv('CLOUDBASE_SECRET_ID'),
  CLOUDBASE_SECRET_KEY: () => getServerEnv('CLOUDBASE_SECRET_KEY'),
  CLOUDBASE_BUCKET_ID: () => getServerEnv('CLOUDBASE_BUCKET_ID', 'NEXT_PUBLIC_CLOUDBASE_BUCKET_ID'),
  CLOUDBASE_STORAGE_DOMAIN: () => resolveCloudBaseStorageDomain(),
  CLOUDBASE_SQL_DB_NAME: () => getServerEnv('CLOUDBASE_SQL_DB_NAME', 'CLOUDBASE_DB_NAME') || 'photo',
  CLOUDBASE_SQL_REGION: () => getServerEnv('CLOUDBASE_SQL_REGION', 'TENCENTCLOUD_REGION') || 'ap-guangzhou',

  // Cron 配置（服务端）
  CRON_SECRET: () => getServerEnv('CRON_SECRET'),
};
