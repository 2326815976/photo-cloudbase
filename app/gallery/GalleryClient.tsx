'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Eye, Camera, RotateCcw, MapPin } from 'lucide-react';
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
import { getBackendRecoveryState, subscribeBackendRecovery } from '@/lib/backend-recovery';

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
  shot_location?: string | null;
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

const ROOT_GALLERY_FOLDER_ID = '__ROOT__';

const TAG_GUIDE_AUTO_DISMISS_MS = 15000;
const GALLERY_SCROLL_LOAD_TRIGGER_PROGRESS = 0.8;
const GALLERY_VIEWPORT_FILL_BUFFER_PX = 24;
const TAG_WAVE_ROUNDS = 3;
const TAG_WAVE_STEP_DELAY_MS = 380;
const TAG_WAVE_ROUND_GAP_MS = 240;
const TAG_WAVE_BUTTON_VARIANTS = {
  idle: { y: 0, scale: 1 },
  waveA: { y: [0, -4, 0], scale: [1, 1.02, 1] },
  waveB: { y: [0, -4, 0], scale: [1, 1.02, 1] },
};

const GALLERY_LAYOUT_RATIO_MIN = 0.72;
const GALLERY_LAYOUT_RATIO_MAX = 2.6;
const GALLERY_RUNTIME_RATIO_MIN = 0.3;



function clampPhotoAspectRatio(width: number, height: number, fallback = 1) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);

  if (safeWidth > 0 && safeHeight > 0) {
    const ratio = safeHeight / safeWidth;
    return Math.min(GALLERY_LAYOUT_RATIO_MAX, Math.max(GALLERY_RUNTIME_RATIO_MIN, ratio));
  }

  return Math.min(GALLERY_LAYOUT_RATIO_MAX, Math.max(GALLERY_LAYOUT_RATIO_MIN, fallback));
}

function resolveLoadedPhotoAspectRatio(width: number, height: number, fallback = 1) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  const ratio = safeWidth > 0 && safeHeight > 0 ? safeHeight / safeWidth : fallback;
  return Math.min(GALLERY_LAYOUT_RATIO_MAX, Math.max(GALLERY_RUNTIME_RATIO_MIN, ratio));
}

function estimateGalleryCardHeight(photo: Photo, isStoryOpen: boolean, aspectRatio?: number) {
  const hasStoryText = Boolean(String(photo.story_text || '').trim());
  const resolvedAspectRatio = Number.isFinite(Number(aspectRatio)) && Number(aspectRatio) > 0
    ? Number(aspectRatio)
    : clampPhotoAspectRatio(photo.width, photo.height, 1);
  const mediaHeight = isStoryOpen && hasStoryText
    ? 190
    : resolvedAspectRatio * 180;
  return mediaHeight + 25;
}

