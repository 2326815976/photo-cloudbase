import { NextRequest, NextResponse } from 'next/server';
import { uploadToCOS } from '@/lib/storage/cos-client';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = formData.get('folder') as 'albums' | 'gallery' | 'poses' | 'releases';
    const key = formData.get('key') as string;

    if (!file || !folder || !key) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    const url = await uploadToCOS(file, key, folder);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('上传失败:', error);
    return NextResponse.json(
      { error: '上传失败' },
      { status: 500 }
    );
  }
}
