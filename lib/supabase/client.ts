import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrlFromEnv, getSupabaseAnonKeyFromEnv } from "./env";

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient(): ReturnType<typeof createBrowserClient> | null {
  if (typeof window === "undefined") {
    console.warn("Supabase client cannot be created on server side");
    return null;
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = getSupabaseUrlFromEnv();
  const supabaseKey = getSupabaseAnonKeyFromEnv();

  if (!supabaseUrl || !supabaseKey) {
    console.error("Missing Supabase environment variables: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    return null;
  }

  supabaseInstance = createBrowserClient(supabaseUrl, supabaseKey, {
    auth: {
      persistSession: false,  // 禁用会话持久化，避免认证错误
      autoRefreshToken: false, // 禁用自动刷新令牌
      detectSessionInUrl: false // 禁用 URL 中的会话检测
    }
  });

  return supabaseInstance;
}
