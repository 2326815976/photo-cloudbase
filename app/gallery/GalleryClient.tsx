'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, X, Eye, Camera } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useGallery } from '@/lib/swr/hooks';
import { mutate } from 'swr';
import { getSessionId } from '@/lib/utils/session';
import { vibrate } from '@/lib/android';

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

const GALLERY_MEMORY_CACHE_TTL = 30 * 60 * 1000;

let galleryMemoryCache: { photos: Photo[]; total: number; cachedAt: number } = {
  photos: [],
  total: 0,
  cachedAt: 0,
};

const readGalleryMemoryCache = (): { photos: Photo[]; total: number } | null => {
  if (galleryMemoryCache.photos.length === 0) return null;

  const isExpired = Date.now() - galleryMemoryCache.cachedAt > GALLERY_MEMORY_CACHE_TTL;
  if (isExpired) {
    galleryMemoryCache = { photos: [], total: 0, cachedAt: 0 };
    return null;
  }

  return {
    photos: galleryMemoryCache.photos.map((photo) => ({ ...photo })),
    total: galleryMemoryCache.total,
  };
};

const writeGalleryMemoryCache = (photos: Photo[], total: number) => {
  if (photos.length === 0) {
    galleryMemoryCache = { photos: [], total: 0, cachedAt: 0 };
    return;
  }

  galleryMemoryCache = {
    photos: photos.map((photo) => ({ ...photo })),
    total,
    cachedAt: Date.now(),
  };
};

