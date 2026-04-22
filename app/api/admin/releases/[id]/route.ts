import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { createAdminClient } from '@/lib/cloudbase/server';
import { deleteCloudBaseFiles, deleteCloudBaseObjects } from '@/lib/cloudbase/storage';
import { getReleaseByIdWithCompat } from '@/lib/releases/release-compat';

export const dynamic = 'force-dynamic';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const releaseId = Number(id);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return NextResponse.json({ error: 'Invalid release id' }, { status: 400 });
    }

    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }
    const dbClient = createAdminClient();

    const authUser = { user: { id: adminCheck.userId } };
    if (!authUser?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const profile = { role: 'admin' };

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Admin role required' }, { status: 403 });
    }

    const { data: release, error: fetchError } = await getReleaseByIdWithCompat(
      dbClient,
      releaseId,
      'Load release failed'
    );

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!release || release.id <= 0) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    }

    const storageFileId = String(release.storage_file_id || '').trim();
    const downloadUrl = String(release.download_url || '').trim();

    const { data: deletedRelease, error: deleteError } = await dbClient
      .from('app_releases')
      .delete()
      .eq('id', releaseId)
      .select('id')
      .maybeSingle();

    if (deleteError) {
      return NextResponse.json({ error: 'Delete release failed: ' + deleteError.message }, { status: 500 });
    }
    if (!deletedRelease) {
      return NextResponse.json({ error: 'Release was removed already, please refresh and retry' }, { status: 409 });
    }

    const { data: remainingRelease, error: verifyError } = await dbClient
      .from('app_releases')
      .select('id')
      .eq('id', releaseId)
      .maybeSingle();

    if (verifyError) {
      return NextResponse.json({ error: 'Delete verification failed: ' + verifyError.message }, { status: 500 });
    }
    if (remainingRelease) {
      return NextResponse.json({ error: 'Delete release failed, please retry later' }, { status: 500 });
    }

    let storageCleanupFailed = false;
    let warning: string | null = null;

    try {
      if (storageFileId) {
        await deleteCloudBaseFiles([storageFileId]);
      } else if (downloadUrl) {
        await deleteCloudBaseObjects([downloadUrl]);
      }
    } catch (error) {
      storageCleanupFailed = true;
      warning = 'Release row deleted, but storage cleanup failed: ' + (error instanceof Error ? error.message : 'unknown error');
      console.error('Delete release storage cleanup failed:', error);
    }

    return NextResponse.json({
      success: true,
      storageCleanupFailed,
      warning,
    });
  } catch (error) {
    console.error('Delete release failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Delete release failed' },
      { status: 500 }
    );
  }
}
