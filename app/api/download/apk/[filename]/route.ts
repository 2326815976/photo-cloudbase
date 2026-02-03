import { NextRequest, NextResponse } from 'next/server';

/**
 * APK下载代理API
 * 用途：代理腾讯云COS的APK文件下载，绕过COS的APK/IPA分发限制
 * 路径：/api/download/apk/[filename]
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params;

    // 验证文件名格式（防止路径遍历攻击）
    if (!filename || !/^[\w\-\.]+\.apk$/.test(filename)) {
      return NextResponse.json(
        { error: '无效的文件名' },
        { status: 400 }
      );
    }

    // 构建COS文件URL
    const cosUrl = `https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com/releases/${filename}`;

    // 从COS获取文件
    const response = await fetch(cosUrl);

    if (!response.ok) {
      return NextResponse.json(
        { error: '文件不存在' },
        { status: 404 }
      );
    }

    // 获取文件内容
    const fileBuffer = await response.arrayBuffer();

    // 返回APK文件
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.byteLength.toString(),
        'Cache-Control': 'public, max-age=31536000', // 缓存1年
      },
    });
  } catch (error) {
    console.error('APK下载失败:', error);
    return NextResponse.json(
      { error: '下载失败' },
      { status: 500 }
    );
  }
}