export default function GalleryClient({ initialPhotos = [], initialTotal = 0, initialPage = 1 }: GalleryClientProps) {
  const memoryGallery = initialPhotos.length > 0 ? null : readGalleryMemoryCache();
  const hydratedInitialPhotos = memoryGallery?.photos ?? initialPhotos;
  const hydratedInitialTotal = memoryGallery?.total ?? initialTotal;

  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [clickTimer, setClickTimer] = useState<number | null>(null);
  const [page, setPage] = useState(initialPage);
  const [allPhotos, setAllPhotos] = useState<Photo[]>(hydratedInitialPhotos);
  const [hasMore, setHasMore] = useState(hydratedInitialTotal > hydratedInitialPhotos.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const preloadedPreviewUrlsRef = useRef<Set<string>>(new Set());
  const hasClientInitialFetchStartedRef = useRef(false);
  const pageSize = 20;
  const isInitialPage = page === initialPage;
  const GALLERY_CACHE_KEY = 'gallery-page-1-cache-v1';
  // 使用 SWR 获取照片数据,自动缓存和重新验证
  const { data, error, isLoading, mutate: refreshGallery } = useGallery(
    page,
    pageSize,
    isInitialPage && hydratedInitialPhotos.length > 0
      ? { photos: hydratedInitialPhotos, total: hydratedInitialTotal }
      : undefined
  );

  // 从 SWR 数据中提取照片和总数
  const photos = allPhotos;
  const total = data?.total || hydratedInitialTotal;

  // 当 SWR 数据更新时，刷新或追加照片
  useEffect(() => {
    writeGalleryMemoryCache(allPhotos, Math.max(total, allPhotos.length));
  }, [allPhotos, total]);

  useEffect(() => {
    if (!data?.photos) return;

    if (page === 1) {
      setAllPhotos(data.photos);
      setHasMore(data.photos.length >= pageSize && data.photos.length < data.total);
      setIsLoadingMore(false);
      return;
    }

    setAllPhotos(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newPhotos = data.photos.filter((p: Photo) => !existingIds.has(p.id));
      const updatedPhotos = [...prev, ...newPhotos];
      // 修复边界条件：当新加载的照片数量少于pageSize时，说明没有更多照片了
      setHasMore(data.photos.length >= pageSize && updatedPhotos.length < data.total);
      return updatedPhotos;
    });
    setIsLoadingMore(false);
  }, [data, page, pageSize]);

  // 缓存首页照片墙数据，用于下次进入秒开
  useEffect(() => {
    if (page !== 1) return;
    if (!data?.photos || data.photos.length === 0) return;

    try {
      localStorage.setItem(
        GALLERY_CACHE_KEY,
        JSON.stringify({
          photos: data.photos,
          total: data.total || data.photos.length,
          cachedAt: Date.now(),
        })
      );
    } catch {
      // 忽略缓存写入失败
    }
  }, [page, data]);

  // 无初始数据时尝试读取本地缓存，避免反复进入加载动画
  useEffect(() => {
    if (memoryGallery && memoryGallery.photos.length > 0) return;
    if (initialPhotos.length > 0) return;
    if (allPhotos.length > 0) return;

    try {
      const raw = localStorage.getItem(GALLERY_CACHE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as { photos?: Photo[]; total?: number; cachedAt?: number };
      const cachedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : [];
      if (cachedPhotos.length === 0) return;

      const isExpired = typeof parsed.cachedAt === 'number' && Date.now() - parsed.cachedAt > 30 * 60 * 1000;
      if (isExpired) return;

      setAllPhotos(cachedPhotos);
      const cachedTotal = typeof parsed.total === 'number' ? parsed.total : cachedPhotos.length;
      setHasMore(cachedPhotos.length < cachedTotal);
    } catch {
      // 忽略缓存解析失败
    }
  }, [initialPhotos.length, allPhotos.length]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

  // 预加载图片 - Android优化：从20张减少到5张，减少内存占用和加载时间
  useEffect(() => {
    if (allPhotos.length > 0) {
      const lastIndex = Math.min(allPhotos.length, 5);
      allPhotos.slice(0, lastIndex).forEach((photo: Photo) => {
        if (preloadedPreviewUrlsRef.current.has(photo.preview_url)) {
          return;
        }

        preloadedPreviewUrlsRef.current.add(photo.preview_url);
        const img = new Image();
        img.src = photo.preview_url;
      });
    }
  }, [allPhotos]);

  // 无限滚动监听
  useEffect(() => {
    const scrollContainer = document.querySelector<HTMLElement>('.gallery-scroll-container');
    if (!scrollContainer) {
      return;
    }

    const handleScroll = () => {
      if (isLoadingMoreRef.current || !hasMore) return;

      const { scrollTop, scrollHeight, clientHeight } = scrollContainer;
      const scrollPercentage = (scrollTop + clientHeight) / scrollHeight;

      // 当滚动到底部 80% 时加载更多
      if (scrollPercentage > 0.8) {
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
        setPage(prev => prev + 1);
      }
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    return () => scrollContainer.removeEventListener('scroll', handleScroll);
  }, [hasMore]);

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  const handleLike = async (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // 触觉反馈
    vibrate(50);

    const supabase = createClient();
    if (!supabase) {
      return;
    }
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

      // 同步更新预览照片的点赞状态
      if (previewPhoto && previewPhoto.id === photoId) {
        setPreviewPhoto({
          ...previewPhoto,
          is_liked: data.liked,
          like_count: data.liked ? previewPhoto.like_count + 1 : previewPhoto.like_count - 1
        });
      }
    }
  };

  const handlePreview = async (photo: Photo) => {
    setPreviewPhoto(photo);

    // 预加载高质量预览图
    const img = new Image();
    img.src = photo.preview_url;

    // 增加浏览量（带会话去重）
    const supabase = createClient();
    if (!supabase) {
      return;
    }
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

  const showPageLoading = isLoading && allPhotos.length === 0;

  // Android WebView 常见：服务端未预取时，主动触发首屏拉取，避免停留在loading
  useEffect(() => {
    if (hasClientInitialFetchStartedRef.current) return;
    if (allPhotos.length > 0) return;

    hasClientInitialFetchStartedRef.current = true;
    void refreshGallery();
  }, [allPhotos.length, refreshGallery]);

  if (showPageLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Camera className="w-8 h-8 text-[#FFC857]" />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-lg font-medium text-[#5D4037] mb-2">
              加载中...
            </p>
            <p className="text-sm text-[#5D4037]/60">
              正在加载照片墙
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 - 使用弹性布局适配不同屏幕 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-[#5D4037] leading-none truncate" style={{ fontFamily: "'ZQKNNY', cursive" }}>照片墙</h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">📸 贩卖人间路过的温柔 📸</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-20 gallery-scroll-container">
        {photos.length === 0 ? (
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
                    <div className="p-1.5 md:p-2">
                      {/* 互动数据 */}
                      <div className="flex items-center justify-between">
                        {/* 左侧：上传时间 */}
                        <div className="flex items-center gap-1 text-[#8D6E63]/50 py-0.5 pl-1">
                          <span className="text-[10px]">
                            {new Date(photo.created_at).toLocaleDateString('zh-CN', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit'
                            })}
                          </span>
                        </div>

                        {/* 右侧：点赞 */}
                        <motion.button
                          whileTap={{ scale: 0.85 }}
                          onClick={(e) => handleLike(photo.id, e)}
                          className="compact-button flex items-center gap-0.5 py-0.5 pr-1"
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

            {/* 加载更多指示器 */}
            {isLoadingMore && hasMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center items-center gap-2 mt-6 mb-4"
              >
                <div className="w-6 h-6 border-3 border-[#FFC857] border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-[#5D4037]/60" style={{ fontFamily: "'ZQKNNY', cursive" }}>拾光中...</p>
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

                {/* 图片容器 */}
                <div className="p-4 pb-3">
                  <div
                    className="relative bg-white rounded-lg overflow-hidden shadow-inner cursor-pointer"
                    onClick={() => setFullscreenPhoto(previewPhoto)}
                  >
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
                  <div className="flex items-center justify-center gap-6 text-[#5D4037] mb-3">
                    <div className="flex items-center gap-2">
                      <Eye className="w-4 h-4" />
                      <span className="text-sm font-medium">{previewPhoto.view_count} 次浏览</span>
                    </div>
                    <button
                      onClick={(e) => handleLike(previewPhoto.id, e)}
                      className="flex items-center gap-2 hover:scale-105 active:scale-95 transition-transform"
                    >
                      <Heart className={`w-4 h-4 ${previewPhoto.is_liked ? 'fill-[#FFC857] text-[#FFC857]' : ''}`} />
                      <span className="text-sm font-medium">{previewPhoto.like_count} 次点赞</span>
                    </button>
                  </div>

                  {/* 关闭按钮 */}
                  <button
                    onClick={() => setPreviewPhoto(null)}
                    className="w-full py-2.5 rounded-lg bg-[#5D4037]/10 hover:bg-[#5D4037]/20 active:bg-[#5D4037]/30 transition-colors text-[#5D4037] font-medium text-sm"
                  >
                    关闭
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* 全屏高清预览弹窗 */}
      <AnimatePresence>
        {fullscreenPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              // 延迟单击处理，避免与双击冲突
              if (clickTimer) {
                // 检测到双击，清除单击定时器
                clearTimeout(clickTimer);
                setClickTimer(null);
              } else {
                // 单击，设置300ms延迟
                const timer = window.setTimeout(() => {
                  setFullscreenPhoto(null);
                  setScale(1);
                  setPosition({ x: 0, y: 0 });
                  setClickTimer(null);
                }, 300);
                setClickTimer(timer);
              }
            }}
            className="fixed inset-0 bg-black z-[60] flex items-center justify-center"
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                // 单指拖拽
                setIsDragging(true);
                setDragStart({
                  x: e.touches[0].clientX - position.x,
                  y: e.touches[0].clientY - position.y
                });
              } else if (e.touches.length === 2) {
                // 双指缩放
                setIsDragging(false);
                const distance = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY
                );
                setLastTouchDistance(distance);
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1 && isDragging) {
                // 单指拖拽
                setPosition({
                  x: e.touches[0].clientX - dragStart.x,
                  y: e.touches[0].clientY - dragStart.y
                });
              } else if (e.touches.length === 2) {
                // 双指缩放
                e.preventDefault();
                const distance = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY
                );
                if (lastTouchDistance > 0) {
                  const delta = (distance - lastTouchDistance) * 0.01;
                  setScale(prev => Math.max(1, Math.min(3, prev + delta)));
                }
                setLastTouchDistance(distance);
              }
            }}
            onTouchEnd={(e) => {
              if (e.touches.length === 0) {
                setIsDragging(false);
                setLastTouchDistance(0);
              } else if (e.touches.length === 1) {
                // 从双指变为单指，重新开始拖拽
                setLastTouchDistance(0);
                setIsDragging(true);
                setDragStart({
                  x: e.touches[0].clientX - position.x,
                  y: e.touches[0].clientY - position.y
                });
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center overflow-hidden"
            >
              {/* 关闭按钮 */}
              <button
                onClick={() => {
                  setFullscreenPhoto(null);
                  setScale(1);
                  setPosition({ x: 0, y: 0 });
                }}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors z-10"
              >
                <X className="w-6 h-6 text-white" />
              </button>

              {/* 缩放提示 */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
                <p className="text-white text-xs">双指缩放</p>
              </div>

              {/* 缩放比例显示 */}
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
                <span className="text-white text-sm font-medium">
                  {Math.round(scale * 100)}%
                </span>
              </div>

              {/* 高清预览图 - 支持缩放和拖拽 */}
              <img
                src={fullscreenPhoto.preview_url}
                alt="全屏预览"
                className="max-w-full max-h-full object-contain cursor-move select-none"
                style={{
                  transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
                onMouseDown={(e) => {
                  setIsDragging(true);
                  setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
                }}
                onMouseMove={(e) => {
                  if (isDragging) {
                    setPosition({
                      x: e.clientX - dragStart.x,
                      y: e.clientY - dragStart.y
                    });
                  }
                }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  const newScale = Math.min(Math.max(1, scale + delta), 3);
                  setScale(newScale);
                  if (newScale === 1) {
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                onDoubleClick={() => {
                  if (scale === 1) {
                    setScale(2);
                  } else {
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                draggable={false}
              />
            </motion.div>
          </motion.div>
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
