import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import * as STS from 'qcloud-cos-sts';

export async function POST(request: NextRequest) {
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

    const { folder } = await request.json();

    if (!folder || !['albums', 'gallery', 'poses', 'releases'].includes(folder)) {
      return NextResponse.json(
        { error: '无效的文件夹参数' },
        { status: 400 }
      );
    }

    const secretId = process.env.COS_SECRET_ID;
    const secretKey = process.env.COS_SECRET_KEY;
    const bucket = process.env.COS_BUCKET;
    const region = process.env.COS_REGION;

    if (!secretId || !secretKey || !bucket || !region) {
      return NextResponse.json(
        { error: 'COS配置不完整' },
        { status: 500 }
      );
    }

    // 生成临时密钥
    const credentials = await new Promise((resolve, reject) => {
      STS.getCredential({
        secretId,
        secretKey,
        durationSeconds: 1800, // 30分钟有效期
        policy: {
          version: '2.0',
          statement: [{
            action: [
              'name/cos:PutObject',
              'name/cos:PostObject',
              'name/cos:InitiateMultipartUpload',
              'name/cos:UploadPart',
              'name/cos:CompleteMultipartUpload'
            ],
            effect: 'allow',
            resource: [
              `qcs::cos:${region}:uid/1386452208:${bucket}/${folder}/*`
            ]
          }]
        }
      }, (err: any, data: any) => {
        if (err) {
          console.error('STS credential generation error:', err);
          reject(new Error(`Failed to get STS credentials: ${err.message || JSON.stringify(err)}`));
        } else {
          resolve(data);
        }
      });
    });

    return NextResponse.json({
      stsData: credentials,
      bucket,
      region,
      cdnDomain: process.env.COS_CDN_DOMAIN
    });
  } catch (error) {
    console.error('生成临时密钥失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '生成临时密钥失败' },
      { status: 500 }
    );
  }
}
