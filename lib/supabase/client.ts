import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseUrlFromEnv, getSupabaseAnonKeyFromEnv } from "./env";

let supabaseInstance: ReturnType<typeof createBrowserClient> | null = null;

export function createClient() {
  if (typeof window === "undefined") {
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }

  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = getSupabaseUrlFromEnv();
  const supabaseKey = getSupabaseAnonKeyFromEnv();

  if (!supabaseUrl || !supabaseKey) {
    console.warn("Missing Supabase environment variables");
    return null as unknown as ReturnType<typeof createBrowserClient>;
  }

  supabaseInstance = createBrowserClient(supabaseUrl, supabaseKey);

  return supabaseInstance;
}
