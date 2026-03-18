'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Eye, Camera, RotateCcw, Folder as FolderIcon } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { useGallery } from '@/lib/swr/hooks';
import { getSessionId } from '@/lib/utils/session';
import { vibrate } from '@/lib/android';
import { formatDateDisplayUTC8 } from '@/lib/utils/date-helpers';
import {
  GALLERY_PAGE_CACHE_KEY,
  clearGalleryPageCacheStorage,
  consumeGalleryCacheDirtyFlag,
} from '@/lib/gallery/cache-sync';

import SimpleImage from '@/components/ui/SimpleImage';
import ImagePreview from '@/components/ImagePreview';
import { useStableMasonryColumns } from '@/lib/hooks/useStableMasonryColumns';

interface Photo {
  id: string;
  folder_id: string | null;
  thumbnail_url: string;  // 速览图 URL
  preview_url: string;    // 高质量预览 URL
  original_url: string;   // 原图 URL（用于下载）
  story_text?: string | null;
  has_story?: boolean;
  is_highlight?: boolean;
  sort_order?: number;
  shot_date?: string | null;
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

interface GalleryFolder {
  id: string;
  name: string;
}

function clampPhotoAspectRatio(width: number, height: number, fallback = 1) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  const ratio = safeWidth > 0 && safeHeight > 0 ? safeHeight / safeWidth : fallback;
  return Math.min(2.6, Math.max(0.72, ratio));
}

