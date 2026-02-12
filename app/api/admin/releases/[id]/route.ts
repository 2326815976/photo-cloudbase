import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { deleteCloudBaseFiles, deleteCloudBaseObjects } from '@/lib/cloudbase/storage';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const releaseId = Number(id);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return NextResponse.json({ error: '版本 ID 非法' }, { status: 400 });
    }

    const dbClient = await createClient();

    const { data: authUser } = await dbClient.auth.getUser();
    if (!authUser?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { data: profile } = await dbClient
      .from('profiles')
      .select('role')
      .eq('id', authUser.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { data: release, error: fetchError } = await dbClient
      .from('app_releases')
      .select('id, download_url, storage_file_id')
      .eq('id', releaseId)
      .single();

    if (fetchError || !release) {
      return NextResponse.json({ error: '版本不存在' }, { status: 404 });
    }

    const storageFileId = String((release as any).storage_file_id ?? '').trim();
    const downloadUrl = String((release as any).download_url ?? '').trim();

    if (storageFileId) {
      await deleteCloudBaseFiles([storageFileId]);
    } else if (downloadUrl) {
      await deleteCloudBaseObjects([downloadUrl]);
    }

    const { error: deleteError } = await dbClient
      .from('app_releases')
      .delete()
      .eq('id', releaseId);

    if (deleteError) {
      return NextResponse.json({ error: `删除版本记录失败：${deleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除版本失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除版本失败' },
      { status: 500 }
    );
  }
}

