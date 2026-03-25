'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Eye, Camera, MapPin, X } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { getSessionId } from '@/lib/utils/session';
import { vibrate } from '@/lib/android';
import { formatDateDisplayUTC8, getTodayUTC8, parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import {
  GALLERY_PAGE_CACHE_KEY,
  clearGalleryPageCacheStorage,
  consumeGalleryCacheDirtyFlag,
} from '@/lib/gallery/cache-sync';
import { getBackendRecoveryState, subscribeBackendRecovery } from '@/lib/backend-recovery';

import SimpleImage from '@/components/ui/SimpleImage';
import ImagePreview from '@/components/ImagePreview';
import { useStableMasonryColumns } from '@/lib/hooks/useStableMasonryColumns';
import PageTopHeader from '@/components/PageTopHeader';

interface Photo {
  id: string;
  folder_id: string | null;
  thumbnail_url: string;  // 速览图 URL
  preview_url: string;    // 高质量预览 URL
  original_url: string;   // 原图 URL（用于下载）
  story_text?: string | null;
  has_story?: boolean;
  story_highlight?: boolean;
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

type GallerySortMode = 'time_desc' | 'time_asc';
type GalleryFilterMode = 'all' | 'highlight' | 'story';
type GalleryFilterPreset = 'default_desc' | 'time_asc' | 'highlight' | 'story';

const GALLERY_FILTER_PRESET_OPTIONS: Array<{ preset: GalleryFilterPreset; label: string }> = [
  { preset: 'default_desc', label: '时间降序' },
  { preset: 'time_asc', label: '时间升序' },
  { preset: 'highlight', label: '高亮' },
  { preset: 'story', label: '故事' },
];

const ROOT_GALLERY_FOLDER_ID = '__ROOT__';

const TAG_GUIDE_AUTO_DISMISS_MS = 15000;
const GALLERY_SCROLL_LOAD_TRIGGER_PROGRESS = 0.8;
const GALLERY_VIEWPORT_FILL_BUFFER_PX = 24;
const TAG_WAVE_ROUNDS = 3;
const TAG_WAVE_STEP_DELAY_MS = 380;
const TAG_WAVE_ROUND_GAP_MS = 240;
const GALLERY_STORY_PANEL_MIN_HEIGHT = 146;
const GALLERY_STORY_PAPER_MIN_HEIGHT = 129;
const GALLERY_STORY_BASE_TEXT_HEIGHT = 92;
const GALLERY_STORY_LINE_HEIGHT = 22;
const GALLERY_STORY_CHARS_PER_LINE = 14;
const GALLERY_TIMELINE_SINGLE_COLUMN_BREAKPOINT = 768;
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

function estimateGalleryTextLines(value: unknown, charsPerLine: number = GALLERY_STORY_CHARS_PER_LINE) {
  const text = String(value ?? '').trim();
  if (!text) {
    return 0;
  }

  const perLine = Math.max(8, Number(charsPerLine || 0) || GALLERY_STORY_CHARS_PER_LINE);
  return text
    .split(/\r?\n/)
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.trim().length / perLine)), 0);
}

