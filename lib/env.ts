// 统一的环境变量访问工具
// 支持运行时配置（CloudBase）和构建时配置（本地开发）

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: {
      NEXT_PUBLIC_APP_URL?: string;
      NEXT_PUBLIC_SUPABASE_URL?: string;
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
      NEXT_PUBLIC_AMAP_KEY?: string;
      NEXT_PUBLIC_AMAP_SECURITY_CODE?: string;
      NEXT_PUBLIC_TURNSTILE_SITE_KEY?: string;
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

// 导出所有环境变量访问函数
export const env = {
  // 应用配置
  APP_URL: () => getEnv('APP_URL'),

  // Supabase 配置
  SUPABASE_URL: () => getEnv('SUPABASE_URL'),
  SUPABASE_PUBLISHABLE_KEY: () => getEnv('SUPABASE_PUBLISHABLE_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: () => process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  // 高德地图配置
  AMAP_KEY: () => getEnv('AMAP_KEY'),
  AMAP_SECURITY_CODE: () => getEnv('AMAP_SECURITY_CODE'),

  // Cloudflare Turnstile 配置
  TURNSTILE_SITE_KEY: () => getEnv('TURNSTILE_SITE_KEY'),
  TURNSTILE_SECRET_KEY: () => process.env.TURNSTILE_SECRET_KEY || '',

  // 腾讯云 COS 配置（仅服务端）
  COS_SECRET_ID: () => process.env.COS_SECRET_ID || '',
  COS_SECRET_KEY: () => process.env.COS_SECRET_KEY || '',
  COS_BUCKET: () => process.env.COS_BUCKET || '',
  COS_REGION: () => process.env.COS_REGION || '',
  COS_CDN_DOMAIN: () => process.env.COS_CDN_DOMAIN || '',

  // Cron 配置（仅服务端）
  CRON_SECRET: () => process.env.CRON_SECRET || '',
};
