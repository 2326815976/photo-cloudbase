import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { getSupabaseUrlFromEnv, getSupabaseServiceRoleKeyFromEnv } from '@/lib/supabase/env';

export async function POST() {
  try {
    // 获取当前用户session
    const supabase = await createClient();
    const { data: authUser, error: authError } = await supabase.auth.getUser();

    if (authError || !authUser?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = authUser.user.id;

    // 使用 service role key 删除用户
    const supabaseUrl = getSupabaseUrlFromEnv();
    const supabaseServiceRoleKey = getSupabaseServiceRoleKeyFromEnv();

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing Supabase environment variables for admin operations');
      return NextResponse.json({ error: '系统配置错误' }, { status: 500 });
    }

    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 删除用户（会级联删除 profiles 表中的数据）
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Failed to delete user:', error);
      return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete account error:', err);
    return NextResponse.json({ error: '系统错误' }, { status: 500 });
  }
}
