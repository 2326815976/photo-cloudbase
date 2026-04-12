'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Download, AlertCircle } from 'lucide-react';
import Toast from '@/components/ui/Toast';

interface UpdateInfo {
  needUpdate: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  updateLog: string;
  platform: string;
}

interface UpdateDialogProps {
  currentVersion: string;
  platform?: string;
  onClose?: () => void;
}

export default function UpdateDialog({ currentVersion, platform = 'Android', onClose }: UpdateDialogProps) {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    checkForUpdates();

    // 统一管理事件监听
    const handleAppUpdate = (event: any) => {
      const { event: eventType, data } = event.detail;

      if (eventType === 'downloadStarted') {
        console.log('开始下载更新');
      } else if (eventType === 'installStarted') {
        console.log('开始安装更新');
        setDownloading(false);
      } else if (eventType === 'downloadError' || eventType === 'installError') {
        console.error('更新失败:', data);
        setDownloading(false);
        setToast({ message: '更新失败，请稍后重试', type: 'error' });
      }
    };

    window.addEventListener('appUpdate', handleAppUpdate);
    return () => window.removeEventListener('appUpdate', handleAppUpdate);
  }, []);

  const checkForUpdates = async () => {
    try {
      const response = await fetch(`/api/version/check?version=${currentVersion}&platform=${platform}`);
      const data = await response.json();

      if (data.needUpdate) {
        setUpdateInfo(data);
      } else {
        // 无需更新，关闭弹窗
        onClose?.();
      }
    } catch (error) {
      console.error('检查更新失败:', error);
      onClose?.();
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = () => {
    if (!updateInfo) return;

    setDownloading(true);

    // 检查是否在 Android WebView 中
    if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
      // 调用 Android 原生方法下载并安装
      (window as any).AndroidBridge.downloadAndInstallApk(
        updateInfo.downloadUrl,
        updateInfo.latestVersion
      );
    } else {
      // 非 Android 环境，直接下载
      window.open(updateInfo.downloadUrl, '_blank');
      setDownloading(false);
    }
  };

  const handleCancel = () => {
    if (updateInfo?.forceUpdate) {
      // 强制更新时，退出应用（如果在 WebView 中）
      if (typeof window !== 'undefined' && (window as any).AndroidBridge) {
        // 可以调用 Android 方法退出应用
        // (window as any).AndroidBridge.exitApp();
      }
    } else {
      // 可选更新，关闭弹窗
      onClose?.();
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 w-[90%] max-w-md">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-[#5D4037]/60">检查更新中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!updateInfo) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
        onClick={updateInfo.forceUpdate ? undefined : handleCancel}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: "spring", duration: 0.3 }}
          className="bg-white rounded-2xl p-6 w-full max-w-md relative"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 关闭按钮（仅在非强制更新时显示） */}
          {!updateInfo.forceUpdate && (
            <button
              onClick={handleCancel}
              className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
            >
              <X className="action-icon-svg" />
            </button>
          )}

          {/* 图标 */}
          <div className="text-center mb-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${
              updateInfo.forceUpdate
                ? 'bg-red-100'
                : 'bg-gradient-to-br from-[#FFC857] to-[#FFB347]'
            }`}>
              {updateInfo.forceUpdate ? (
                <AlertCircle className="w-8 h-8 text-red-600" />
              ) : (
                <Download className="w-8 h-8 text-[#5D4037]" />
              )}
            </div>

            {/* 标题 */}
            <h3 className="text-xl font-bold text-[#5D4037] mb-2">
              {updateInfo.forceUpdate ? '🔒 强制更新' : '发现新版本'}
            </h3>
            <p className="text-sm text-[#5D4037]/60">
              v{updateInfo.latestVersion}
            </p>
          </div>

          {/* 更新日志 */}
          <div className="mb-6 p-4 bg-[#FFFBF0] rounded-xl max-h-48 overflow-y-auto">
            <p className="text-sm text-[#5D4037]/80 whitespace-pre-wrap">
              {updateInfo.updateLog}
            </p>
          </div>

          {/* 强制更新提示 */}
          {updateInfo.forceUpdate && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-xs text-red-800 text-center">
                此版本为强制更新，必须更新后才能继续使用
              </p>
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3">
            {!updateInfo.forceUpdate && (
              <button
                onClick={handleCancel}
                disabled={downloading}
                className="flex-1 px-6 py-3 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full font-medium hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
              >
                稍后更新
              </button>
            )}
            <button
              onClick={handleUpdate}
              disabled={downloading}
              className={`px-6 py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50 ${
                updateInfo.forceUpdate ? 'w-full' : 'flex-1'
              }`}
            >
              {downloading ? '下载中...' : '立即更新'}
            </button>
          </div>
        </motion.div>
      </motion.div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </AnimatePresence>
  );
}
