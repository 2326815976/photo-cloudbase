import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { uploadFileToCloudBase } from '@/lib/cloudbase/storage';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const ALLOWED_FOLDERS = new Set(['albums', 'gallery', 'poses', 'releases']);
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_RELEASE_MIME_TYPES = [
  'application/vnd.android.package-archive',
  'application/octet-stream',
  'application/zip',
  'application/x-zip-compressed',
  'application/x-msdownload',
  'application/vnd.microsoft.portable-executable',
  'application/x-apple-diskimage',
  'application/x-debian-package',
  'application/x-rpm',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
];
const ALLOWED_RELEASE_EXTENSIONS = [
  '.apk',
  '.ipa',
  '.exe',
  '.dmg',
  '.zip',
  '.deb',
  '.rpm',
  '.appimage',
  '.tar.gz',
];

function isReleaseFileAllowed(file: File): boolean {
  const fileName = String(file.name ?? '').toLowerCase().trim();
  const contentType = String(file.type ?? '').toLowerCase().trim();

  const byExt = ALLOWED_RELEASE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
  if (byExt) {
    return true;
  }

  return ALLOWED_RELEASE_MIME_TYPES.includes(contentType);
}

export async function POST(request: NextRequest) {
  try {
    const dbClient = await createClient();
    const { data: authData } = await dbClient.auth.getUser();
    const user = authData?.user ?? null;

    if (!user) {
      return NextResponse.json(
        { error: '未授权：请先登录' },
        { status: 401 }
      );
    }

    let isAdmin = String((user as { role?: unknown }).role ?? '').trim() === 'admin';
    if (!isAdmin) {
      const { data: profile, error: profileError } = await dbClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();

      if (profileError) {
        return NextResponse.json(
          { error: '读取管理员信息失败' },
          { status: 500 }
        );
      }
      isAdmin = String((profile as { role?: unknown } | null)?.role ?? '').trim() === 'admin';
    }

    if (!isAdmin) {
      return NextResponse.json(
        { error: '未授权：需要管理员权限' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const folder = String(formData.get('folder') ?? '').trim().toLowerCase() as 'albums' | 'gallery' | 'poses' | 'releases';
    const key = formData.get('key') as string;

    if (!file || !folder || !key) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (!ALLOWED_FOLDERS.has(folder)) {
      return NextResponse.json(
        { error: `不支持的上传目录：${folder}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `文件大小超过限制（最大${MAX_FILE_SIZE / 1024 / 1024}MB）` },
        { status: 400 }
      );
    }

    if (folder === 'releases') {
      if (!isReleaseFileAllowed(file)) {
        return NextResponse.json(
          { error: `不支持的安装包格式：${file.name || file.type}` },
          { status: 400 }
        );
      }
    } else if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `不支持的文件类型：${file.type}` },
        { status: 400 }
      );
    }

    const uploadResult = await uploadFileToCloudBase(file, key, folder);
    return NextResponse.json({
      url: uploadResult.downloadUrl,
      fileId: uploadResult.fileId,
      path: uploadResult.cloudPath,
      provider: 'cloudbase',
    });
  } catch (error) {
    console.error('上传失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '上传失败' },
      { status: 500 }
    );
  }
}


