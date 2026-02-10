// 声明 window 对象上的运行时配置
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

export function getSupabaseUrlFromEnv(): string {
  // 优先使用运行时配置（从 window 对象）
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.NEXT_PUBLIC_SUPABASE_URL) {
    console.log('[Supabase] 使用运行时配置:', window.__RUNTIME_CONFIG__.NEXT_PUBLIC_SUPABASE_URL);
    return window.__RUNTIME_CONFIG__.NEXT_PUBLIC_SUPABASE_URL;
  }
  // 降级到构建时环境变量
  const fallbackUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
  console.log('[Supabase] 使用构建时环境变量:', fallbackUrl);
  return fallbackUrl;
}

export function getSupabaseAnonKeyFromEnv(): string {
  // 优先使用运行时配置（从 window 对象）
  if (typeof window !== 'undefined' && window.__RUNTIME_CONFIG__?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return window.__RUNTIME_CONFIG__.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  }
  // 降级到构建时环境变量
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
}

export function getSupabaseServiceRoleKeyFromEnv(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}
