'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/cloudbase/client';
import { Package, Plus, Trash2, Download, Smartphone, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDateDisplayUTC8 } from '@/lib/utils/date-helpers';

interface Release {
  id: number;
  version: string;
  platform: string;
  download_url: string;
  storage_provider?: 'cloudbase';
  storage_file_id?: string | null;
  update_log: string;
  force_update: boolean;
  created_at: string;
}

export default function ReleasesPage() {
  const router = useRouter();
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingRelease, setDeletingRelease] = useState<Release | null>(null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadReleases();
  }, []);

  const loadReleases = async () => {
    setLoading(true);
    const dbClient = createClient();

    if (!dbClient) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await dbClient
      .from('app_releases')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setReleases(data);
    } else if (error) {
      setShowToast({ message: `加载失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    const release = releases.find(r => r.id === id);
    if (release) {
      setDeletingRelease(release);
    }
  };

  const confirmDelete = async () => {
    if (!deletingRelease) return;

    setActionLoading(true);
    try {
      const response = await fetch(`/api/admin/releases/${deletingRelease.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload?.error || '删除失败');
      }

      setDeletingRelease(null);
      await loadReleases();
      const warningMessage = String(payload?.warning ?? '').trim();
      if (warningMessage) {
        setShowToast({ message: warningMessage, type: 'warning' });
      } else {
        setShowToast({ message: '版本已删除', type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error) {
      setShowToast({
        message: error instanceof Error ? `删除失败：${error.message}` : '删除失败',
        type: 'error',
      });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const getPlatformIcon = (platform: string) => {
    return <Smartphone className="w-5 h-5" />;
  };

  const getPlatformColor = (platform: string) => {
    const colors: Record<string, string> = {
      'Android': 'bg-green-100 text-green-800',
      'iOS': 'bg-blue-100 text-blue-800',
      'HarmonyOS': 'bg-red-100 text-red-800',
      'Windows': 'bg-cyan-100 text-cyan-800',
      'MacOS': 'bg-purple-100 text-purple-800',
      'Linux': 'bg-orange-100 text-orange-800',
    };
    return colors[platform] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            发布版本 📦
          </h1>
          <p className="text-sm text-[#5D4037]/60">管理应用安装包发布</p>
        </div>
        <button
          onClick={() => router.push('/admin/releases/new')}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          <span className="hidden sm:inline">发布版本</span>
          <span className="sm:hidden">发布</span>
        </button>
      </div>

      {/* 版本列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      ) : releases.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <Package className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无发布版本</p>
        </div>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {releases.map((release) => (
              <motion.div
                key={release.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div className="flex items-center gap-3 flex-1">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center flex-shrink-0">
                      {getPlatformIcon(release.platform)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <h3 className="font-bold text-[#5D4037]">版本 {release.version}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPlatformColor(release.platform)}`}>
                          {release.platform}
                        </span>
                        {release.force_update && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800 flex items-center gap-1">
                            🔒 强制更新
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#5D4037]/60">
                        发布于 {formatDateDisplayUTC8(release.created_at)}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(release.id)}
                    className="p-3 text-red-600 hover:bg-red-50 rounded-full transition-colors self-end sm:self-start active:scale-95"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>

                {release.update_log && (
                  <div className="mb-4 p-3 bg-[#FFFBF0] rounded-xl">
                    <p className="text-sm text-[#5D4037]/80 whitespace-pre-wrap">{release.update_log}</p>
                  </div>
                )}

                <a
                  href={`/api/version/download/${release.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
                >
                  <Download className="w-5 h-5" />
                  下载安装包
                </a>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 删除确认对话框 */}
      <AnimatePresence>
        {deletingRelease && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingRelease(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除版本</h3>
                <p className="text-sm text-[#5D4037]/80">
                  确定要删除版本 <span className="font-bold">{deletingRelease.version}</span> ({deletingRelease.platform}) 吗？
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingRelease(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast通知 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-lg backdrop-blur-sm ${
              showToast.type === 'success'
                ? 'bg-green-500/95 text-white'
                : showToast.type === 'warning'
                ? 'bg-orange-500/95 text-white'
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : showToast.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="font-medium">{showToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


