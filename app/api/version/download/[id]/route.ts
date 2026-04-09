import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/cloudbase/server';
import { getCloudBaseTempFileUrl, resolveCloudBaseFileId } from '@/lib/cloudbase/storage';
import { getReleaseByIdWithCompat } from '@/lib/releases/release-compat';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const releaseId = Number(id);
    if (!Number.isFinite(releaseId) || releaseId <= 0) {
      return NextResponse.json({ error: 'Invalid release id' }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: release, error } = await getReleaseByIdWithCompat(
      adminClient,
      releaseId,
      'Load release failed'
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!release || release.id <= 0) {
      return NextResponse.json({ error: 'Release not found' }, { status: 404 });
    }

    let downloadUrl = String(release.download_url ?? '').trim();
    const storageFileId = String(release.storage_file_id ?? '').trim();
    let effectiveFileId = storageFileId;

    if (!effectiveFileId && downloadUrl) {
      try {
        effectiveFileId = resolveCloudBaseFileId(downloadUrl) || '';
      } catch {
        effectiveFileId = '';
      }
    }

    if (effectiveFileId) {
      downloadUrl = await getCloudBaseTempFileUrl(effectiveFileId, 60 * 60);
    }

    if (!downloadUrl) {
      return NextResponse.json({ error: 'Download url unavailable' }, { status: 500 });
    }

    return NextResponse.redirect(downloadUrl, { status: 302 });
  } catch (error) {
    console.error('Get release download url failed:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Get download url failed' },
      { status: 500 }
    );
  }
}
