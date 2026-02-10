import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  // 生产环境禁用测试端点
  if (process.env.NODE_ENV === 'production' && !process.env.ENABLE_TEST_ENDPOINTS) {
    return NextResponse.json(
      { error: '此端点在生产环境中已禁用' },
      { status: 404 }
    );
  }

  try {
    // 权限验证
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: '未授权：请先登录' },
        { status: 401 }
      );
    }

    // 检查管理员权限
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: '未授权：需要管理员权限' },
        { status: 403 }
      );
    }

    // 查询摆姿数据
    const { data: poses, error: posesError, count } = await supabase
      .from('poses')
      .select('*', { count: 'exact' })
      .limit(5);

    // 查询标签数据
    const { data: tags, error: tagsError } = await supabase
      .from('pose_tags')
      .select('*')
      .limit(5);

    return NextResponse.json({
      success: true,
      posesCount: count,
      poses: poses || [],
      posesError: posesError?.message,
      tags: tags || [],
      tagsError: tagsError?.message,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