function estimateGalleryCardHeight(photo: Photo, isStoryOpen: boolean, aspectRatio?: number) {
  const hasStoryText = Boolean(String(photo.story_text || '').trim());
  const resolvedAspectRatio = Number.isFinite(Number(aspectRatio)) && Number(aspectRatio) > 0
    ? Number(aspectRatio)
    : clampPhotoAspectRatio(photo.width, photo.height, 1);
  const mediaHeight = isStoryOpen && hasStoryText
    ? Math.max(
        GALLERY_STORY_PANEL_MIN_HEIGHT,
        GALLERY_STORY_BASE_TEXT_HEIGHT + estimateGalleryTextLines(photo.story_text, GALLERY_STORY_CHARS_PER_LINE) * GALLERY_STORY_LINE_HEIGHT
      )
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

interface GalleryRootCachePayload {
  photos: Photo[];
  total: number;
  folders: GalleryFolder[];
  rootFolderName: string;
  cachedAt: number;
}

const createEmptyGalleryRootCache = (): GalleryRootCachePayload => ({
  photos: [],
  total: 0,
  folders: [],
  rootFolderName: '根目录',
  cachedAt: 0,
});

function resolveGalleryRootFolderName(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return normalized || '根目录';
}

function hasGalleryRootCacheContent(cache: Pick<GalleryRootCachePayload, 'photos' | 'folders'>): boolean {
  return cache.photos.length > 0 || cache.folders.length > 1;
}

let galleryMemoryCache: GalleryRootCachePayload = createEmptyGalleryRootCache();

const readGalleryMemoryCache = (): Omit<GalleryRootCachePayload, 'cachedAt'> | null => {
  if (!hasGalleryRootCacheContent(galleryMemoryCache)) return null;

  const isExpired = Date.now() - galleryMemoryCache.cachedAt > GALLERY_MEMORY_CACHE_TTL;
  if (isExpired) {
    galleryMemoryCache = createEmptyGalleryRootCache();
    return null;
  }

  const normalizedRootFolderName = resolveGalleryRootFolderName(galleryMemoryCache.rootFolderName);

  return {
    photos: galleryMemoryCache.photos.map((photo) => ({ ...photo })),
    total: galleryMemoryCache.total,
    folders: buildGalleryFolderList(galleryMemoryCache.folders, normalizedRootFolderName),
    rootFolderName: normalizedRootFolderName,
  };
};

const writeGalleryMemoryCache = (
  photos: Photo[],
  total: number,
  folders: GalleryFolder[],
  rootFolderName: string
) => {
  const normalizedRootFolderName = resolveGalleryRootFolderName(rootFolderName);
  const normalizedFolders = buildGalleryFolderList(folders, normalizedRootFolderName);

  if (photos.length === 0 && normalizedFolders.length <= 1) {
    galleryMemoryCache = createEmptyGalleryRootCache();
    return;
  }

  galleryMemoryCache = {
    photos: photos.map((photo) => ({ ...photo })),
    total,
    folders: normalizedFolders.map((folder) => ({ ...folder })),
    rootFolderName: normalizedRootFolderName,
    cachedAt: Date.now(),
  };
};

const clearGalleryMemoryCache = () => {
  galleryMemoryCache = createEmptyGalleryRootCache();
};

function appendUniquePhotos(currentPhotos: Photo[], incomingPhotos: Photo[]): Photo[] {
  if (currentPhotos.length === 0) {
    return incomingPhotos.slice();
  }

  if (incomingPhotos.length === 0) {
    return currentPhotos;
  }

  const existingIds = new Set(currentPhotos.map((photo) => String(photo.id)));
  const incremental = incomingPhotos.filter((photo) => !existingIds.has(String(photo.id)));

  return incremental.length > 0 ? currentPhotos.concat(incremental) : currentPhotos;
}

function normalizeDateOnlyText(value: unknown): string {
  const raw = String(value ?? '').trim();
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return matched ? `${matched[1]}-${matched[2]}-${matched[3]}` : '';
}

function getGalleryPhotoDateText(photo: Photo): string {
  const parsed = parseDateTimeUTC8(photo.shot_date || photo.created_at);
  if (!parsed) {
    return '';
  }
  const shifted = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getGalleryPhotoTimeValue(photo: Photo): number {
  const parsed = parseDateTimeUTC8(photo.shot_date || photo.created_at);
  return parsed ? parsed.getTime() : 0;
}

function resolveGalleryFilterPreset(preset: string): {
  preset: GalleryFilterPreset;
  sortMode: GallerySortMode;
  filterMode: GalleryFilterMode;
} {
  const normalized = String(preset || '').trim();
  if (normalized === 'time_asc') {
    return { preset: 'time_asc', sortMode: 'time_asc', filterMode: 'all' };
  }
  if (normalized === 'highlight') {
    return { preset: 'highlight', sortMode: 'time_desc', filterMode: 'highlight' };
  }
  if (normalized === 'story') {
    return { preset: 'story', sortMode: 'time_desc', filterMode: 'story' };
  }
  return { preset: 'default_desc', sortMode: 'time_desc', filterMode: 'all' };
}

function getActiveGalleryFilterPreset(filterMode: GalleryFilterMode, sortMode: GallerySortMode): GalleryFilterPreset {
  if (filterMode === 'highlight') return 'highlight';
  if (filterMode === 'story') return 'story';
  if (sortMode === 'time_asc') return 'time_asc';
  return 'default_desc';
}

function hasGalleryStory(photo: Photo): boolean {
  return Boolean(photo.has_story) || Boolean(String(photo.story_text || '').trim());
}

function isGalleryPhotoHighlighted(photo: Photo): boolean {
  return Boolean(photo.story_highlight) || Boolean(photo.is_highlight) || hasGalleryStory(photo);
}

export default function GalleryClient({ initialPhotos = [], initialTotal = 0, initialPage = 1 }: GalleryClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [selectedFolderId, setSelectedFolderId] = useState<string>(ROOT_GALLERY_FOLDER_ID);
  const [folders, setFolders] = useState<GalleryFolder[]>(() => buildGalleryFolderList([], '根目录'));
  const [rootFolderName, setRootFolderName] = useState<string>('根目录');
  const [backendState, setBackendState] = useState(getBackendRecoveryState);
  const [showTagGuide, setShowTagGuide] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>('time_desc');
  const [filterMode, setFilterMode] = useState<GalleryFilterMode>('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [tempFolderId, setTempFolderId] = useState<string>(ROOT_GALLERY_FOLDER_ID);
  const [tempFilterPreset, setTempFilterPreset] = useState<GalleryFilterPreset>('default_desc');
  const [tempFilterDateStart, setTempFilterDateStart] = useState('');
  const [tempFilterDateEnd, setTempFilterDateEnd] = useState('');
  const [filterModalError, setFilterModalError] = useState('');
  const [storyOpenMap, setStoryOpenMap] = useState<Record<string, boolean>>({});
  const [photoAspectRatioMap, setPhotoAspectRatioMap] = useState<Record<string, number>>({});
  const [isSwitchingTag, setIsSwitchingTag] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(0);
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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const updateViewportWidth = () => {
      setViewportWidth(window.innerWidth || 0);
    };

    updateViewportWidth();
    window.addEventListener('resize', updateViewportWidth);
    return () => window.removeEventListener('resize', updateViewportWidth);
  }, []);

  const shouldForceRefreshFromDirty = galleryCacheToken !== 'default';
  const memoryGallery =
    initialPhotos.length > 0 || shouldForceRefreshFromDirty
      ? null
      : readGalleryMemoryCache();
  const hydratedInitialPhotos = memoryGallery?.photos ?? initialPhotos;
  const hydratedInitialTotal = memoryGallery?.total ?? initialTotal;
  const hydratedInitialPage = memoryGallery ? 1 : initialPage;

  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [page, setPage] = useState(hydratedInitialPage);
  const [allPhotos, setAllPhotos] = useState<Photo[]>(hydratedInitialPhotos);
  const [total, setTotal] = useState(hydratedInitialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(hydratedInitialTotal > hydratedInitialPhotos.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const isLoadingMoreRef = useRef(false);
  const hasClientInitialFetchStartedRef = useRef(false);
  const loadRequestTokenRef = useRef(0);
  const allPhotosRef = useRef<Photo[]>(hydratedInitialPhotos);
  const pageRef = useRef(hydratedInitialPage);
  const selectedFolderIdRef = useRef(selectedFolderId);
  const pageSize = 20;
  const GALLERY_CACHE_KEY = `${GALLERY_PAGE_CACHE_KEY}_${selectedFolderId}`;
  const maxFilterDate = useMemo(() => getTodayUTC8(), []);
  const activeFilterPreset = useMemo(
    () => getActiveGalleryFilterPreset(filterMode, sortMode),
    [filterMode, sortMode]
  );
  const normalizedFilterDateStart = normalizeDateOnlyText(filterDateStart);
  const normalizedFilterDateEnd = normalizeDateOnlyText(filterDateEnd);
  const photos = useMemo(() => {
    let viewRows = Array.isArray(allPhotos) ? allPhotos.slice() : [];

    if (normalizedFilterDateStart || normalizedFilterDateEnd) {
      viewRows = viewRows.filter((photo) => {
        const photoDate = getGalleryPhotoDateText(photo);
        if (!photoDate) return false;
        if (normalizedFilterDateStart && photoDate < normalizedFilterDateStart) return false;
        if (normalizedFilterDateEnd && photoDate > normalizedFilterDateEnd) return false;
        return true;
      });
    }

    if (filterMode === 'highlight') {
      viewRows = viewRows.filter((photo) => isGalleryPhotoHighlighted(photo));
    } else if (filterMode === 'story') {
      viewRows = viewRows.filter((photo) => hasGalleryStory(photo));
    }

    return viewRows.slice().sort((photoA, photoB) => {
      const timeA = getGalleryPhotoTimeValue(photoA);
      const timeB = getGalleryPhotoTimeValue(photoB);
      if (timeA !== timeB) {
        return sortMode === 'time_asc' ? timeA - timeB : timeB - timeA;
      }

      return String(photoB.created_at || '').localeCompare(String(photoA.created_at || ''), 'zh-CN');
    });
  }, [allPhotos, filterMode, normalizedFilterDateEnd, normalizedFilterDateStart, sortMode]);

  useEffect(() => {
    allPhotosRef.current = allPhotos;
    pageRef.current = page;
    selectedFolderIdRef.current = selectedFolderId;
    if (selectedFolderId === ROOT_GALLERY_FOLDER_ID) {
      writeGalleryMemoryCache(allPhotos, Math.max(total, allPhotos.length), folders, rootFolderName);
    }
  }, [allPhotos, folders, page, rootFolderName, selectedFolderId, total]);

  useEffect(() => {
    if (selectedFolderId !== ROOT_GALLERY_FOLDER_ID) return;
    if (!memoryGallery) return;

    const nextRootFolderName = resolveGalleryRootFolderName(memoryGallery.rootFolderName);
    const nextFolders = buildGalleryFolderList(memoryGallery.folders, nextRootFolderName);
    const hasFolderChanges =
      nextRootFolderName !== rootFolderName
      || nextFolders.length !== folders.length
      || nextFolders.some((folder, index) => {
        const currentFolder = folders[index];
        return !currentFolder || currentFolder.id !== folder.id || currentFolder.name !== folder.name;
      });

    if (!hasFolderChanges) return;

    setRootFolderName(nextRootFolderName);
    setFolders(nextFolders);
  }, [folders, memoryGallery, rootFolderName, selectedFolderId]);

  const loadGalleryPage = useCallback(
    async (pageNo: number, options?: { silent?: boolean; folderId?: string }) => {
      const silent = Boolean(options?.silent);
      const targetFolderId =
        String(options?.folderId ?? selectedFolderIdRef.current ?? ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID;
      const isFirstPage = pageNo === 1;
      const requestToken = loadRequestTokenRef.current + 1;
      loadRequestTokenRef.current = requestToken;

      if (isFirstPage) {
        if (!silent) {
          setIsLoading(true);
        }
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      } else {
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
      }

      try {
        const dbClient = createClient();
        if (!dbClient) {
          throw new Error('数据库客户端不可用');
        }

        const { data, error } = await dbClient.rpc('get_public_gallery', {
          page_no: pageNo,
          page_size: pageSize,
          folder_id: targetFolderId,
        });

        if (error) {
          throw error;
        }

        if (requestToken !== loadRequestTokenRef.current) {
          return;
        }

        const payload = data ?? {};
        const pagePhotos = Array.isArray(payload.photos) ? (payload.photos as Photo[]) : [];
        const nextTotal = Math.max(0, Number(payload.total ?? 0) || 0);
        const nextRootFolderName =
          typeof payload.root_folder_name === 'string' && payload.root_folder_name.trim()
            ? payload.root_folder_name.trim()
            : rootFolderName;
        const nextFolders = buildGalleryFolderList(
          Array.isArray(payload.folders) ? payload.folders : folders,
          nextRootFolderName,
          folders
        );
        const mergedPhotos = isFirstPage
          ? pagePhotos
          : appendUniquePhotos(allPhotosRef.current, pagePhotos);
        const hasKnownTotal = nextTotal > 0;
        const nextHasMore = hasKnownTotal
          ? pagePhotos.length >= pageSize && mergedPhotos.length < nextTotal
          : pagePhotos.length >= pageSize;

        setRootFolderName(nextRootFolderName);
        setFolders(nextFolders);
        setAllPhotos(mergedPhotos);
        setTotal(nextTotal);
        pageRef.current = pageNo;
        setPage(pageNo);
        setHasMore(nextHasMore);
        setIsSwitchingTag(false);

        if (targetFolderId === ROOT_GALLERY_FOLDER_ID && isFirstPage) {
          const galleryCacheKey = `${GALLERY_PAGE_CACHE_KEY}_${targetFolderId}`;
          try {
            if (mergedPhotos.length > 0 || nextFolders.length > 1) {
              localStorage.setItem(
                galleryCacheKey,
                JSON.stringify({
                  photos: mergedPhotos,
                  total: nextTotal || mergedPhotos.length,
                  folders: nextFolders,
                  root_folder_name: nextRootFolderName,
                  cachedAt: Date.now(),
                })
              );
            } else {
              localStorage.removeItem(galleryCacheKey);
            }
          } catch {
            // 忽略缓存写入失败
          }
        }
      } catch (loadError) {
        if (requestToken !== loadRequestTokenRef.current) {
          return;
        }

        console.warn('load public gallery page failed:', loadError);
        setIsSwitchingTag(false);
      } finally {
        if (requestToken !== loadRequestTokenRef.current) {
          return;
        }

        if (isFirstPage) {
          setIsLoading(false);
        }
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [folders, pageSize, rootFolderName, selectedFolderId]
  );

  const refreshGallery = useCallback(
    async (options?: { silent?: boolean; folderId?: string }) => {
      await loadGalleryPage(1, options);
    },
    [loadGalleryPage]
  );

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedFolderId]);

  // 无初始数据时尝试读取本地缓存，避免反复进入加载动画
  useEffect(() => {
    if (selectedFolderId !== ROOT_GALLERY_FOLDER_ID) return;
    if (shouldForceRefreshFromDirty) return;
    if (memoryGallery) return;
    if (initialPhotos.length > 0) return;
    if (allPhotos.length > 0) return;

    try {
      const raw = localStorage.getItem(GALLERY_CACHE_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw) as {
        photos?: Photo[];
        total?: number;
        folders?: unknown;
        root_folder_name?: string;
        cachedAt?: number;
      };
      const cachedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : [];
      const cachedRootFolderName = resolveGalleryRootFolderName(parsed?.root_folder_name);
      const cachedFolders = buildGalleryFolderList(parsed?.folders, cachedRootFolderName);
      if (cachedPhotos.length === 0 && cachedFolders.length <= 1) return;

      const isExpired = typeof parsed.cachedAt === 'number' && Date.now() - parsed.cachedAt > 30 * 60 * 1000;
      if (isExpired) {
        localStorage.removeItem(GALLERY_CACHE_KEY);
        return;
      }

      const cachedTotal = typeof parsed.total === 'number' ? parsed.total : cachedPhotos.length;
      setRootFolderName(cachedRootFolderName);
      setFolders(cachedFolders);
      setAllPhotos(cachedPhotos);
      setTotal(cachedTotal);
      setPage(1);
      setHasMore(cachedPhotos.length < cachedTotal);
    } catch {
      // 忽略缓存解析失败
    }
  }, [GALLERY_CACHE_KEY, initialPhotos.length, allPhotos.length, memoryGallery, selectedFolderId, shouldForceRefreshFromDirty]);

  const requestNextPage = useCallback(() => {
    if (isLoading || isLoadingMoreRef.current || !hasMore) {
      return false;
    }

    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);
    void loadGalleryPage(pageRef.current + 1, { folderId: selectedFolderIdRef.current });
    return true;
  }, [hasMore, isLoading, loadGalleryPage]);

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
    return hasGalleryStory(photo);
  };

  const isHighlighted = (photo: Photo): boolean => {
    return isGalleryPhotoHighlighted(photo);
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

      loadRequestTokenRef.current += 1;
      isLoadingMoreRef.current = false;
      hasClientInitialFetchStartedRef.current = false;
      pageRef.current = 1;
      selectedFolderIdRef.current = nextFolderId;
      setIsSwitchingTag(true);
      setPage(1);
      setAllPhotos([]);
      setTotal(0);
      setHasMore(true);
      setIsLoading(false);
      setIsLoadingMore(false);
      setStoryOpenMap({});
      setPhotoAspectRatioMap({});
      setPreviewPhoto(null);
      setFullscreenPhoto(null);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      setSelectedFolderId(nextFolderId);
      void refreshGallery({ folderId: nextFolderId });
    },
    [dismissTagGuide, refreshGallery, selectedFolderId]
  );

  const openFolderSelector = useCallback(() => {
    dismissTagGuide();
    setTempFolderId(selectedFolderId);
    setTempFilterPreset(activeFilterPreset);
    setTempFilterDateStart(normalizedFilterDateStart);
    setTempFilterDateEnd(normalizedFilterDateEnd);
    setFilterModalError('');

    const targetButton = folderButtonRefs.current[selectedFolderId];
    if (targetButton) {
      targetButton.scrollIntoView({
        behavior: 'smooth',
        inline: 'center',
        block: 'nearest',
      });
    }

    setShowFolderSelector(true);
  }, [activeFilterPreset, dismissTagGuide, normalizedFilterDateEnd, normalizedFilterDateStart, selectedFolderId]);

  const closeFolderSelector = useCallback(() => {
    setShowFolderSelector(false);
    setTempFolderId(selectedFolderId);
    setTempFilterPreset(activeFilterPreset);
    setTempFilterDateStart(normalizedFilterDateStart);
    setTempFilterDateEnd(normalizedFilterDateEnd);
    setFilterModalError('');
  }, [activeFilterPreset, normalizedFilterDateEnd, normalizedFilterDateStart, selectedFolderId]);

  const handleResetFolderSelector = useCallback(() => {
    setTempFolderId(ROOT_GALLERY_FOLDER_ID);
    setTempFilterPreset('default_desc');
    setTempFilterDateStart('');
    setTempFilterDateEnd('');
    setFilterModalError('');
  }, []);

  const handleApplyFolderSelector = useCallback(() => {
    const nextPreset = String(tempFilterPreset || activeFilterPreset);
    const nextFolderId = String(tempFolderId || ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID;
    const resolvedPreset = resolveGalleryFilterPreset(nextPreset);
    const nextFilterDateStart = normalizeDateOnlyText(tempFilterDateStart);
    const nextFilterDateEnd = normalizeDateOnlyText(tempFilterDateEnd);

    if (nextFilterDateStart && nextFilterDateEnd && nextFilterDateStart > nextFilterDateEnd) {
      setFilterModalError('开始日期不能晚于结束日期');
      return;
    }

    setShowFolderSelector(false);
    setFilterModalError('');
    setSortMode(resolvedPreset.sortMode);
    setFilterMode(resolvedPreset.filterMode);
    setFilterDateStart(nextFilterDateStart);
    setFilterDateEnd(nextFilterDateEnd);

    if (nextFolderId !== selectedFolderId) {
      handleSwitchFolder(nextFolderId);
    }
  }, [
    activeFilterPreset,
    handleSwitchFolder,
    selectedFolderId,
    tempFilterDateEnd,
    tempFilterDateStart,
    tempFilterPreset,
    tempFolderId,
  ]);

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
    const currentPhoto = allPhotosRef.current.find((photo) => photo.id === photoId);
    const fallbackRatio = currentPhoto
      ? clampPhotoAspectRatio(currentPhoto.width, currentPhoto.height, 1)
      : 0;

    setPhotoAspectRatioMap((prev) => {
      const currentRatio = typeof prev[photoId] === 'number' ? prev[photoId] : fallbackRatio;
      if (currentRatio > 0 && Math.abs(currentRatio - nextRatio) < 0.08) {
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

  const galleryColumnCount = 2;
  const galleryColumnGapClassName = 'gap-2';

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
    columnCount: galleryColumnCount,
    resetKey: `${selectedFolderId}:${activeFilterPreset}:${normalizedFilterDateStart}:${normalizedFilterDateEnd}:${galleryColumnCount}`,
  });

  useEffect(() => {
    if (previewPhoto && !photos.some((photo) => photo.id === previewPhoto.id)) {
      setPreviewPhoto(null);
    }

    if (fullscreenPhoto && !photos.some((photo) => photo.id === fullscreenPhoto.id)) {
      setFullscreenPhoto(null);
    }
  }, [fullscreenPhoto, photos, previewPhoto]);

  useEffect(() => {
    if (pathname !== '/gallery') {
      loadRequestTokenRef.current += 1;
      hasClientInitialFetchStartedRef.current = false;
      isLoadingMoreRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsSwitchingTag(false);
      return;
    }

    const shouldSkipInitialRefresh =
      allPhotos.length > 0
      && (selectedFolderId !== ROOT_GALLERY_FOLDER_ID || folders.length > 1);

    if (hasClientInitialFetchStartedRef.current || shouldSkipInitialRefresh || isLoading || backendState.backendReconnecting) {
      return;
    }

    hasClientInitialFetchStartedRef.current = true;
    if (isSwitchingTag) {
      setIsSwitchingTag(false);
    }
    void refreshGallery();
  }, [allPhotos.length, backendState.backendReconnecting, folders.length, isLoading, isSwitchingTag, pathname, refreshGallery, selectedFolderId]);

  useEffect(() => {
    if (!isSwitchingTag || pathname !== '/gallery') {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsSwitchingTag(false);
      if (!backendState.backendReconnecting && allPhotos.length === 0 && !isLoading) {
        hasClientInitialFetchStartedRef.current = false;
        void refreshGallery();
      }
    }, 8500);

    return () => window.clearTimeout(timer);
  }, [allPhotos.length, backendState.backendReconnecting, isLoading, isSwitchingTag, pathname, refreshGallery]);

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
      <div className="flex-none bg-[#FFFBF0]/96 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/10 shadow-[0_2px_12px_rgba(93,64,55,0.08)]">
        <PageTopHeader
          title={String.fromCodePoint(0x7167, 0x7247, 0x5899)}
          badge={String.fromCodePoint(0x1f4f8) + ' ' + String.fromCodePoint(0x8d29, 0x5356, 0x4eba, 0x95f4, 0x8def, 0x8fc7, 0x7684, 0x6e29, 0x67d4) + ' ' + String.fromCodePoint(0x1f4f8)}
        />
      </div>

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
            <p className="text-[13px] text-[#5D4037]/50">
              {allPhotos.length > 0 ? String.fromCodePoint(0x6682, 0x65E0, 0x7B26, 0x5408, 0x7B5B, 0x9009, 0x6761, 0x4EF6, 0x7684, 0x7167, 0x7247) : String.fromCodePoint(0x6682, 0x65E0, 0x7167, 0x7247)}
            </p>
          </motion.div>
        ) : (
          <>
            {/* 双列瀑布流布局 */}
            <div className={`flex items-start ${galleryColumnGapClassName}`}>
              {galleryColumns.map((column, columnIndex) => (
                <div
                  key={`gallery-column-${columnIndex}`}
                  className={`flex min-w-0 flex-1 flex-col ${galleryColumnGapClassName}`}
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
                    className={`box-border bg-white rounded-[12px] overflow-hidden transition-all duration-300 ${
                      isHighlighted(photo)
                        ? 'border-[2px] border-[#FFB703] bg-[#FFFDF7] shadow-[0_0_0_1px_rgba(255,229,156,0.92),0_7px_16px_rgba(255,183,3,0.48),0_4px_10px_rgba(93,64,55,0.20)] translate-y-[-1px]'
                        : 'border border-transparent shadow-[0_5px_15px_rgba(93,64,55,0.10)]'
                    }`}
                  >
                    {/* 图片区域 */}
                    <div className="relative">
                      {storyOpenMap[photo.id] && hasStory(photo) ? (
                        <div className="min-h-[140px] box-border bg-[linear-gradient(150deg,#FFFDF7_0%,#FFF5DC_52%,#FCEBC5_100%)] p-[8px]">
                          <div className="relative min-h-[124px] rounded-[9px] border border-[#A67E52]/24 bg-[linear-gradient(180deg,rgba(255,251,242,0.98)_0%,rgba(255,246,231,0.98)_100%),repeating-linear-gradient(180deg,transparent_0px,transparent_23px,rgba(93,64,55,0.055)_23px,rgba(93,64,55,0.055)_24px)] px-[9px] pt-[9px] pb-[10px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_10px_rgba(93,64,55,0.14)]">
                            <span className="mb-[5px] inline-flex h-[17px] items-center justify-center rounded-full border border-[#5D4037]/16 bg-[#FFC857]/22 px-[7px] text-[10px] font-bold leading-none text-[#5D4037]/86">
                              {String.fromCodePoint(0x5173, 0x4E8E, 0x6B64, 0x523B)}
                            </span>
                            <p className="whitespace-pre-wrap break-words text-left text-[12.5px] font-semibold leading-[1.78] tracking-[0.4px] text-[#5D4037]/93">
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
                              aria-label={String.fromCodePoint(0x70B9, 0x8D5E)}
                              title={String.fromCodePoint(0x70B9, 0x8D5E)}
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
                          type="button"
                          onClick={(e) => toggleStoryCard(photo.id, e)}
                          className={`absolute right-[5px] top-[5px] flex items-center justify-center overflow-hidden rounded-full transition-all active:scale-95 ${
                            isHighlighted(photo)
                              ? 'border border-[#5D4037]/45 bg-[linear-gradient(135deg,#FFD76E_0%,#FFC857_100%)]'
                              : 'border border-white/45 bg-black/38'
                          }`}
                          style={
                            isHighlighted(photo)
                              ? {
                                  width: '30px',
                                  height: '30px',
                                  minWidth: '30px',
                                  minHeight: '30px',
                                  padding: 0,
                                  boxShadow: '0 0 0 1px rgba(255,229,156,0.9), 0 5px 12px rgba(255,183,3,0.55)',
                                }
                              : {
                                  width: '30px',
                                  height: '30px',
                                  minWidth: '30px',
                                  minHeight: '30px',
                                  padding: 0,
                                }
                          }
                          aria-label={String.fromCodePoint(0x5173, 0x4E8E, 0x6B64, 0x523B)}
                          title={String.fromCodePoint(0x5173, 0x4E8E, 0x6B64, 0x523B)}
                        >
                          <span
                            className={`font-bold leading-none transition-transform duration-200 ${
                              storyOpenMap[photo.id] ? 'rotate-180' : ''
                            } ${
                              isHighlighted(photo)
                                ? 'text-[#5D4037] [text-shadow:0_0.5px_0_rgba(255,255,255,0.55)]'
                                : 'text-white'
                            }`}
                            style={{ fontSize: '16px', lineHeight: 1 }}
                          >
                            {String.fromCodePoint(0x21BB)}
                          </span>
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
            <div className="mt-6 min-h-[28px]" style={{ overflowAnchor: 'none' }}>
              {isLoadingMore && hasMore && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center justify-center gap-3"
                >
                  <div className="h-5 w-5 animate-spin rounded-full border-[3px] border-[#FFC857]/40 border-t-[#FFC857]" />
                  <p className="text-[13px] font-bold text-[#5D4037]/60">拾光中...</p>
                </motion.div>
              )}

              {!hasMore && allPhotos.length > 0 && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center"
                >
                  <p className="text-[13px] text-[#5D4037]/40">✨ 已经到底啦 ✨</p>
                </motion.div>
              )}
            </div>
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
              aria-label={String.fromCodePoint(0x5173, 0x95ED, 0x5168, 0x90E8, 0x7B5B, 0x9009)}
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
                className="flex max-h-[66vh] flex-col overflow-hidden rounded-[20px] border border-[#5D4037]/8 bg-[#FFFDF7] shadow-[0_18px_44px_rgba(93,64,55,0.18)]"
              >
                <div className="flex items-center justify-between border-b border-[#5D4037]/10 px-4 py-3">
                  <div>
                    <h3 className="text-[15px] font-bold text-[#5D4037]">{String.fromCodePoint(0x5168, 0x90E8, 0x7B5B, 0x9009)}</h3>
                    <p className="mt-1 text-[11px] text-[#8D6E63]/72">{String.fromCodePoint(0x9009, 0x62E9, 0x4F60, 0x60F3, 0x770B, 0x7684, 0x6807, 0x7B7E, 0x5206, 0x7C7B)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeFolderSelector}
                    aria-label={String.fromCodePoint(0x5173, 0x95ED, 0x5168, 0x90E8, 0x7B5B, 0x9009)}
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-[#5D4037]/10 text-[#5D4037] transition-colors hover:bg-[#5D4037]/16"
                  >
                    <X className="h-4 w-4" strokeWidth={2.5} />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div>
                    <p className="mb-3 text-[12px] font-extrabold text-[#8D6E63]/82">{String.fromCodePoint(0x6807, 0x7B7E)}</p>
                    <div className="grid max-h-[180px] grid-cols-3 gap-2 overflow-y-auto pr-1">
                      {selectorFolders.map((folder) => {
                        const isActive = tempFolderId === String(folder.id);
                        return (
                          <button
                            key={`selector-${folder.id}`}
                            type="button"
                            onClick={() => {
                              setTempFolderId(String(folder.id));
                              setFilterModalError('');
                            }}
                            className={`flex h-[34px] min-w-0 items-center justify-center rounded-full px-2 text-[12px] font-bold leading-none transition-all duration-200 active:scale-[0.98] ${
                              isActive
                                ? 'border-[1.5px] border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0_rgba(93,64,55,0.12)]'
                                : 'border border-dashed border-[#5D4037]/15 bg-white text-[#5D4037]/68 hover:border-[#5D4037]/28 hover:text-[#5D4037]'
                            }`}
                          >
                            <span className="truncate">{folder.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="mb-3 text-[12px] font-extrabold text-[#8D6E63]/82">{String.fromCodePoint(0x6761, 0x4EF6, 0x7B5B, 0x9009)}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {GALLERY_FILTER_PRESET_OPTIONS.map((option) => {
                        const isActive = tempFilterPreset === option.preset;
                        return (
                          <button
                            key={`preset-${option.preset}`}
                            type="button"
                            onClick={() => {
                              setTempFilterPreset(option.preset);
                              setFilterModalError('');
                            }}
                            className={`flex h-[34px] min-w-0 items-center justify-center rounded-full px-2 text-[12px] font-bold leading-none transition-all duration-200 active:scale-[0.98] ${
                              isActive
                                ? 'border-[1.5px] border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0_rgba(93,64,55,0.12)]'
                                : 'border border-dashed border-[#5D4037]/15 bg-white text-[#5D4037]/68 hover:border-[#5D4037]/28 hover:text-[#5D4037]'
                            }`}
                          >
                            <span className="truncate">{option.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <p className="text-[12px] font-extrabold text-[#8D6E63]/82">{String.fromCodePoint(0x65E5, 0x671F, 0x8303, 0x56F4)}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setTempFilterDateStart('');
                          setTempFilterDateEnd('');
                          setFilterModalError('');
                        }}
                        className="inline-flex h-7 items-center justify-center rounded-full bg-[#5D4037]/8 px-3 text-[11px] font-bold leading-none text-[#5D4037]/74 transition-colors hover:bg-[#5D4037]/12"
                      >
                        {String.fromCodePoint(0x6E05, 0x7A7A, 0x65E5, 0x671F)}
                      </button>
                    </div>
                    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                      <input
                        type="date"
                        value={tempFilterDateStart}
                        max={maxFilterDate}
                        onChange={(event) => {
                          setTempFilterDateStart(normalizeDateOnlyText(event.target.value));
                          setFilterModalError('');
                        }}
                        className={`h-10 min-w-0 rounded-[18px] border px-3 text-center text-[12px] font-bold leading-none text-[#5D4037] outline-none transition-colors ${
                          tempFilterDateStart
                            ? 'border-[#5D4037]/20 bg-[#FFC857]/12'
                            : 'border-dashed border-[#5D4037]/15 bg-white text-[#8D6E63]/62'
                        }`}
                      />
                      <span className="text-[12px] font-bold text-[#8D6E63]/56">{String.fromCodePoint(0x81F3)}</span>
                      <input
                        type="date"
                        value={tempFilterDateEnd}
                        max={maxFilterDate}
                        onChange={(event) => {
                          setTempFilterDateEnd(normalizeDateOnlyText(event.target.value));
                          setFilterModalError('');
                        }}
                        className={`h-10 min-w-0 rounded-[18px] border px-3 text-center text-[12px] font-bold leading-none text-[#5D4037] outline-none transition-colors ${
                          tempFilterDateEnd
                            ? 'border-[#5D4037]/20 bg-[#FFC857]/12'
                            : 'border-dashed border-[#5D4037]/15 bg-white text-[#8D6E63]/62'
                        }`}
                      />
                    </div>
                    {filterModalError ? (
                      <p className="mt-2 text-[11px] font-semibold text-[#C97A51]">{filterModalError}</p>
                    ) : null}
                  </div>
                </div>
                <div className="flex gap-2 border-t border-dashed border-[#5D4037]/10 bg-white/55 px-4 py-3">
                  <button
                    type="button"
                    onClick={handleResetFolderSelector}
                    className="flex-1 rounded-full bg-[#5D4037]/8 px-4 py-[10px] text-[12px] font-semibold text-[#5D4037] transition-colors hover:bg-[#5D4037]/12"
                  >
                    {String.fromCodePoint(0x91CD, 0x7F6E)}
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyFolderSelector}
                    className="flex-1 rounded-full bg-[#5D4037] px-4 py-[10px] text-[12px] font-semibold text-white transition-colors hover:bg-[#6A4B41]"
                  >
                    {String.fromCodePoint(0x786E, 0x5B9A)}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <ImagePreview
        images={photos.map((photo) => photo.preview_url)}
        downloadUrls={photos.map((photo) => photo.original_url || photo.preview_url)}
        currentIndex={fullscreenPhoto ? Math.max(0, photos.findIndex((photo) => photo.id === fullscreenPhoto.id)) : 0}
        isOpen={!!fullscreenPhoto}
        onClose={() => setFullscreenPhoto(null)}
        onIndexChange={(index) => setFullscreenPhoto(photos[index] ?? null)}
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


