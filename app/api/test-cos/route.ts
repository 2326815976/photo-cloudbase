import { NextResponse } from 'next/server';
import COS from 'cos-nodejs-sdk-v5';

export async function GET() {
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
  try {
    const cos = new COS({
      SecretId: secretId,
      SecretKey: secretKey,
    });

    // 尝试列出存储桶内容（测试权限）
    const result = await cos.getBucket({
      Bucket: bucket,
      Region: region,
      MaxKeys: 1,
    });

    return NextResponse.json({
      success: true,
      message: 'COS 连接成功',
      bucket: bucket,
      region: region,
      secretIdPrefix: secretId.substring(0, 10) + '...',
      testResult: '权限验证通过',
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      code: error.code,
      statusCode: error.statusCode,
      bucket: bucket,
      region: region,
      secretIdPrefix: secretId.substring(0, 10) + '...',
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
