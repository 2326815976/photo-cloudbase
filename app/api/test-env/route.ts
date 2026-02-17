import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';

export async function GET() {
  // 统一以 NODE_ENV 判断：production 禁用测试端点
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return NextResponse.json(
      { error: '此端点在生产环境中已禁用' },
      { status: 404 }
    );
  }

  try {
    // 权限验证
    const dbClient = await createClient();
    const { data: { user } } = await dbClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: '未授权：请先登录' },
        { status: 401 }
      );
    }

    // 检查管理员权限
    const { data: profile } = await dbClient
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
      CLOUDBASE_ID: process.env.CLOUDBASE_ID || 'undefined',
      CLOUDBASE_SECRET_ID: process.env.CLOUDBASE_SECRET_ID ? '已设置' : 'undefined',
      CLOUDBASE_SECRET_KEY: process.env.CLOUDBASE_SECRET_KEY ? '已设置' : 'undefined',
      CLOUDBASE_BUCKET_ID: process.env.CLOUDBASE_BUCKET_ID || 'undefined',
      CLOUDBASE_STORAGE_DOMAIN: process.env.CLOUDBASE_STORAGE_DOMAIN || 'undefined',
      NODE_ENV: process.env.NODE_ENV,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '系统错误' },
      { status: 500 }
    );
  }
}