function estimateGalleryCardHeight(photo: Photo, isStoryOpen: boolean) {
  const hasStoryText = Boolean(String(photo.story_text || '').trim());
  const mediaHeight = isStoryOpen && hasStoryText
    ? 190
    : clampPhotoAspectRatio(photo.width, photo.height, 1) * 180;
  return mediaHeight + 48;
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

const clearGalleryMemoryCache = () => {
  galleryMemoryCache = { photos: [], total: 0, cachedAt: 0 };
};

export default function GalleryClient({ initialPhotos = [], initialTotal = 0, initialPage = 1 }: GalleryClientProps) {
  const router = useRouter();
  const [selectedFolderId, setSelectedFolderId] = useState<string>('__ROOT__');
  const [folders, setFolders] = useState<GalleryFolder[]>([]);
  const [rootFolderName, setRootFolderName] = useState<string>('照片集');
  const [storyOpenMap, setStoryOpenMap] = useState<Record<string, boolean>>({});

  const [galleryCacheToken] = useState<string>(() => {
    const shouldForceRefresh = consumeGalleryCacheDirtyFlag();
    if (!shouldForceRefresh) {
      return 'default';
    }

    clearGalleryMemoryCache();
    clearGalleryPageCacheStorage();
    return `dirty-${Date.now()}`;
  });

  const shouldForceRefreshFromDirty = galleryCacheToken !== 'default';
  const memoryGallery =
    initialPhotos.length > 0 || shouldForceRefreshFromDirty || selectedFolderId !== '__ROOT__'
      ? null
      : readGalleryMemoryCache();
  const hydratedInitialPhotos = memoryGallery?.photos ?? initialPhotos;
  const hydratedInitialTotal = memoryGallery?.total ?? initialTotal;

  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [page, setPage] = useState(initialPage);
  const [allPhotos, setAllPhotos] = useState<Photo[]>(hydratedInitialPhotos);
  const [hasMore, setHasMore] = useState(hydratedInitialTotal > hydratedInitialPhotos.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const hasClientInitialFetchStartedRef = useRef(false);
  const pageSize = 20;
  const isInitialPage = page === initialPage;
  const GALLERY_CACHE_KEY = `${GALLERY_PAGE_CACHE_KEY}_${selectedFolderId}`;
  // 使用 SWR 获取照片数据,自动缓存和重新验证
  const { data, error, isLoading, mutate: refreshGallery } = useGallery(
    page,
    pageSize,
    isInitialPage && selectedFolderId === '__ROOT__' && hydratedInitialPhotos.length > 0
      ? { photos: hydratedInitialPhotos, total: hydratedInitialTotal }
      : undefined,
    galleryCacheToken,
    selectedFolderId
  );

  // 从 SWR 数据中提取照片和总数
  const photos = allPhotos;
  const total = typeof data?.total === 'number' ? data.total : hydratedInitialTotal;

  // 当 SWR 数据更新时，刷新或追加照片
  useEffect(() => {
    writeGalleryMemoryCache(allPhotos, Math.max(total, allPhotos.length));
  }, [allPhotos, total]);

  useEffect(() => {
    if (!data?.photos) return;

    if (Array.isArray(data.folders)) {
      setFolders(data.folders as GalleryFolder[]);
    }
    if (typeof data.root_folder_name === 'string' && data.root_folder_name.trim()) {
      setRootFolderName(data.root_folder_name.trim());
    }

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

  useEffect(() => {
    setPage(1);
    setAllPhotos([]);
    setHasMore(true);
    setIsLoadingMore(false);
    setStoryOpenMap({});
  }, [selectedFolderId]);

  // 缓存首页照片墙数据，用于下次进入秒开
  useEffect(() => {
    if (selectedFolderId !== '__ROOT__') return;
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
  }, [page, data, selectedFolderId]);

  // 无初始数据时尝试读取本地缓存，避免反复进入加载动画
  useEffect(() => {
    if (selectedFolderId !== '__ROOT__') return;
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
  }, [initialPhotos.length, allPhotos.length, selectedFolderId]);

  useEffect(() => {
    isLoadingMoreRef.current = isLoadingMore;
  }, [isLoadingMore]);

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

    const dbClient = createClient();
    if (!dbClient) {
      return;
    }
    const { data: { user } } = await dbClient.auth.getUser();

    if (!user) {
      setShowLoginPrompt(true);
      return;
    }

    const { data, error } = await dbClient.rpc('like_photo', {
      p_photo_id: photoId
    });

    if (!error && data) {
      // 使用 SWR mutate 乐观更新缓存
      // 更新 allPhotos 中的点赞状态
      setAllPhotos(prev => prev.map(photo => {
        if (photo.id === photoId) {
          const nextLikeCount = data.liked
            ? photo.like_count + 1
            : Math.max(0, photo.like_count - 1);
          return {
            ...photo,
            is_liked: data.liked,
            like_count: nextLikeCount,
          };
        }
        return photo;
      }));

      // 同步更新预览照片的点赞状态
      setPreviewPhoto(prev => {
        if (!prev || prev.id !== photoId) {
          return prev;
        }
        const nextLikeCount = data.liked
          ? prev.like_count + 1
          : Math.max(0, prev.like_count - 1);
        return {
          ...prev,
          is_liked: data.liked,
          like_count: nextLikeCount,
        };
      });
    }
  };

  const handlePreview = async (photo: Photo) => {
    setPreviewPhoto(photo);

    // 增加浏览量（带会话去重）
    const dbClient = createClient();
    if (!dbClient) {
      return;
    }
    const sessionId = getSessionId();

    const { data } = await dbClient.rpc('increment_photo_view', {
      p_photo_id: photo.id,
      p_session_id: sessionId
    });

    // 更新 allPhotos 中的浏览量
    if (data?.counted) {
      setAllPhotos(prev => prev.map(p =>
        p.id === photo.id ? { ...p, view_count: data.view_count } : p
      ));
      setPreviewPhoto(prev =>
        prev && prev.id === photo.id
          ? { ...prev, view_count: data.view_count }
          : prev
      );
    }
  };

  const hasStory = (photo: Photo): boolean => {
    return Boolean(String(photo.story_text || '').trim());
  };

  const isHighlighted = (photo: Photo): boolean => {
    return hasStory(photo) || Boolean(photo.is_highlight);
  };

  const toggleStoryCard = (photoId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStoryOpenMap((prev) => ({
      ...prev,
      [photoId]: !prev[photoId],
    }));
  };

  const showPageLoading = isLoading && allPhotos.length === 0;

  const galleryMasonryItems = useMemo(
    () => photos.map((photo, index) => ({ photo, index })),
    [photos]
  );

  const { columns: galleryColumns } = useStableMasonryColumns({
    items: galleryMasonryItems,
    getItemId: ({ photo }) => photo.id,
    estimateItemHeight: ({ photo }) => estimateGalleryCardHeight(photo, Boolean(storyOpenMap[photo.id])),
    resetKey: selectedFolderId,
  });

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

      <div className="flex-none px-2 py-2 border-b border-[#5D4037]/5 bg-[#FFFBF0]/95">
        <div className="flex items-center gap-2.5 overflow-x-auto scrollbar-hidden">
          <button
            onClick={() => setSelectedFolderId('__ROOT__')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
              selectedFolderId === '__ROOT__'
                ? 'bg-[#FFC857] text-[#5D4037] border-[1.5px] border-[#5D4037]/20 shadow-[3px_3px_0_rgba(93,64,55,0.15)]'
                : 'bg-white/60 text-[#5D4037]/60 border-[1.5px] border-dashed border-[#5D4037]/15'
            }`}
          >
            <span>{rootFolderName}</span>
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setSelectedFolderId(String(folder.id))}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedFolderId === String(folder.id)
                  ? 'bg-[#FFC857] text-[#5D4037] border-[1.5px] border-[#5D4037]/20 shadow-[3px_3px_0_rgba(93,64,55,0.15)]'
                  : 'bg-white/60 text-[#5D4037]/60 border-[1.5px] border-dashed border-[#5D4037]/15'
              }`}
            >
              <span>{folder.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-20 gallery-scroll-container">
        {photos.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[#5D4037]/60">暂无照片</p>
          </div>
        ) : (
          <>
            {/* 双列瀑布流布局 */}
            <div className="flex items-start gap-2">
              {galleryColumns.map((column, columnIndex) => (
                <div
                  key={`gallery-column-${columnIndex}`}
                  className="flex min-w-0 flex-1 flex-col gap-2"
                >
                  {column.map(({ photo, index }) => (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="min-w-0"
                >
                  {/* 小红书风格卡片 */}
                  <div
                    className={`bg-white rounded-xl overflow-hidden transition-all duration-300 ${
                      isHighlighted(photo)
                        ? 'border-[2px] border-[#FFB703] bg-[#FFFDF7] shadow-[0_0_0_1px_rgba(255,229,156,0.92),0_7px_16px_rgba(255,183,3,0.48),0_4px_10px_rgba(93,64,55,0.20)] translate-y-[-1px]'
                        : 'border border-transparent shadow-[0_5px_15px_rgba(93,64,55,0.10)]'
                    }`}
                  >
                    {/* 图片区域 */}
                    <div className="relative">
                      {storyOpenMap[photo.id] && hasStory(photo) ? (
                        <div className="min-h-[190px] p-2 bg-gradient-to-br from-[#FFFDF7] via-[#FFF5DC] to-[#FCEBC5]">
                          <div className="relative rounded-[9px] border border-[#A67E52]/24 bg-[linear-gradient(180deg,rgba(255,251,242,0.98)_0%,rgba(255,246,231,0.98)_100%),repeating-linear-gradient(180deg,transparent_0px,transparent_23px,rgba(93,64,55,0.055)_23px,rgba(93,64,55,0.055)_24px)] px-[9px] py-[9px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_10px_rgba(93,64,55,0.14)]">
                            <span className="mb-[5px] inline-flex h-[17px] items-center justify-center rounded-full border border-[#5D4037]/16 bg-[#FFC857]/22 px-[7px] text-[10px] font-bold leading-none text-[#5D4037]/86">
                              关于此刻
                            </span>
                            <p className="text-[12.5px] leading-[1.78] text-[#5D4037]/93 font-semibold whitespace-pre-wrap break-words tracking-[0.02em]">
                              {String(photo.story_text || '').trim()}
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="relative cursor-pointer"
                          onClick={() => handlePreview(photo)}
                        >
                          <SimpleImage
                            src={photo.thumbnail_url}
                            alt="照片"
                            aspectRatio={clampPhotoAspectRatio(photo.width, photo.height, 1)}
                            className="w-full rounded-t-xl"
                          />

                          {/* 浏览量气泡 - 左上角 */}
                          <div className="absolute top-[6px] left-[6px] flex items-center gap-[4px] px-[6px] py-[3px] rounded-full bg-black/40">
                            <Eye className="w-3 h-3 text-white" />
                            <span className="text-[10px] text-white font-bold">{photo.view_count}</span>
                          </div>

                        </div>
                      )}

                      {hasStory(photo) && (
                        <button
                          onClick={(e) => toggleStoryCard(photo.id, e)}
                          className={`absolute top-[5px] right-[5px] w-[26px] h-[26px] rounded-full backdrop-blur-sm border flex items-center justify-center transition-all ${
                            isHighlighted(photo)
                              ? 'bg-gradient-to-br from-[#FFD76E] to-[#FFC857] border-[1.5px] border-[#5D4037]/45 text-[#5D4037] shadow-[0_0_0_1px_rgba(255,229,156,0.9),0_5px_12px_rgba(255,183,3,0.55)] animate-pulse'
                              : 'bg-black/38 border border-white/45 text-white'
                          }`}
                          aria-label="查看关于此刻"
                          title="关于此刻"
                        >
                          <RotateCcw
                            className={`w-[14px] h-[14px] transition-transform duration-200 ${
                              storyOpenMap[photo.id] ? 'rotate-180' : ''
                            } ${isHighlighted(photo) ? 'drop-shadow-[0_0.5px_0_rgba(255,255,255,0.55)]' : ''}`}
                          />
                        </button>
                      )}
                    </div>

                    {/* 信息区域 */}
                    <div className="p-1.5 md:p-2">
                      {/* 互动数据 */}
                      <div className="flex items-center justify-start">
                        {/* 左侧：拍摄日期 */}
                        <div className="order-2 ml-auto flex items-center gap-1 text-right text-[#8D6E63]/50 py-0.5 pl-1">
                          <span className="text-[10px]">
                            {formatDateDisplayUTC8(photo.shot_date || photo.created_at, {
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
                          className="order-1 compact-button flex items-center gap-0.5 py-0.5 pr-1"
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
              ))}
            </div>

            {/* 加载更多指示器 */}
            {isLoadingMore && hasMore && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex justify-center items-center gap-3 mt-6 mb-4"
              >
                <div className="relative w-10 h-10">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-0 rounded-full border-[2.5px] border-[#FFC857]/30 border-t-[#FFC857]"
                  />
                  <motion.div
                    animate={{ rotate: -360 }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                    className="absolute inset-[6px] rounded-full border-[2.5px] border-[#5D4037]/20 border-b-[#5D4037]"
                  />
                </div>
                <p className="text-sm text-[#5D4037]/60 font-bold">拾光中...</p>
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

      {/* 全屏高清预览（支持缩放/拖拽/滑动/长按下载） */}
      <ImagePreview
        images={allPhotos.map((photo) => photo.preview_url)}
        downloadUrls={allPhotos.map((photo) => photo.original_url || photo.preview_url)}
        currentIndex={fullscreenPhoto ? allPhotos.findIndex((photo) => photo.id === fullscreenPhoto.id) : 0}
        isOpen={!!fullscreenPhoto}
        onClose={() => setFullscreenPhoto(null)}
        onIndexChange={(index) => setFullscreenPhoto(allPhotos[index] ?? null)}
        showCounter={true}
        showScale={true}
        enableLongPressDownload={true}
      />

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
                    router.push('/login');
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


