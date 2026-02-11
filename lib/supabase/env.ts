import { env } from '@/lib/env';

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
  return env.SUPABASE_URL();
}

export function getSupabaseAnonKeyFromEnv(): string {
  return env.SUPABASE_PUBLISHABLE_KEY();
}

export function getSupabaseServiceRoleKeyFromEnv(): string {
  return env.SUPABASE_SERVICE_ROLE_KEY();
}
