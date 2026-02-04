// 修改后的 VersionChecker 组件，支持 Android 原生下载和安装

'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, Download, X } from 'lucide-react';

interface UpdateInfo {
  needUpdate: boolean;
  forceUpdate: boolean;
  latestVersion: string;
  downloadUrl: string;
  updateLog: string;
  platform: string;
}

// 声明 Android Bridge 接口
declare global {
  interface Window {
    AndroidBridge?: {
      downloadAndInstallApk: (url: string, version: string) => void;
    };
  }
}

export default function VersionChecker() {
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    checkVersion();

    // 监听 Android 端的下载事件
    const handleAppUpdate = (event: any) => {
      const { event: eventType, data } = event.detail;

      switch (eventType) {
        case 'downloadStarted':
          setDownloading(true);
          setDownloadProgress(0);
          setToast({ message: '开始下载新版本...', type: 'success' });
          break;
        case 'downloadProgress':
          setDownloadProgress(data.progress || 0);
          break;
        case 'installStarted':
          setDownloadProgress(100);
          setToast({ message: '下载完成！正在打开安装界面...', type: 'success' });
          break;
        case 'downloadError':
        case 'installError':
          setToast({ message: '更新失败：' + (data.error || '未知错误'), type: 'error' });
          setDownloading(false);
          setDownloadProgress(0);
          break;
      }
    };

    window.addEventListener('appUpdate', handleAppUpdate);
    return () => window.removeEventListener('appUpdate', handleAppUpdate);
  }, []);

  const checkVersion = async () => {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const currentVersion = urlParams.get('app_version') || urlParams.get('version');
      const platform = urlParams.get('platform') || 'Android';

      if (!currentVersion) {
        return;
      }

      // 添加超时控制
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(`/api/version/check?version=${currentVersion}&platform=${platform}`, {
          signal: controller.signal
        });
        clearTimeout(timeoutId);
        const data = await response.json();

        if (data.needUpdate) {
          setUpdateInfo(data);
          setShowModal(true);
        }
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        if (fetchError.name === 'AbortError') {
          console.error('版本检查超时');
          // 超时后重试一次
          setTimeout(() => checkVersion(), 5000);
        } else {
          throw fetchError;
        }
      }
    } catch (error) {
      console.error('版本检查失败:', error);
    }
  };

  const handleUpdate = () => {
    if (!updateInfo?.downloadUrl) return;

    // 检查是否有 Android Bridge
    if (window.AndroidBridge && updateInfo.platform === 'Android' && updateInfo.downloadUrl.endsWith('.apk')) {
      // 使用 Android 原生下载和安装
      window.AndroidBridge.downloadAndInstallApk(updateInfo.downloadUrl, updateInfo.latestVersion);
    } else {
      // 降级方案：直接跳转下载链接
      window.location.href = updateInfo.downloadUrl;
    }
  };

  const handleClose = () => {
    if (!updateInfo?.forceUpdate) {
      setShowModal(false);
    }
  };

  if (!showModal || !updateInfo) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        >
          {!updateInfo.forceUpdate && !downloading && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-2 hover:bg-gray-100 rounded-full transition-colors z-10"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          )}

          <div className="bg-gradient-to-br from-[#FFC857] to-[#FFB347] p-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full mb-4">
              {updateInfo.forceUpdate ? (
                <AlertCircle className="w-8 h-8 text-white" />
              ) : (
                <Download className="w-8 h-8 text-white" />
              )}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {updateInfo.forceUpdate ? '发现重要更新 🔒' : '发现新版本 ✨'}
            </h2>
            <p className="text-white/90 text-sm">
              {updateInfo.forceUpdate
                ? '此更新包含重要修复，需要立即更新'
                : '新版本已发布，建议您更新体验'}
            </p>
          </div>

          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
              <span className="text-sm text-gray-600">最新版本</span>
              <span className="text-lg font-bold text-[#5D4037]">{updateInfo.latestVersion}</span>
            </div>

            {updateInfo.updateLog && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-gray-700">更新内容</h3>
                <div className="p-4 bg-gray-50 rounded-xl max-h-48 overflow-y-auto">
                  <p className="text-sm text-gray-600 whitespace-pre-wrap">{updateInfo.updateLog}</p>
                </div>
              </div>
            )}

            {updateInfo.forceUpdate && (
              <div className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-800 mb-1">必须更新</p>
                  <p className="text-xs text-red-600">
                    此版本包含重要的安全修复和功能改进，必须更新后才能继续使用应用
                  </p>
                </div>
              </div>
            )}

            <div className="flex gap-3">
              {!updateInfo.forceUpdate && !downloading && (
                <button
                  onClick={handleClose}
                  className="flex-1 px-6 py-3 border-2 border-gray-200 text-gray-700 rounded-full font-medium hover:bg-gray-50 transition-colors"
                >
                  稍后更新
                </button>
              )}
              <button
                onClick={handleUpdate}
                disabled={downloading}
                className={`${updateInfo.forceUpdate || downloading ? 'w-full' : 'flex-1'} px-6 py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-lg transition-shadow flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {downloading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-[#5D4037] border-t-transparent rounded-full animate-spin" />
                    下载中 {downloadProgress}%
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    立即更新
                  </>
                )}
              </button>
            </div>

            {downloading && (
              <div className="space-y-2">
                <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[#FFC857] to-[#FFB347] transition-all duration-300"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <p className="text-xs text-center text-gray-500">
                  正在下载安装包，请稍候...
                </p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Toast 提示 - 参考下载原图的实现 */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 right-6 z-[10000]"
        >
          <div className={`px-6 py-3 rounded-full shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}>
            {toast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
