'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Image, Trash2, Tag, Search, Heart, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Photo {
  id: string;
  url: string;
  width: number;
  height: number;
  is_public: boolean;
  like_count: number;
  view_count: number;
  created_at: string;
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    loadPhotos();
  }, [page]);

  const loadPhotos = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('album_photos')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (!error && data) {
      setPhotos(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这张照片吗？删除后将从照片墙移除。')) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('album_photos')
      .delete()
      .eq('id', id);

    if (!error) {
      loadPhotos();
    } else {
      alert('删除失败：' + error.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
          照片墙管理 🖼️
        </h1>
        <p className="text-sm text-[#5D4037]/60">管理公开展示的照片</p>
      </div>

      {/* 照片列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <Image className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无公开照片</p>
        </div>
      ) : (
        <div className="grid grid-cols-4 gap-6">
          <AnimatePresence>
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
              >
                <div className="aspect-square relative">
                  <img
                    src={photo.url}
                    alt="照片"
                    className="w-full h-full object-cover"
                  />
                  <button
                    onClick={() => handleDelete(photo.id)}
                    className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between text-xs text-[#5D4037]/60">
                    <div className="flex items-center gap-1">
                      <Heart className="w-3 h-3" />
                      <span>{photo.like_count}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3" />
                      <span>{photo.view_count}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 分页 */}
      {!loading && photos.length > 0 && (
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
            disabled={photos.length < pageSize}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}