function formatGalleryMetaDate(value: unknown) {
  return formatDateDisplayUTC8(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function resolveGalleryShotLocation(value: unknown) {
  const normalized = String(value ?? '').trim();
  return normalized || '未知';
}

function normalizeGalleryFolder(folder: unknown): GalleryFolder | null {
  if (!folder || typeof folder !== 'object') {
    return null;
  }

  const candidate = folder as Partial<GalleryFolder>;
  const id = String(candidate.id ?? '').trim();
  const name = String(candidate.name ?? '').trim();

  if (!id || !name) {
    return null;
  }

  return { id, name };
}

function buildGalleryFolderList(
  incomingFolders: unknown,
  rootFolderName: string,
  previousFolders: GalleryFolder[] = []
): GalleryFolder[] {
  const resolvedRootName = String(rootFolderName || '').trim() || '根目录';
  const mergedFolders: GalleryFolder[] = [{ id: ROOT_GALLERY_FOLDER_ID, name: resolvedRootName }];
  const seenIds = new Set<string>([ROOT_GALLERY_FOLDER_ID]);

  const appendFolders = (source: unknown) => {
    if (!Array.isArray(source)) {
      return;
    }

    source.forEach((item) => {
      const normalizedFolder = normalizeGalleryFolder(item);
      if (!normalizedFolder) {
        return;
      }

      if (normalizedFolder.id === ROOT_GALLERY_FOLDER_ID) {
        return;
      }

      if (seenIds.has(normalizedFolder.id)) {
        return;
      }

      seenIds.add(normalizedFolder.id);
      mergedFolders.push(normalizedFolder);
    });
  };

  appendFolders(incomingFolders);
  appendFolders(previousFolders);

  return mergedFolders;
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
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ROOT_GALLERY_FOLDER_ID);
  const [folders, setFolders] = useState<GalleryFolder[]>(() => buildGalleryFolderList([], '根目录'));
  const [rootFolderName, setRootFolderName] = useState<string>('根目录');
  const [backendState, setBackendState] = useState(getBackendRecoveryState);
  const [showTagGuide, setShowTagGuide] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [tempFolderId, setTempFolderId] = useState<string>(ROOT_GALLERY_FOLDER_ID);
  const [storyOpenMap, setStoryOpenMap] = useState<Record<string, boolean>>({});
  const [photoAspectRatioMap, setPhotoAspectRatioMap] = useState<Record<string, number>>({});
  const [isSwitchingTag, setIsSwitchingTag] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const folderButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tagGuideTimerRef = useRef<number | null>(null);
  const tagGuideShownOnceRef = useRef(false);
  const tagWaveTimerRef = useRef<number | null>(null);
  const tagWaveRunTokenRef = useRef(0);
  const [tagWaveActiveIndex, setTagWaveActiveIndex] = useState(-1);
  const [tagWaveTick, setTagWaveTick] = useState(0);

  const [galleryCacheToken] = useState<string>(() => {
    const shouldForceRefresh = consumeGalleryCacheDirtyFlag();
    if (!shouldForceRefresh) {
      return 'default';
    }

    clearGalleryMemoryCache();
    clearGalleryPageCacheStorage();
    return `dirty-${Date.now()}`;
  });

  useEffect(() => {
    const unsubscribe = subscribeBackendRecovery(setBackendState);
    return unsubscribe;
  }, []);

  const shouldForceRefreshFromDirty = galleryCacheToken !== 'default';
  const memoryGallery =
    initialPhotos.length > 0 || shouldForceRefreshFromDirty || selectedFolderId !== ROOT_GALLERY_FOLDER_ID
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
    isInitialPage && selectedFolderId === ROOT_GALLERY_FOLDER_ID && hydratedInitialPhotos.length > 0
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
    const nextRootFolderName =
      typeof data?.root_folder_name === 'string' && data.root_folder_name.trim()
        ? data.root_folder_name.trim()
        : rootFolderName;

    if (nextRootFolderName !== rootFolderName) {
      setRootFolderName(nextRootFolderName);
    }

    if (Array.isArray(data?.folders) || nextRootFolderName !== rootFolderName) {
      setFolders((previousFolders) =>
        buildGalleryFolderList(
          Array.isArray(data?.folders) ? data.folders : previousFolders,
          nextRootFolderName,
          previousFolders
        )
      );
    }
  }, [data?.folders, data?.root_folder_name, rootFolderName]);

  useEffect(() => {
    if (!data?.photos) return;

    if (page === 1) {
      isLoadingMoreRef.current = false;
      setAllPhotos(data.photos);
      setHasMore(data.photos.length >= pageSize && data.photos.length < data.total);
      setIsLoadingMore(false);
      setIsSwitchingTag(false);
      return;
    }

    setAllPhotos(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const newPhotos = data.photos.filter((p: Photo) => !existingIds.has(p.id));
      const updatedPhotos = [...prev, ...newPhotos];
      setHasMore(data.photos.length >= pageSize && updatedPhotos.length < data.total);
      return updatedPhotos;
    });
    setIsLoadingMore(false);
  }, [data?.photos, data?.total, page, pageSize]);

  useEffect(() => {
    if (!error) {
      return;
    }

    isLoadingMoreRef.current = false;
    setIsLoadingMore(false);
    setIsSwitchingTag(false);
  }, [error]);

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedFolderId]);

  // 缓存首页照片墙数据，用于下次进入秒开
  useEffect(() => {
    if (selectedFolderId !== ROOT_GALLERY_FOLDER_ID) return;
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
    if (selectedFolderId !== ROOT_GALLERY_FOLDER_ID) return;
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

  const requestNextPage = useCallback(() => {
    if (isLoading || isLoadingMoreRef.current || !hasMore) {
      return false;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    setPage((prev) => prev + 1);
    return true;
  }, [hasMore, isLoading]);

  const evaluateScrollPagination = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || isLoading || isLoadingMoreRef.current || !hasMore) {
      return false;
    }

    const scrollTop = Number(scrollContainer.scrollTop || 0);
    const viewportHeight = Number(scrollContainer.clientHeight || 0);
    const pageHeight = Number(scrollContainer.scrollHeight || 0);

    if (!(viewportHeight > 0) || !(pageHeight > 0)) {
      return false;
    }

    if (pageHeight <= viewportHeight + GALLERY_VIEWPORT_FILL_BUFFER_PX) {
      return requestNextPage();
    }

    const scrollProgress = (scrollTop + viewportHeight) / pageHeight;
    if (scrollProgress >= GALLERY_SCROLL_LOAD_TRIGGER_PROGRESS) {
      return requestNextPage();
    }

    return false;
  }, [hasMore, isLoading, requestNextPage]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) {
      return;
    }

    let rafId = 0;
    const handleScroll = () => {
      if (rafId) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        evaluateScrollPagination();
      });
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      scrollContainer.removeEventListener('scroll', handleScroll);
    };
  }, [evaluateScrollPagination, selectedFolderId]);

  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMore || photos.length === 0) {
      return;
    }

    const timer = window.setTimeout(() => {
      evaluateScrollPagination();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [evaluateScrollPagination, hasMore, isLoading, isLoadingMore, photos.length, selectedFolderId]);



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


  const tagFolders = useMemo<GalleryFolder[]>(() => {
    return folders;
  }, [folders]);

  const selectorFolders = useMemo<GalleryFolder[]>(() => {
    return folders;
  }, [folders]);

  const clearTagWaveTimer = useCallback(() => {
    tagWaveRunTokenRef.current += 1;
    if (tagWaveTimerRef.current) {
      window.clearTimeout(tagWaveTimerRef.current);
      tagWaveTimerRef.current = null;
    }
    setTagWaveActiveIndex(-1);
    setTagWaveTick(0);
  }, []);

  const startTagWaveAnimation = useCallback(() => {
    clearTagWaveTimer();
    const folderCount = tagFolders.length;
    if (folderCount <= 0) {
      return;
    }

    const runToken = tagWaveRunTokenRef.current;
    let round = 0;
    let index = 0;
    let tick = 0;

    const schedule = (delayMs: number, task: () => void) => {
      tagWaveTimerRef.current = window.setTimeout(() => {
        if (runToken !== tagWaveRunTokenRef.current) {
          return;
        }
        task();
      }, delayMs);
    };

    const triggerNext = () => {
      if (runToken !== tagWaveRunTokenRef.current) {
        return;
      }

      if (round >= TAG_WAVE_ROUNDS) {
        setTagWaveActiveIndex(-1);
        setTagWaveTick(0);
        tagWaveTimerRef.current = null;
        return;
      }

      tick = tick === 1 ? 0 : 1;
      const nextIndex = index;
      index += 1;

      let nextDelay = TAG_WAVE_STEP_DELAY_MS;
      if (index >= folderCount) {
        index = 0;
        round += 1;
        if (round < TAG_WAVE_ROUNDS) {
          nextDelay += TAG_WAVE_ROUND_GAP_MS;
        }
      }

      setTagWaveActiveIndex(nextIndex);
      setTagWaveTick(tick);
      schedule(nextDelay, triggerNext);
    };

    setTagWaveActiveIndex(-1);
    schedule(120, triggerNext);
  }, [clearTagWaveTimer, tagFolders.length]);

  const dismissTagGuide = useCallback(() => {
    if (tagGuideTimerRef.current) {
      window.clearTimeout(tagGuideTimerRef.current);
      tagGuideTimerRef.current = null;
    }
    clearTagWaveTimer();
    setShowTagGuide(false);
  }, [clearTagWaveTimer]);

  const handleSwitchFolder = useCallback(
    (folderId: string) => {
      dismissTagGuide();
      const nextFolderId = String(folderId || ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID;
      if (nextFolderId === selectedFolderId) {
        return;
      }

      isLoadingMoreRef.current = false;
      setIsSwitchingTag(true);
      setPage(1);
      setAllPhotos([]);
      setHasMore(true);
      setIsLoadingMore(false);
      setStoryOpenMap({});
      setPhotoAspectRatioMap({});
      setPreviewPhoto(null);
      setFullscreenPhoto(null);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      setSelectedFolderId(nextFolderId);
    },
    [dismissTagGuide, selectedFolderId]
  );

  const openFolderSelector = useCallback(() => {
    dismissTagGuide();
    setTempFolderId(selectedFolderId);

    const targetButton = folderButtonRefs.current[selectedFolderId];
    if (targetButton) {
      targetButton.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }

    setShowFolderSelector(true);
  }, [dismissTagGuide, selectedFolderId]);

  const closeFolderSelector = useCallback(() => {
    setShowFolderSelector(false);
    setTempFolderId(selectedFolderId);
  }, [selectedFolderId]);

  const handleResetFolderSelector = useCallback(() => {
    setTempFolderId(ROOT_GALLERY_FOLDER_ID);
  }, []);

  const handleApplyFolderSelector = useCallback(() => {
    setShowFolderSelector(false);
    if (tempFolderId !== selectedFolderId) {
      handleSwitchFolder(tempFolderId);
    }
  }, [handleSwitchFolder, selectedFolderId, tempFolderId]);

  const setFolderButtonRef = useCallback(
    (folderId: string) => (node: HTMLButtonElement | null) => {
      folderButtonRefs.current[folderId] = node;
    },
    []
  );

  useEffect(() => {
    const targetButton = folderButtonRefs.current[selectedFolderId];
    if (!targetButton) {
      return;
    }

    targetButton.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selectedFolderId, tagFolders.length]);

  useEffect(() => {
    dismissTagGuide();

    if (tagGuideShownOnceRef.current || isLoading || isLoadingMore || tagFolders.length <= 1) {
      return;
    }

    tagGuideShownOnceRef.current = true;
    setShowTagGuide(true);
    startTagWaveAnimation();
    tagGuideTimerRef.current = window.setTimeout(() => {
      dismissTagGuide();
    }, TAG_GUIDE_AUTO_DISMISS_MS);

    return () => {
      if (tagGuideTimerRef.current) {
        window.clearTimeout(tagGuideTimerRef.current);
        tagGuideTimerRef.current = null;
      }
      clearTagWaveTimer();
    };
  }, [clearTagWaveTimer, dismissTagGuide, tagFolders.length, isLoading, isLoadingMore, startTagWaveAnimation]);

  const handlePhotoRatioReady = useCallback((photoId: string, dimensions: { width: number; height: number }) => {
    const nextRatio = resolveLoadedPhotoAspectRatio(dimensions.width, dimensions.height, 1);
    setPhotoAspectRatioMap((prev) => {
      const currentRatio = prev[photoId];
      if (typeof currentRatio === 'number' && Math.abs(currentRatio - nextRatio) < 0.01) {
        return prev;
      }
      return {
        ...prev,
        [photoId]: nextRatio,
      };
    });
  }, []);

  const resolvePhotoAspectRatio = useCallback(
    (photo: Photo) => photoAspectRatioMap[photo.id] ?? clampPhotoAspectRatio(photo.width, photo.height, 1),
    [photoAspectRatioMap]
  );

  

  const loadingTitle = backendState.backendReconnecting || isSwitchingTag ? '时光中...' : '加载中...';
  const loadingDescription = backendState.backendReconnecting
    ? '重连服务器中，请等待'
    : isSwitchingTag
      ? '正在切换照片标签'
      : '正在加载照片墙';

  const showPageLoading = (isLoading && allPhotos.length === 0) || isSwitchingTag;

  const galleryMasonryItems = useMemo(
    () => photos.map((photo, index) => ({ photo, index })),
    [photos]
  );

  const { columns: galleryColumns } = useStableMasonryColumns({
    items: galleryMasonryItems,
    getItemId: ({ photo }) => photo.id,
    estimateItemHeight: ({ photo }) => estimateGalleryCardHeight(
      photo,
      Boolean(storyOpenMap[photo.id]),
      resolvePhotoAspectRatio(photo)
    ),
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFFBF0] px-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="flex flex-col items-center gap-5"
        >
          <div className="relative h-24 w-24">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-[5px] border-[#FFC857]/30 border-t-[#FFC857]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-[12px] rounded-full border-[5px] border-[#5D4037]/20 border-b-[#5D4037]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFFBF0] shadow-[0_4px_14px_rgba(93,64,55,0.08)]">
                <Camera className="h-7 w-7 text-[#FFC857]" />
              </div>
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-center"
          >
            <p className="mb-1.5 text-[20px] font-extrabold text-[#5D4037]">
              {loadingTitle}
            </p>
            <p className="text-[13px] text-[#5D4037]/60">
              {loadingDescription}
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#FFFBF0]">
      {/* 照片墙页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/96 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/10 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 pt-[11px] pb-[10px]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                照片墙
              </h1>
            </div>
            <div className="inline-flex shrink-0 items-center rounded-full bg-[#FFC857]/24 px-[10px] py-[5px] text-[10px] font-bold leading-none text-[#8D6E63] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
              ✨ 贩卖人间路过的温柔 ✨
            </div>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pb-20 gallery-scroll-container">
        <div className="sticky top-0 z-20 border-b border-[#5D4037]/5 bg-[#FFFBF0]">
          <div className="px-[3px] py-0">
            <div className={`flex min-h-[46px] gap-1 ${showTagGuide ? 'items-start' : 'items-center'}`}>
              <div className={`relative min-w-0 flex-1 border-x border-[#FFFBF0] bg-[#FFFBF0] ${showTagGuide ? 'pt-[36px]' : ''}`}>
                <AnimatePresence>
                  {showTagGuide && (
                    <motion.button
                      type="button"
                      initial={{ opacity: 0, y: -6, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -6, scale: 0.98 }}
                      transition={{ duration: 0.18 }}
                      onClick={dismissTagGuide}
                      className="compact-button absolute left-0 top-0 z-[3] inline-flex h-[26px] max-w-[190px] items-center rounded-[7px] bg-[#5D4037] px-[9px] text-left shadow-[0_5px_12px_rgba(93,64,55,0.28)]"
                    >
                      <span className="whitespace-nowrap text-[10px] font-semibold leading-none text-[#FFFAF0]">
                        左右滑动 / 点击标签可切换
                      </span>
                      <span className="absolute bottom-[-4px] left-[11px] h-[8px] w-[8px] rotate-45 bg-[#5D4037]" />
                    </motion.button>
                  )}
                </AnimatePresence>
                <div className="scrollbar-hidden overflow-x-auto whitespace-nowrap" onScroll={showTagGuide ? dismissTagGuide : undefined}>
                  <div className="inline-flex items-center gap-2 px-0 py-0">
                    {tagFolders.map((folder, index) => {
                      const isWaveActive = showTagGuide && tagWaveActiveIndex === index;
                      return (
                        <motion.button
                          key={folder.id}
                          type="button"
                          ref={setFolderButtonRef(String(folder.id))}
                          onClick={() => handleSwitchFolder(String(folder.id))}
                          initial={false}
                          animate={isWaveActive ? (tagWaveTick === 1 ? 'waveA' : 'waveB') : 'idle'}
                          variants={TAG_WAVE_BUTTON_VARIANTS}
                          className={`tag-button inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-xs font-bold leading-none transition-all duration-200 active:scale-[0.98] md:px-3 md:py-1.5 ${
                            selectedFolderId === String(folder.id)
                              ? 'border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0_rgba(93,64,55,0.15)]'
                              : 'border-[#5D4037]/15 bg-white/60 text-[#5D4037]/60 hover:border-[#5D4037]/30 hover:text-[#5D4037]'
                          }`}
                          aria-pressed={selectedFolderId === String(folder.id)}
                        >
                          {folder.name}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>
                </div>
                <button
                  type="button"
                  onClick={openFolderSelector}
                  aria-haspopup="dialog"
                  aria-expanded={showFolderSelector}
                  className="tag-button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#5D4037] bg-[#5D4037] px-2 py-0.5 text-xs font-bold leading-none text-white transition-all duration-200 hover:bg-[#6A4B41] active:scale-[0.98] active:opacity-92 md:px-3 md:py-1.5"
                >
                  全部
                </button>
            </div>
          </div>
        </div>


        <div className="px-3 pt-3">
        {photos.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22 }}
            className="py-14 text-center"
          >
            <p className="text-[13px] text-[#5D4037]/50">暂无照片</p>
          </motion.div>
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
                  transition={{ delay: Math.min(index, 10) * 0.04 }}
                  className="min-w-0"
                >
                  {/* 小红书风格卡片 */}
                  <div
                    className={`bg-white rounded-[12px] overflow-hidden transition-all duration-300 ${
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
                            aspectRatio={resolvePhotoAspectRatio(photo)}
                            onLoadDimensions={({ width, height }) => handlePhotoRatioReady(photo.id, { width, height })}
                            className="gallery-card-image w-full"
                          />

                          {/* 顶部统计胶囊 */}
                          <div className="absolute left-[6px] top-[6px] z-[3] inline-flex items-center gap-[5px] rounded-full bg-[linear-gradient(135deg,rgba(56,47,43,0.66),rgba(28,23,21,0.46))] px-[7px] py-[3px] shadow-[0_5px_12px_rgba(0,0,0,0.14)] backdrop-blur-[8px]">
                            <span className="inline-flex items-center gap-[2px]">
                              <Eye className="h-[9px] w-[9px] text-white/88" />
                              <span className="text-[9px] font-semibold leading-none text-white/95">{photo.view_count}</span>
                            </span>
                            <span className="h-[9px] w-px bg-white/18" />
                            <motion.button
                              whileTap={{ scale: 0.94 }}
                              onClick={(e) => handleLike(photo.id, e)}
                              className="compact-button inline-flex min-h-0 appearance-none items-center gap-[2px] border-0 bg-transparent p-0 text-white/95 shadow-none outline-none transition-all duration-200 active:opacity-90"
                              aria-label="????"
                              title="????"
                            >
                              <motion.div
                                animate={photo.is_liked ? { scale: [1, 1.16, 1] } : {}}
                                transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                              >
                                <Heart
                                  className={`h-[9px] w-[9px] transition-all duration-300 ${
                                    photo.is_liked ? 'fill-[#FFC857] text-[#FFC857]' : 'text-white/80'
                                  }`}
                                />
                              </motion.div>
                              <span className="text-[9px] font-semibold leading-none text-white/95">
                                {photo.like_count}
                              </span>
                            </motion.button>
                          </div>

                        </div>
                      )}

                      {hasStory(photo) && (
                        <button
                          onClick={(e) => toggleStoryCard(photo.id, e)}
                          className={`absolute right-[5px] top-[5px] flex h-[25px] w-[25px] items-center justify-center rounded-full border backdrop-blur-sm transition-all active:scale-95 ${
                            isHighlighted(photo)
                              ? 'bg-gradient-to-br from-[#FFD76E] to-[#FFC857] border-[1.5px] border-[#5D4037]/45 text-[#5D4037] shadow-[0_0_0_1px_rgba(255,229,156,0.9),0_5px_12px_rgba(255,183,3,0.55)] animate-pulse'
                              : 'bg-black/38 border border-white/45 text-white'
                          }`}
                          aria-label="查看此刻"
                          title="查看此刻"
                        >
                          <RotateCcw
                            className={`h-[13px] w-[13px] transition-transform duration-200 ${
                              storyOpenMap[photo.id] ? 'rotate-180' : ''
                            } ${isHighlighted(photo) ? 'drop-shadow-[0_0.5px_0_rgba(255,255,255,0.55)]' : ''}`}
                          />
                        </button>
                      )}
                    </div>

                    {/* 底部信息白框：对标微信小程序 */}
                    <div className="px-[6px] pt-[5px] pb-[5px] leading-none">
                      <div className="flex h-[10px] w-full items-center justify-between gap-[6px] overflow-hidden">
                        <div className="min-w-0 flex flex-1 items-center gap-[2px] overflow-hidden">
                          <MapPin className="h-[9px] w-[9px] shrink-0 text-[#FFC857]" strokeWidth={2.2} />
                          <span className="truncate whitespace-nowrap text-[9px] leading-none text-[#8D6E63]/84">
                            {resolveGalleryShotLocation(photo.shot_location)}
                          </span>
                        </div>
                        <span className="ml-[6px] shrink-0 whitespace-nowrap text-[9px] leading-none text-[#8D6E63]/68">
                          {formatGalleryMetaDate(photo.shot_date || photo.created_at) || '--'}
                        </span>
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
                className="mt-6 flex items-center justify-center gap-3"
              >
                <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-[#FFC857]/40 border-t-[#FFC857]" />
                <p className="text-[13px] font-bold text-[#5D4037]/60">拾光中...</p>
              </motion.div>
            )}

            {/* 到底提示 */}
            {!hasMore && allPhotos.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-6 text-center"
              >
                <p className="text-[13px] text-[#5D4037]/40">✨ 已经到底啦 ✨</p>
              </motion.div>
            )}
          </>
        )}
      </div>
      </div>

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
                  <div className="mb-3 flex items-center justify-center gap-3 text-[#5D4037]">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[#5D4037]/6 px-3 py-2 text-[#5D4037]/82">
                      <Eye className="h-4 w-4" />
                      <span className="text-sm font-medium">{previewPhoto.view_count} {'\u6b21\u6d4f\u89c8'}</span>
                    </div>
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      whileHover={{ y: -1 }}
                      onClick={(e) => handleLike(previewPhoto.id, e)}
                      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 shadow-[0_8px_20px_rgba(93,64,55,0.10)] transition-all ${
                        previewPhoto.is_liked
                          ? 'border-[#FFD76E] bg-[linear-gradient(135deg,#FFE39A,#FFC857)] text-[#5D4037]'
                          : 'border-[#FFC857]/55 bg-[linear-gradient(135deg,#FFF8E4,#FFFDF7)] text-[#5D4037] hover:border-[#FFC857] hover:bg-[linear-gradient(135deg,#FFF1C5,#FFF8E4)]'
                      }`}
                      aria-label={previewPhoto.is_liked ? '\u5df2\u70b9\u8d5e' : '\u70b9\u4e2a\u8d5e'}
                      title={previewPhoto.is_liked ? '\u5df2\u70b9\u8d5e' : '\u70b9\u4e2a\u8d5e'}
                    >
                      <Heart className={`h-4 w-4 ${previewPhoto.is_liked ? 'fill-[#5D4037] text-[#5D4037]' : 'text-[#C97A51]'}`} />
                      <span className="text-sm font-semibold">{previewPhoto.is_liked ? '\u5df2\u70b9\u8d5e' : '\u70b9\u4e2a\u8d5e'}</span>
                      <span className={`rounded-full px-2 py-[2px] text-[11px] font-bold leading-none ${
                        previewPhoto.is_liked ? 'bg-white/40 text-[#5D4037]' : 'bg-[#FFC857]/18 text-[#8D6E63]'
                      }`}>
                        {previewPhoto.like_count}
                      </span>
                    </motion.button>
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
      <AnimatePresence>
        {showFolderSelector && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={closeFolderSelector}
              aria-label="关闭全部筛选"
              className="fixed inset-0 z-40 bg-[#5D4037]/18 backdrop-blur-[2px]"
            />
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-x-3 top-[118px] z-50 mx-auto max-w-[420px]"
            >
              <div
                onClick={(e) => e.stopPropagation()}
                className="overflow-hidden rounded-[20px] border border-[#5D4037]/8 bg-[#FFFDF7] shadow-[0_18px_44px_rgba(93,64,55,0.18)]"
              >
                <div className="flex items-center justify-between border-b border-[#5D4037]/6 px-4 py-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-[#5D4037]">全部筛选</h3>
                    <p className="mt-1 text-[11px] text-[#8D6E63]/72">选择你想看的标签分类</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeFolderSelector}
                    aria-label="关闭全部筛选"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5D4037]/8 text-[20px] leading-none text-[#5D4037] transition-colors hover:bg-[#5D4037]/12"
                  >
                    ×
                  </button>
                </div>
                <div className="max-h-[50vh] overflow-y-auto px-4 py-4">
                  <p className="mb-3 text-[12px] font-semibold text-[#8D6E63]/80">标签</p>
                  <div className="flex flex-wrap gap-2">
                    {selectorFolders.map((folder) => {
                      const isActive = tempFolderId === String(folder.id);
                      return (
                        <button
                          key={`selector-${folder.id}`}
                          type="button"
                          onClick={() => setTempFolderId(String(folder.id))}
                          className={`inline-flex min-h-[32px] items-center justify-center rounded-full px-3 text-[12px] font-semibold leading-none transition-all duration-200 active:scale-[0.98] ${
                            isActive
                              ? 'border-[1.5px] border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037] shadow-[1.5px_1.5px_0_rgba(93,64,55,0.12)]'
                              : 'border-[1.5px] border-[#5D4037]/15 bg-white text-[#5D4037]/70 hover:border-[#5D4037]/28 hover:text-[#5D4037]'
                          }`}
                        >
                          {folder.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex gap-2 border-t border-[#5D4037]/6 bg-white/55 px-4 py-3">
                  <button
                    type="button"
                    onClick={handleResetFolderSelector}
                    className="flex-1 rounded-full bg-[#5D4037]/8 px-4 py-[10px] text-[12px] font-semibold text-[#5D4037] transition-colors hover:bg-[#5D4037]/12"
                  >
                    重置
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFolderSelector}
                    className="flex-1 rounded-full bg-[#5D4037] px-4 py-[10px] text-[12px] font-semibold text-white transition-colors hover:bg-[#6A4B41]"
                  >
                    确定
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
