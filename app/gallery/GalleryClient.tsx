'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Photo {
  id: string;
  storage_path: string;
  width: number;
  height: number;
  blurhash?: string;
  like_count: number;
  view_count: number;
  is_liked: boolean;
  created_at: string;
}

interface GalleryClientProps {
  initialPhotos: Photo[];
  initialTotal: number;
  initialPage: number;
}

export default function GalleryClient({ initialPhotos, initialTotal, initialPage }: GalleryClientProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [loading, setLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [page, setPage] = useState(initialPage);
  const [total, setTotal] = useState(initialTotal);
  const pageSize = 20;

  useEffect(() => {
    if (page !== initialPage) {
      loadPhotos();
    }
  }, [page]);

  const loadPhotos = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase.rpc('get_public_gallery', {
      page_no: page,
      page_size: pageSize
    });

    if (!error && data) {
      setPhotos(data.photos || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
  };

  const handleLike = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      alert('请先登录后再点赞');
      return;
    }

    const { data, error } = await supabase.rpc('like_photo', {
      p_photo_id: photoId
    });

    if (!error && data) {
      setPhotos(prev => prev.map(photo => {
        if (photo.id === photoId) {
          return {
            ...photo,
            is_liked: data.liked,
            like_count: data.liked ? photo.like_count + 1 : photo.like_count - 1
          };
        }
        return photo;
      }));
    }
  };

  const handlePreview = async (photo: Photo) => {
    setPreviewPhoto(photo);

    // 增加浏览量
    const supabase = createClient();
    await supabase.rpc('increment_photo_view', {
      p_photo_id: photo.id
    });

    // 更新本地浏览量
    setPhotos(prev => prev.map(p =>
      p.id === photo.id ? { ...p, view_count: p.view_count + 1 } : p
    ));
  };

  const getSignedUrl = async (path: string) => {
    const supabase = createClient();
    const { data } = await supabase.storage
      .from('albums')
      .createSignedUrl(path, 3600);
    return data?.signedUrl || path;
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>照片墙</h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">📸 贩卖人间路过的温柔 📸</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-20">
        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-[#5D4037]/60">加载中...</p>
          </div>
        ) : photos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5D4037]/60">暂无照片</p>
          </div>
        ) : (
          <>
            {/* 双列瀑布流布局 */}
            <div className="columns-2 gap-2">
              {photos.map((photo, index) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="break-inside-avoid mb-2"
                >
                  {/* 小红书风格卡片 */}
                  <div className="bg-white rounded-xl shadow-sm hover:shadow-md overflow-hidden transition-shadow duration-300">
                    {/* 图片区域 */}
                    <div
                      className="relative cursor-pointer"
                      onClick={() => handlePreview(photo)}
                    >
                      <img
                        src={photo.storage_path}
                        alt="照片"
                        className="w-full h-auto object-cover"
                      />
                    </div>

                    {/* 信息区域 */}
                    <div className="p-2">
                      {/* 互动数据 */}
                      <div className="flex items-center justify-between">
                        {/* 左侧：浏览量 */}
                        <div className="flex items-center gap-1 text-[#8D6E63]/60">
                          <Eye className="w-3 h-3" />
                          <span className="text-[10px]">{photo.view_count}</span>
                        </div>

                        {/* 右侧：点赞 */}
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={(e) => handleLike(photo.id, e)}
                          className="flex items-center gap-0.5"
                        >
                          <motion.div
                            animate={photo.is_liked ? { scale: [1, 1.4, 1] } : {}}
                            transition={{ duration: 0.4, ease: "easeOut" }}
                          >
                            <Heart
                              className={`w-3 h-3 transition-all duration-300 ${
                                photo.is_liked ? 'fill-[#FFC857] text-[#FFC857] drop-shadow-[0_2px_4px_rgba(255,200,87,0.4)]' : 'text-[#8D6E63]/60'
                              }`}
                            />
                          </motion.div>
                          <span className="text-[10px] text-[#8D6E63]">{photo.like_count}</span>
                        </motion.button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 分页 */}
            {total > pageSize && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="flex justify-center gap-2 mt-6"
              >
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors text-sm text-[#5D4037]"
                >
                  上一页
                </button>
                <span className="px-4 py-2 bg-[#FFC857]/20 rounded-full text-[#5D4037] font-medium text-sm">
                  {page} / {Math.ceil(total / pageSize)}
                </span>
                <button
                  onClick={() => setPage(p => p + 1)}
                  disabled={page >= Math.ceil(total / pageSize)}
                  className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors text-sm text-[#5D4037]"
                >
                  下一页
                </button>
              </motion.div>
            )}
          </>
        )}
      </div>

      {/* 图片预览弹窗 */}
      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setPreviewPhoto(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </motion.button>

            {/* 图片信息 */}
            <div className="absolute bottom-6 left-6 right-6 bg-white/10 backdrop-blur-sm rounded-2xl p-4">
              <div className="flex items-center justify-center gap-6 text-white">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5" />
                  <span className="text-sm">{previewPhoto.view_count} 次浏览</span>
                </div>
                <div className="flex items-center gap-2">
                  <Heart className={previewPhoto.is_liked ? 'fill-[#FFC857] text-[#FFC857]' : ''} />
                  <span className="text-sm">{previewPhoto.like_count} 次点赞</span>
                </div>
              </div>
            </div>

            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewPhoto.storage_path}
              alt="预览"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
