'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Camera, Plus, Trash2, Tag, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Pose {
  id: number;
  image_url: string;
  storage_path: string;
  tags: string[];
  view_count: number;
  created_at: string;
}

export default function PosesPage() {
  const [poses, setPoses] = useState<Pose[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTag, setSearchTag] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    loadPoses();
  }, [page, searchTag]);

  const loadPoses = async () => {
    setLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('poses')
      .select('*')
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (searchTag) {
      query = query.contains('tags', [searchTag]);
    }

    const { data, error } = await query;

    if (!error && data) {
      setPoses(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个摆姿吗？')) return;

    const supabase = createClient();
    const { error } = await supabase.from('poses').delete().eq('id', id);

    if (!error) {
      loadPoses();
    } else {
      alert('删除失败：' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
            摆姿管理 📸
          </h1>
          <p className="text-sm text-[#5D4037]/60">管理拍照姿势库</p>
        </div>
        <button
          onClick={() => window.location.href = '/admin/poses/new'}
          className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
        >
          <Plus className="w-5 h-5" />
          新增摆姿
        </button>
      </div>

      {/* 搜索栏 */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-[#5D4037]/10">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="text"
              placeholder="按标签搜索..."
              value={searchTag}
              onChange={(e) => setSearchTag(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-full border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* 摆姿列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      ) : poses.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <Camera className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无摆姿数据</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          <AnimatePresence>
            {poses.map((pose) => (
              <motion.div
                key={pose.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
              >
                <div className="aspect-square relative">
                  <img
                    src={pose.image_url}
                    alt="摆姿"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleDelete(pose.id)}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3">
                  <div className="flex items-center gap-1 text-xs text-[#5D4037]/60 mb-2">
                    <Camera className="w-3 h-3" />
                    <span>浏览 {pose.view_count}</span>
                  </div>
                  {pose.tags && pose.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {pose.tags.map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-1 bg-[#FFC857]/20 text-[#5D4037] text-xs rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 分页 */}
      {!loading && poses.length > 0 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            上一页
          </button>
          <span className="px-4 py-2 bg-[#FFC857]/20 rounded-full text-[#5D4037] font-medium">
            第 {page} 页
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={poses.length < pageSize}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
