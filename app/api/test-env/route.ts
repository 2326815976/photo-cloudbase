import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
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

    return NextResponse.json({
      COS_BUCKET: process.env.COS_BUCKET || 'undefined',
      COS_REGION: process.env.COS_REGION || 'undefined',
      COS_CDN_DOMAIN: process.env.COS_CDN_DOMAIN || 'undefined',
      COS_SECRET_ID: process.env.COS_SECRET_ID ? '已设置' : 'undefined',
      COS_SECRET_KEY: process.env.COS_SECRET_KEY ? '已设置' : 'undefined',
      NODE_ENV: process.env.NODE_ENV,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '系统错误' },
      { status: 500 }
    );
  }
}
