'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { FolderHeart, Plus, Trash2, Key, Link as LinkIcon, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Album {
  id: string;
  access_key: string;
  title: string;
  cover_url: string;
  welcome_letter: string;
  enable_tipping: boolean;
  created_at: string;
}

export default function AlbumsPage() {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('albums')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setAlbums(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个专属空间吗？所有照片和数据都将被删除！')) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('albums')
      .delete()
      .eq('id', id);

    if (!error) {
      loadAlbums();
    } else {
      alert('删除失败：' + error.message);
    }
  };

  const copyAccessLink = (accessKey: string) => {
    const link = `${window.location.origin}/album/${accessKey}`;
    navigator.clipboard.writeText(link);
    alert('访问链接已复制到剪贴板！');
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
            专属空间管理 💝
          </h1>
          <p className="text-sm text-[#5D4037]/60">管理专属返图空间</p>
        </div>
        <button
          onClick={() => window.location.href = '/admin/albums/new'}
          className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
        >
          <Plus className="w-5 h-5" />
          创建空间
        </button>
      </div>

      {/* 专属空间列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      ) : albums.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <FolderHeart className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无专属空间</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-6">
          <AnimatePresence>
            {albums.map((album) => (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
              >
                {album.cover_url && (
                  <div className="aspect-video relative">
                    <img
                      src={album.cover_url}
                      alt={album.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-bold text-[#5D4037] mb-2">{album.title || '未命名空间'}</h3>

                  <div className="flex items-center gap-2 mb-3 p-2 bg-[#FFFBF0] rounded-lg">
                    <Key className="w-4 h-4 text-[#FFC857]" />
                    <code className="text-xs text-[#5D4037] font-mono">{album.access_key}</code>
                  </div>

                  {album.welcome_letter && (
                    <p className="text-xs text-[#5D4037]/60 mb-3 line-clamp-2">
                      {album.welcome_letter}
                    </p>
                  )}

                  <div className="flex gap-2">
                    <button
                      onClick={() => copyAccessLink(album.access_key)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#FFC857]/20 text-[#5D4037] rounded-full text-xs hover:bg-[#FFC857]/30 transition-colors"
                    >
                      <LinkIcon className="w-3 h-3" />
                      复制链接
                    </button>
                    <button
                      onClick={() => handleDelete(album.id)}
                      className="flex items-center justify-center gap-1 px-3 py-2 bg-red-50 text-red-600 rounded-full text-xs hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                      删除
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
