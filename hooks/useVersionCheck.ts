import { useState, useEffect } from 'react';

interface UpdateInfo {
  needUpdate: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  updateLog: string;
  platform: string;
}

interface UseVersionCheckOptions {
  currentVersion: string;
  platform?: string;
  autoCheck?: boolean;
  checkInterval?: number; // 自动检查间隔（毫秒）
}

/**
 * 版本检查 Hook
 *
 * @example
 * ```tsx
 * const { updateInfo, checkUpdate, loading } = useVersionCheck({
 *   currentVersion: '1.0.0',
 *   platform: 'Android',
 *   autoCheck: true,
 *   checkInterval: 3600000 // 每小时检查一次
 * });
 *
 * if (updateInfo) {
 *   return <UpdateDialog updateInfo={updateInfo} />;
 * }
 * ```
 */
export function useVersionCheck({
  currentVersion,
  platform = 'Android',
  autoCheck = false,
  checkInterval = 3600000, // 默认1小时
}: UseVersionCheckOptions) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkUpdate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/version/check?version=${currentVersion}&platform=${platform}`
      );

      if (!response.ok) {
        throw new Error('检查更新失败');
      }

      const data = await response.json();

      if (data.needUpdate) {
        setUpdateInfo(data);
      } else {
        setUpdateInfo(null);
      }
    } catch (err) {
      console.error('版本检查失败:', err);
      setError(err instanceof Error ? err.message : '检查更新失败');
      setUpdateInfo(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoCheck) {
      // 立即检查一次
      checkUpdate();

      // 设置定时检查
      const interval = setInterval(checkUpdate, checkInterval);

      return () => clearInterval(interval);
    }
  }, [currentVersion, platform, autoCheck, checkInterval]);

  return {
    updateInfo,
    loading,
    error,
    checkUpdate,
  };
}
