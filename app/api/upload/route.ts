import { NextRequest, NextResponse } from 'next/server';
import { uploadToCOS } from '@/lib/storage/cos-client';
import { createClient } from '@/lib/supabase/server';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_APK_TYPES = ['application/vnd.android.package-archive'];

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

    // 文件大小验证
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件大小超过限制（最大${MAX_FILE_SIZE / 1024 / 1024}MB）` },
        { status: 400 }
      );
    }

    // 文件类型验证
    const allowedTypes = folder === 'releases' ? ALLOWED_APK_TYPES : ALLOWED_IMAGE_TYPES;
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: `不支持的文件类型：${file.type}` },
        { status: 400 }
      );
    }

    const url = await uploadToCOS(file, key, folder);

    return NextResponse.json({ url });
  } catch (error) {
    console.error('上传失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}
