'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Package, Plus, Trash2, Download, Smartphone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Release {
  id: number;
  version: string;
  platform: string;
  download_url: string;
  update_log: string;
  created_at: string;
}

export default function ReleasesPage() {
  const [releases, setReleases] = useState<Release[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReleases();
  }, []);

  const loadReleases = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('app_releases')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setReleases(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个版本吗？')) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('app_releases')
      .delete()
      .eq('id', id);

    if (!error) {
      loadReleases();
    } else {
      alert('删除失败：' + error.message);
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
    };
    return colors[platform] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
            发布版本 📦
          </h1>
          <p className="text-sm text-[#5D4037]/60">管理应用安装包发布</p>
        </div>
        <button
          onClick={() => window.location.href = '/admin/releases/new'}
          className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
        >
          <Plus className="w-5 h-5" />
          发布版本
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
                className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center">
                      {getPlatformIcon(release.platform)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-[#5D4037]">版本 {release.version}</h3>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getPlatformColor(release.platform)}`}>
                          {release.platform}
                        </span>
                      </div>
                      <p className="text-xs text-[#5D4037]/60">
                        发布于 {new Date(release.created_at).toLocaleDateString('zh-CN')}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(release.id)}
                    className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {release.update_log && (
                  <div className="mb-4 p-3 bg-[#FFFBF0] rounded-xl">
                    <p className="text-sm text-[#5D4037]/80 whitespace-pre-wrap">{release.update_log}</p>
                  </div>
                )}

                <a
                  href={release.download_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
                >
                  <Download className="w-4 h-4" />
                  下载安装包
                </a>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
