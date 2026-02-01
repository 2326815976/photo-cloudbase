'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useGallery } from '@/lib/swr/hooks';
import { mutate } from 'swr';
import { getSessionId } from '@/lib/utils/session';

import SimpleImage from '@/components/ui/SimpleImage';

interface Photo {
  id: string;
  thumbnail_url: string;  // 速览图 URL
  preview_url: string;    // 高质量预览 URL
  width: number;
  height: number;
  blurhash?: string;
  like_count: number;
  view_count: number;
  is_liked: boolean;
  created_at: string;
}

interface GalleryClientProps {
  initialPhotos?: Photo[];
  initialTotal?: number;
  initialPage?: number;
}

export default function GalleryClient({ initialPhotos = [], initialTotal = 0, initialPage = 1 }: GalleryClientProps) {
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [page, setPage] = useState(initialPage);
  const pageSize = 20;

  // 使用 SWR 获取照片数据，自动缓存和重新验证
  const { data, error, isLoading, mutate: refreshGallery } = useGallery(page, pageSize);

  // 从 SWR 数据中提取照片和总数
  const photos = data?.photos || initialPhotos;
  const total = data?.total || initialTotal;

  // 预加载下一页图片
  useEffect(() => {
    if (photos.length > 0) {
      // 预加载当前页面的 preview 图片
      photos.forEach((photo: Photo, index: number) => {
        if (index < 10) { // 只预加载前10张的 preview
          const img = new Image();
          img.src = photo.preview_url;
        }
      });
    }
  }, [photos]);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const handleLike = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setShowLoginPrompt(true);
      return;
    }

    const { data, error } = await supabase.rpc('like_photo', {
      p_photo_id: photoId
    });

    if (!error && data) {
      // 使用 SWR mutate 乐观更新缓存
      refreshGallery((currentData: { photos: Photo[]; total: number } | undefined) => {
        if (!currentData) return currentData;

        return {
          ...currentData,
          photos: currentData.photos.map(photo => {
            if (photo.id === photoId) {
              return {
                ...photo,
                is_liked: data.liked,
                like_count: data.liked ? photo.like_count + 1 : photo.like_count - 1
              };
            }
            return photo;
          })
        };
      }, false); // false 表示不重新验证，使用乐观更新
    }
  };

  const handlePreview = async (photo: Photo) => {
    setPreviewPhoto(photo);

    // 预加载高质量预览图
    const img = new Image();
    img.src = photo.preview_url;

    // 增加浏览量（带会话去重）
    const supabase = createClient();
    const sessionId = getSessionId();

    const { data } = await supabase.rpc('increment_photo_view', {
      p_photo_id: photo.id,
      p_session_id: sessionId
    });

    // 使用 SWR mutate 更新本地浏览量
    if (data?.counted) {
      refreshGallery((currentData: { photos: Photo[]; total: number } | undefined) => {
        if (!currentData) return currentData;

        return {
          ...currentData,
          photos: currentData.photos.map(p =>
            p.id === photo.id ? { ...p, view_count: data.view_count } : p
          )
        };
      }, false);
    }
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
        {isLoading ? (
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
              {photos.map((photo: Photo, index: number) => (
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
                      <SimpleImage
                        src={photo.thumbnail_url}
                        alt="照片"
                        className="w-full h-auto rounded-t-xl"
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

      {/* 便利贴风格预览弹窗 */}
      <AnimatePresence>
        {previewPhoto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewPhoto(null)}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              exit={{ opacity: 0, scale: 0.9, rotate: 2 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
            >
              <div
                className="bg-[#FFFBF0] rounded-2xl shadow-[0_12px_40px_rgba(93,64,55,0.25)] border-2 border-[#5D4037]/10 max-w-4xl max-h-[90vh] overflow-hidden pointer-events-auto relative"
                onClick={(e) => e.stopPropagation()}
              >
                {/* 便利贴胶带效果 */}
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#FFC857]/40 backdrop-blur-sm rounded-sm shadow-sm rotate-[-1deg] z-10" />

                {/* 关闭按钮 */}
                <button
                  onClick={() => setPreviewPhoto(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors z-20"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>

                {/* 图片容器 */}
                <div className="p-4 pb-3">
                  <div className="relative bg-white rounded-lg overflow-hidden shadow-inner">
                    <img
                      src={previewPhoto.preview_url}
                      alt="预览"
                      className="w-full h-auto max-h-[70vh] object-contain"
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                </div>

                {/* 信息区域 */}
                <div className="px-4 pb-4 border-t-2 border-dashed border-[#5D4037]/10 pt-3 bg-white/50">
                  <div className="flex items-center justify-center gap-6 text-[#5D4037]">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      <span className="text-sm font-medium">{previewPhoto.view_count} 次浏览</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Heart className={`w-4 h-4 ${previewPhoto.is_liked ? 'fill-[#FFC857] text-[#FFC857]' : ''}`} />
                      <span className="text-sm font-medium">{previewPhoto.like_count} 次点赞</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 未登录点赞提示弹窗 */}
      <AnimatePresence>
        {showLoginPrompt && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLoginPrompt(false)}
              className="fixed inset-0 bg-black/30 z-40"
            />

            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-sm px-4"
            >
              <div className="bg-[#FFFBF0] rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.2)] border-2 border-[#5D4037]/10 overflow-hidden">
                {/* 标题区域 */}
                <div className="p-4 border-b-2 border-dashed border-[#5D4037]/15 bg-[#FFC857]/20">
                  <h3 className="text-lg font-bold text-[#5D4037] text-center" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
                    ✨ 温馨提示 ✨
                  </h3>
                </div>

                {/* 内容区域 */}
                <div className="p-6 text-center">
                  <p className="text-[#5D4037] text-base mb-6">
                    登录后才能为喜欢的照片点赞哦~
                  </p>

                  <button
                    onClick={() => setShowLoginPrompt(false)}
                    className="w-full py-3 rounded-full bg-[#FFC857] text-[#5D4037] border-2 border-[#5D4037]/20 font-bold hover:shadow-md transition-shadow"
                  >
                    知道了
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
