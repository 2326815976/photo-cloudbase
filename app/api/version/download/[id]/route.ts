import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/cloudbase/server';
import { getCloudBaseTempFileUrl } from '@/lib/cloudbase/storage';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const releaseId = Number(id);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return NextResponse.json({ error: '版本 ID 非法' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: release, error } = await adminClient
      .from('app_releases')
      .select('id, download_url, storage_file_id')
      .eq('id', releaseId)
      .single();

    if (error || !release) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 });
    }

    let downloadUrl = String((release as any).download_url ?? '').trim();
    const storageFileId = String((release as any).storage_file_id ?? '').trim();

    if (storageFileId) {
      downloadUrl = await getCloudBaseTempFileUrl(storageFileId, 60 * 60);
    }

    if (!downloadUrl) {
      return NextResponse.json({ error: '下载地址不可用' }, { status: 500 });
    }

    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error) {
    console.error('获取安装包下载地址失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '获取下载地址失败' },
      { status: 500 }
    );
  }
}

