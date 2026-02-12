import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';

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
    const versionCompare = compareVersions(current.version, latest.version);
    if (versionCompare > 0) {
      return current;
    }
    if (versionCompare < 0) {
      return latest;
    }

    const currentTime = new Date(current.created_at).getTime();
    const latestTime = new Date(latest.created_at).getTime();
    return currentTime > latestTime ? current : latest;
  });
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const currentVersion = searchParams.get('version');
    const platform = searchParams.get('platform') || 'Android';

    if (!currentVersion) {
      return NextResponse.json(
        { error: '缺少版本号参数' },
        { status: 400 }
      );
    }

    const dbClient = await createClient();

    // 获取该平台的版本列表，再基于语义化版本比较选出真正最新版本。
    const { data: releases, error } = await dbClient
      .from('app_releases')
      .select('id, version, platform, download_url, storage_file_id, update_log, force_update, created_at')
      .eq('platform', platform)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error || !releases || releases.length === 0) {
      return NextResponse.json({
        needUpdate: false,
        message: '暂无可用更新'
      });
    }

    const latestRelease = pickLatestRelease(releases as ReleaseRow[]);
    if (!latestRelease) {
      return NextResponse.json({
        needUpdate: false,
        message: '暂无可用更新'
      });
    }

    // 比较版本号
    const needUpdate = compareVersions(latestRelease.version, currentVersion) > 0;

    if (!needUpdate) {
      return NextResponse.json({
        needUpdate: false,
        message: '当前已是最新版本'
      });
    }

    const downloadUrl = latestRelease.storage_file_id
      ? `${request.nextUrl.origin}/api/version/download/${latestRelease.id}`
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
    console.error('版本检查失败:', error);
    return NextResponse.json(
      { error: '版本检查失败' },
      { status: 500 }
    );
  }
}

/**
 * 比较版本号
 * @returns 1: v1 > v2, 0: v1 = v2, -1: v1 < v2
 */
function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);

  const maxLength = Math.max(parts1.length, parts2.length);

  for (let i = 0; i < maxLength; i++) {
    const num1 = parts1[i] || 0;
    const num2 = parts2[i] || 0;

    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}


