import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { resolveCloudBaseFileId } from '@/lib/cloudbase/storage';
import { toTimestampUTC8 } from '@/lib/utils/date-helpers';
import { compareReleaseVersions } from '@/lib/utils/release-version';
import { listReleasesWithCompat } from '@/lib/releases/release-compat';

interface ReleaseRow {
  id: number;
  version: string;
  platform: string;
  download_url: string;
  storage_file_id?: string | null;
  update_log: string;
  force_update: boolean;
  created_at: string;
}

function pickLatestRelease(releases: ReleaseRow[]): ReleaseRow | null {
  if (releases.length === 0) {
    return null;
  }

  return releases.reduce((latest, current) => {
    const versionCompare = compareReleaseVersions(current.version, latest.version);
    if (versionCompare > 0) {
      return current;
    }
    if (versionCompare < 0) {
      return latest;
    }

    const currentTime = toTimestampUTC8(current.created_at);
    const latestTime = toTimestampUTC8(latest.created_at);
    return currentTime > latestTime ? current : latest;
  });
}

function hasResolvableCloudBaseFileId(input: string): boolean {
  try {
    return Boolean(resolveCloudBaseFileId(input));
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const currentVersion = searchParams.get('version');
    const platform = searchParams.get('platform') || 'Android';

    if (!currentVersion) {
      return NextResponse.json(
        { error: 'Missing version parameter' },
        { status: 400 }
      );
    }

    const dbClient = await createClient();
    const { data: releases, error } = await listReleasesWithCompat(dbClient, {
      platform,
      limit: 100,
      fallbackMessage: 'Load releases failed',
    });

    if (error) {
      return NextResponse.json(
        { error: error.message || 'Version check failed' },
        { status: 500 }
      );
    }
    if (!releases || releases.length === 0) {
      return NextResponse.json({
        needUpdate: false,
        message: 'No updates available'
      });
    }

    const latestRelease = pickLatestRelease(releases as ReleaseRow[]);
    if (!latestRelease) {
      return NextResponse.json({
        needUpdate: false,
        message: 'No updates available'
      });
    }

    const needUpdate = compareReleaseVersions(latestRelease.version, currentVersion) > 0;
    if (!needUpdate) {
      return NextResponse.json({
        needUpdate: false,
        message: 'Already on latest version'
      });
    }

    const downloadUrl = (latestRelease.storage_file_id || hasResolvableCloudBaseFileId(latestRelease.download_url))
      ? request.nextUrl.origin + '/api/version/download/' + latestRelease.id
      : latestRelease.download_url;

    return NextResponse.json({
      needUpdate: true,
      forceUpdate: latestRelease.force_update || false,
      latestVersion: latestRelease.version,
      downloadUrl,
      updateLog: latestRelease.update_log,
      platform: latestRelease.platform
    });
  } catch (error) {
    console.error('Version check failed:', error);
    return NextResponse.json(
      { error: 'Version check failed' },
      { status: 500 }
    );
  }
}
