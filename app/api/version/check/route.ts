import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    const supabase = await createClient();

    // 获取该平台的最新版本
    const { data: latestRelease, error } = await supabase
      .from('app_releases')
      .select('*')
      .eq('platform', platform)
      .order('version', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !latestRelease) {
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

    return NextResponse.json({
      needUpdate: true,
      forceUpdate: latestRelease.force_update || false,
      latestVersion: latestRelease.version,
      downloadUrl: latestRelease.download_url,
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
