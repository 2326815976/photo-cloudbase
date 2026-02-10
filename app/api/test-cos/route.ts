import { NextResponse } from 'next/server';
import COS from 'cos-nodejs-sdk-v5';
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

    const secretId = process.env.COS_SECRET_ID;
    const secretKey = process.env.COS_SECRET_KEY;
    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;

    // 检查环境变量
    if (!secretId || !secretKey || !bucket || !region) {
      return NextResponse.json({
        error: '环境变量未配置',
        missing: {
          secretId: !secretId,
          secretKey: !secretKey,
          bucket: !bucket,
          region: !region,
        }
      }, { status: 500 });
    }

    // 测试 COS 连接
    const cos = new COS({
      SecretId: secretId,
      SecretKey: secretKey,
    });

    // 尝试列出存储桶内容（测试权限）
    await cos.getBucket({
      Bucket: bucket,
      Region: region,
      MaxKeys: 1,
    });

    return NextResponse.json({
      success: true,
      message: 'COS 连接成功',
      bucket: bucket,
      region: region,
      testResult: '权限验证通过',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      hint: error.code === 'SignatureDoesNotMatch'
        ? '签名错误：请检查 COS_SECRET_ID 和 COS_SECRET_KEY 是否正确'
        : error.code === 'NoSuchBucket'
        ? '存储桶不存在：请检查 COS_BUCKET 名称是否正确'
        : error.code === 'AccessDenied'
        ? '权限不足：请确认密钥有访问该存储桶的权限'
        : '未知错误：请查看错误详情',
    }, { status: 500 });
  }
}
