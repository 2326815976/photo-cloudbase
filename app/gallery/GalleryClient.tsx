'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, Eye } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useGallery } from '@/lib/swr/hooks';
import { mutate } from 'swr';
import { getSessionId } from '@/lib/utils/session';
import { vibrate } from '@/lib/android';
import { isAndroidApp } from '@/lib/platform';

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
  const [allPhotos, setAllPhotos] = useState<Photo[]>(initialPhotos);
  const [hasMore, setHasMore] = useState(initialTotal > initialPhotos.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const pageSize = 20;

  // 检测是否为 Android 环境，使用 CSS 动画替代 Framer Motion
  const useNativeAnimation = isAndroidApp();

  // 使用 SWR 获取照片数据,自动缓存和重新验证
  const { data, error, isLoading, mutate: refreshGallery } = useGallery(page, pageSize);

  // 从 SWR 数据中提取照片和总数
  const photos = allPhotos;
  const total = data?.total || initialTotal;

  // 当 SWR 数据更新时，追加新照片
  useEffect(() => {
    if (data?.photos && page > 1) {
      setAllPhotos(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const newPhotos = data.photos.filter((p: Photo) => !existingIds.has(p.id));
        return [...prev, ...newPhotos];
      });
      setHasMore(allPhotos.length + data.photos.length < data.total);
      setIsLoadingMore(false);
    }
  }, [data, page]);

  // 预加载图片
  useEffect(() => {
    if (allPhotos.length > 0) {
      const lastIndex = Math.min(allPhotos.length, 20);
      allPhotos.slice(0, lastIndex).forEach((photo: Photo) => {
        const img = new Image();
        img.src = photo.preview_url;
      });
    }
  }, [allPhotos]);

  // 无限滚动监听
  useEffect(() => {
    const handleScroll = () => {
      if (isLoadingMore || !hasMore) return;

      const scrollContainer = document.querySelector('.gallery-scroll-container');
      if (!scrollContainer) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // 当滚动到底部 80% 时加载更多
      if (scrollPercentage > 0.8) {
        setIsLoadingMore(true);
        setPage(prev => prev + 1);
      }
    };

    const scrollContainer = document.querySelector('.gallery-scroll-container');
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll);
      return () => scrollContainer.removeEventListener('scroll', handleScroll);
    }
  }, [isLoadingMore, hasMore]);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const handleLike = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 触觉反馈
    vibrate(50);

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
      // 更新 allPhotos 中的点赞状态
      setAllPhotos(prev => prev.map(photo => {
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

    // 更新 allPhotos 中的浏览量
    if (data?.counted) {
      setAllPhotos(prev => prev.map(p =>
        p.id === photo.id ? { ...p, view_count: data.view_count } : p
      ));
    }
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 - 使用弹性布局适配不同屏幕 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-3 py-2.5 flex items-center gap-2">
          <h1 className="flex-1 text-lg sm:text-xl font-bold text-[#5D4037] leading-tight truncate" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>照片墙</h1>
          <div className="flex-shrink-0 px-2 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 max-w-[45%]">
            <p className="text-[9px] sm:text-[10px] font-bold text-[#8D6E63] tracking-tight truncate">📸 贩卖人间路过的温柔 📸</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-20 gallery-scroll-container">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="relative mb-6">
              {/* 外圈旋转 */}
              <div className="w-16 h-16 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857] animate-spin"></div>
              {/* 内圈反向旋转 */}
              <div className="absolute inset-2 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037] animate-spin-reverse"></div>
            </div>
            <p className="text-base font-medium text-[#5D4037] mb-1" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>拾光中...</p>
            <p className="text-sm text-[#5D4037]/60">正在加载照片墙</p>
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

                      {/* 浏览量气泡 - 左上角 */}
                      <div className="absolute top-2 left-2 flex items-center gap-1 px-2 py-1 rounded-full bg-black/40 backdrop-blur-sm">
                        <Eye className="w-3 h-3 text-white" />
                        <span className="text-[10px] text-white font-medium">{photo.view_count}</span>
                      </div>
                    </div>

                    {/* 信息区域 */}
                    <div className="p-2">
                      {/* 互动数据 */}
                      <div className="flex items-center justify-between">
                        {/* 左侧：上传时间 */}
                        <div className="flex items-center gap-1 text-[#8D6E63]/50">
                          <span className="text-[10px]">
                            {new Date(photo.created_at).toLocaleDateString('zh-CN', {
                              month: '2-digit',
                              day: '2-digit'
                            })}
                          </span>
                        </div>

                        {/* 右侧：点赞 */}
                        {useNativeAnimation ? (
                          // Android 环境：使用 CSS 动画
                          <button
                            onClick={(e) => handleLike(photo.id, e)}
                            className="flex items-center gap-0.5 active:scale-90 transition-transform"
                          >
                            <Heart
                              className={`w-3 h-3 transition-all duration-300 ${
                                photo.is_liked
                                  ? 'fill-[#FFC857] text-[#FFC857] drop-shadow-[0_2px_4px_rgba(255,200,87,0.4)] animate-pulse'
                                  : 'text-[#8D6E63]/60'
                              }`}
                            />
                            <span className="text-[10px] text-[#8D6E63]">{photo.like_count}</span>
                          </button>
                        ) : (
                          // Web 环境：使用 Framer Motion
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
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 加载更多指示器 */}
            {isLoadingMore && hasMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center items-center gap-2 mt-6 mb-4"
              >
                <div className="w-6 h-6 border-3 border-[#FFC857] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-[#5D4037]/60" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>拾光中...</p>
              </motion.div>
            )}

            {/* 到底提示 */}
            {!hasMore && allPhotos.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center mt-6 mb-4"
              >
                <p className="text-sm text-[#5D4037]/40">✨ 已经到底啦 ✨</p>
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
                    <SimpleImage
                      src={previewPhoto.preview_url}
                      alt="预览"
                      priority={true}
                      className="w-full h-auto max-h-[70vh]"
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLoginPrompt(false)}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Heart className="w-8 h-8 text-[#FFC857]" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-3">✨ 想施展赞美魔法？</h3>
                <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-3">
                  登录后，你就能成为 <span className="font-bold text-[#FFC857]">【魔法使】</span>，为喜欢的照片施展 <span className="font-bold text-[#FFC857]">【赞美魔法】</span> 啦！每一个赞都是一道温暖的光，让美好的瞬间更加闪耀~ ✨
                </p>
                <p className="text-xs text-[#5D4037]/50 leading-relaxed">
                  💡 Tips：魔法使还可以在【返图空间】施展【定格魔法】，让照片永久保存哦！
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowLoginPrompt(false)}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors"
                >
                  随便看看
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    setShowLoginPrompt(false);
                    window.location.href = '/login';
                  }}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#FFC857] text-[#5D4037] shadow-md hover:shadow-lg transition-all"
                >
                  💛 去登录
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
