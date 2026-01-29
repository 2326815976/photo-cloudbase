export function getSupabaseUrlFromEnv(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
}

export function getSupabaseAnonKeyFromEnv(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
}

export function getSupabaseServiceRoleKeyFromEnv(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}
