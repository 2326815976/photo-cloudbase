import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

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
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    const supabaseAdmin = createAdminClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 删除用户（会级联删除 profiles 表中的数据）
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error('删除用户失败:', error);
      return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('删除账户异常:', err);
    return NextResponse.json({ error: '系统错误' }, { status: 500 });
  }
}
