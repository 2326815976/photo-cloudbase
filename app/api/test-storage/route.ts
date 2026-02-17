import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { getCloudBaseApp } from '@/lib/cloudbase/sdk';

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

    // 校验 CloudBase SDK 初始化与基础权限
    const app = getCloudBaseApp();
    await app.getUploadMetadata();

    return NextResponse.json({
      success: true,
      message: 'CloudBase 存储连接成功',
      testResult: '权限验证通过',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      hint: '请检查 CLOUDBASE_ID、CLOUDBASE_SECRET_ID、CLOUDBASE_SECRET_KEY、CLOUDBASE_BUCKET_ID',
    }, { status: 500 });
  }
}


