'use client';

import { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Heart, Eye, MapPin, RotateCw, X } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { getSessionId } from '@/lib/utils/session';
import { vibrate } from '@/lib/android';
import { formatDateDisplayUTC8, getTodayUTC8, parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import {
  GALLERY_PAGE_CACHE_KEY,
  clearGalleryPageCacheStorage,
  consumeGalleryCacheDirtyFlag,
} from '@/lib/gallery/cache-sync';
import MiniProgramRecoveryScreen, { PAGE_LOADING_COPY } from '@/components/MiniProgramRecoveryScreen';
import { useBackendRecoveryState } from '@/lib/hooks/useBackendRecoveryState';

import SimpleImage from '@/components/ui/SimpleImage';
import ImagePreview from '@/components/ImagePreview';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import PrimaryPageShell from '@/components/shell/PrimaryPageShell';
import { useStableMasonryColumns } from '@/lib/hooks/useStableMasonryColumns';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';
import { createPagingSkeletonItems, createPagingSkeletonItemsFromPhotos, type PagingSkeletonItem } from '@/lib/paging-skeletons';
import { hydratePhotoDimensions, photoListHasMissingDimensions } from '@/lib/photo-dimensions';

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

interface FetchedGalleryPageData {
  errorMessage: string;
  pageNo: number;
  targetFolderId: string;
  rows: Photo[];
  total: number;
  rootFolderName: string;
  folders: GalleryFolder[];
  hideRootFolder: boolean;
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
const GALLERY_SCROLL_LOAD_AHEAD_PX = 720;
const GALLERY_VIEWPORT_FILL_BUFFER_PX = 24;
const GALLERY_INITIAL_AUTOFILL_MAX_BATCHES = 2;
const GALLERY_LOAD_SENTINEL_THRESHOLD = 0.01;
const GALLERY_PAGING_SKELETON_COUNT = 8;
const TAG_WAVE_ROUNDS = 3;
const TAG_WAVE_STEP_DELAY_MS = 380;
const TAG_WAVE_ROUND_GAP_MS = 240;
const GALLERY_SWITCH_OVERLAY_TRACK_COUNT = 6;
const GALLERY_SWITCH_OVERLAY_TIMEOUT_MS = 8500;
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

function normalizeGalleryFolderId(folderId: string | null | undefined) {
  const rawFolderId = String(folderId ?? '').trim();
  const normalizedLower = rawFolderId.toLowerCase();
  if (!rawFolderId || rawFolderId === ROOT_GALLERY_FOLDER_ID || normalizedLower === 'root') {
    return ROOT_GALLERY_FOLDER_ID;
  }
  return rawFolderId;
}

function doesGalleryPhotoBelongToFolder(photo: Photo, folderId: string) {
  return normalizeGalleryFolderId(photo.folder_id) === normalizeGalleryFolderId(folderId);
}

function normalizeGalleryBoolean(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  const numericValue = Number(value);
  if (Number.isFinite(numericValue)) {
    return numericValue !== 0;
  }
  return fallback;
}

function resolveDefaultGalleryFolderId(
  folders: GalleryFolder[],
  hideRootFolder: boolean
): string {
  if (!hideRootFolder) {
    return ROOT_GALLERY_FOLDER_ID;
  }
  const firstFolder = Array.isArray(folders)
    ? folders.find((folder) => normalizeGalleryFolder(folder)?.id)
    : null;
  return firstFolder ? normalizeGalleryFolderId(firstFolder.id) : ROOT_GALLERY_FOLDER_ID;
}



function clampPhotoAspectRatio(width: number, height: number, fallback = 1) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);

  if (safeWidth > 0 && safeHeight > 0) {
    return safeHeight / safeWidth;
  }

  return fallback;
}

function resolveLoadedPhotoAspectRatio(width: number, height: number, fallback = 1) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  return safeWidth > 0 && safeHeight > 0 ? safeHeight / safeWidth : fallback;
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
  previousFolders: GalleryFolder[] = [],
  options?: { includeRoot?: boolean }
): GalleryFolder[] {
  const resolvedRootName = String(rootFolderName || '').trim() || '根目录';
  const includeRoot = options?.includeRoot !== false;
  const mergedFolders: GalleryFolder[] = includeRoot
    ? [{ id: ROOT_GALLERY_FOLDER_ID, name: resolvedRootName }]
    : [];
  const seenIds = new Set<string>(includeRoot ? [ROOT_GALLERY_FOLDER_ID] : []);

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
  hideRootFolder: boolean;
  folderSnapshotReady: boolean;
  targetFolderId: string;
  cachedAt: number;
}

const createEmptyGalleryRootCache = (): GalleryRootCachePayload => ({
  photos: [],
  total: 0,
  folders: [],
  rootFolderName: '根目录',
  hideRootFolder: false,
  folderSnapshotReady: false,
  targetFolderId: ROOT_GALLERY_FOLDER_ID,
  cachedAt: 0,
});

function resolveGalleryRootFolderName(value: unknown): string {
  const normalized = String(value ?? '').trim();
  return normalized || '根目录';
}

function hasGalleryRootCacheContent(
  cache: Pick<GalleryRootCachePayload, 'photos' | 'folders' | 'hideRootFolder'>
): boolean {
  return cache.photos.length > 0 || cache.folders.length > (cache.hideRootFolder ? 0 : 1);
}

let galleryMemoryCache: GalleryRootCachePayload = createEmptyGalleryRootCache();

const readGalleryMemoryCache = (): Omit<GalleryRootCachePayload, 'cachedAt'> | null => {
  if (!hasGalleryRootCacheContent(galleryMemoryCache)) return null;

  const isExpired = Date.now() - galleryMemoryCache.cachedAt > GALLERY_MEMORY_CACHE_TTL;
  if (isExpired) {
    galleryMemoryCache = createEmptyGalleryRootCache();
    return null;
  }

  if (photoListHasMissingDimensions(galleryMemoryCache.photos)) {
    galleryMemoryCache = createEmptyGalleryRootCache();
    return null;
  }

  if (!normalizeGalleryBoolean(galleryMemoryCache.folderSnapshotReady, false)) {
    return null;
  }

  const normalizedRootFolderName = resolveGalleryRootFolderName(galleryMemoryCache.rootFolderName);
  const hideRootFolder = normalizeGalleryBoolean(galleryMemoryCache.hideRootFolder, false);
  const normalizedFolders = buildGalleryFolderList(
    galleryMemoryCache.folders,
    normalizedRootFolderName,
    [],
    { includeRoot: !hideRootFolder }
  );
  const targetFolderId = normalizeGalleryFolderId(
    galleryMemoryCache.targetFolderId || resolveDefaultGalleryFolderId(normalizedFolders, hideRootFolder)
  );

  return {
    photos: galleryMemoryCache.photos.map((photo) => ({ ...photo })),
    total: galleryMemoryCache.total,
    folders: normalizedFolders,
    rootFolderName: normalizedRootFolderName,
    hideRootFolder,
    folderSnapshotReady: true,
    targetFolderId,
  };
};

const writeGalleryMemoryCache = (
  photos: Photo[],
  total: number,
  folders: GalleryFolder[],
  rootFolderName: string,
  hideRootFolder: boolean,
  targetFolderId: string,
  folderSnapshotReady: boolean
) => {
  const normalizedRootFolderName = resolveGalleryRootFolderName(rootFolderName);
  const normalizedHideRootFolder = normalizeGalleryBoolean(hideRootFolder, false);
  const normalizedFolderSnapshotReady = normalizeGalleryBoolean(folderSnapshotReady, false);
  const normalizedFolders = buildGalleryFolderList(
    folders,
    normalizedRootFolderName,
    [],
    { includeRoot: !normalizedHideRootFolder }
  );
  const normalizedTargetFolderId = normalizeGalleryFolderId(
    targetFolderId || resolveDefaultGalleryFolderId(normalizedFolders, normalizedHideRootFolder)
  );

  if (
    !normalizedFolderSnapshotReady ||
    (photos.length === 0 && normalizedFolders.length <= (normalizedHideRootFolder ? 0 : 1))
  ) {
    galleryMemoryCache = createEmptyGalleryRootCache();
    return;
  }

  galleryMemoryCache = {
    photos: photos.map((photo) => ({ ...photo })),
    total,
    folders: normalizedFolders.map((folder) => ({ ...folder })),
    rootFolderName: normalizedRootFolderName,
    hideRootFolder: normalizedHideRootFolder,
    folderSnapshotReady: normalizedFolderSnapshotReady,
    targetFolderId: normalizedTargetFolderId,
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

function toNonNegativeInteger(value: unknown): number | null {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.round(numeric);
}

function readPayloadNumberField(payload: unknown, fields: string | string[]): number | null {
  const keys = Array.isArray(fields) ? fields : [fields];
  let current = payload;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== 'object') {
      break;
    }

    for (let index = 0; index < keys.length; index += 1) {
      const key = String(keys[index] || '').trim();
      if (!key || !Object.prototype.hasOwnProperty.call(current, key)) {
        continue;
      }

      const parsed = toNonNegativeInteger((current as Record<string, unknown>)[key]);
      if (parsed !== null) {
        return parsed;
      }
    }

    const next = (current as { data?: unknown }).data;
    if (!next || typeof next !== 'object' || next === current) {
      break;
    }
    current = next;
  }

  return null;
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
  const { title: managedTitle, subtitle: managedSubtitle } = useManagedPageMeta(
    'gallery',
    String.fromCodePoint(0x7167, 0x7247, 0x5899),
    String.fromCodePoint(0x1f4f8) + ' ' + String.fromCodePoint(0x8d29, 0x5356, 0x4eba, 0x95f4, 0x8def, 0x8fc7, 0x7684, 0x6e29, 0x67d4) + ' ' + String.fromCodePoint(0x1f4f8)
  );

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
    initialPhotos.length > 0 || shouldForceRefreshFromDirty
      ? null
      : readGalleryMemoryCache();
  const hydratedInitialSelectedFolderId = normalizeGalleryFolderId(
    memoryGallery?.targetFolderId ?? ROOT_GALLERY_FOLDER_ID
  );
  const hydratedInitialRootFolderName = memoryGallery?.rootFolderName ?? '根目录';
  const hydratedInitialHideRootFolder = memoryGallery?.hideRootFolder ?? false;
  const hydratedInitialFolderSnapshotReady = memoryGallery?.folderSnapshotReady ?? false;
  const hydratedInitialFolders = memoryGallery?.folders ?? buildGalleryFolderList(
    [],
    hydratedInitialRootFolderName,
    [],
    { includeRoot: !hydratedInitialHideRootFolder }
  );
  const hydratedInitialPhotos = memoryGallery?.photos ?? initialPhotos;
  const hydratedInitialTotal = memoryGallery?.total ?? initialTotal;
  const hydratedInitialPage = memoryGallery ? 1 : initialPage;
  const hasHydratedInitialGalleryData = Boolean(memoryGallery) || initialPhotos.length > 0;

  const [selectedFolderId, setSelectedFolderId] = useState<string>(hydratedInitialSelectedFolderId);
  const [folders, setFolders] = useState<GalleryFolder[]>(hydratedInitialFolders);
  const [rootFolderName, setRootFolderName] = useState<string>(hydratedInitialRootFolderName);
  const [hideRootFolder, setHideRootFolder] = useState<boolean>(hydratedInitialHideRootFolder);
  const [folderSnapshotReady, setFolderSnapshotReady] = useState<boolean>(hydratedInitialFolderSnapshotReady);
  const [hasInitialContentReady, setHasInitialContentReady] = useState<boolean>(hasHydratedInitialGalleryData);
  const backendState = useBackendRecoveryState();
  const [showTagGuide, setShowTagGuide] = useState(false);
  const [showFolderSelector, setShowFolderSelector] = useState(false);
  const [sortMode, setSortMode] = useState<GallerySortMode>('time_desc');
  const [filterMode, setFilterMode] = useState<GalleryFilterMode>('all');
  const [filterDateStart, setFilterDateStart] = useState('');
  const [filterDateEnd, setFilterDateEnd] = useState('');
  const [tempFolderId, setTempFolderId] = useState<string>(hydratedInitialSelectedFolderId);
  const [tempFilterPreset, setTempFilterPreset] = useState<GalleryFilterPreset>('default_desc');
  const [tempFilterDateStart, setTempFilterDateStart] = useState('');
  const [tempFilterDateEnd, setTempFilterDateEnd] = useState('');
  const [filterModalError, setFilterModalError] = useState('');
  const [storyOpenMap, setStoryOpenMap] = useState<Record<string, boolean>>({});
  const shouldReduceMotion = useReducedMotion();
  const [photoAspectRatioMap, setPhotoAspectRatioMap] = useState<Record<string, number>>({});
  const [isSwitchingTag, setIsSwitchingTag] = useState(false);
  const [isSilentTagLoadPending, setIsSilentTagLoadPending] = useState(false);
  const [pendingTagPhotoIds, setPendingTagPhotoIds] = useState<string[]>([]);
  const [viewportWidth, setViewportWidth] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const paginationSentinelRef = useRef<HTMLDivElement | null>(null);
  const folderButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const tagGuideTimerRef = useRef<number | null>(null);
  const tagGuideShownOnceRef = useRef(false);
  const tagWaveTimerRef = useRef<number | null>(null);
  const tagWaveRunTokenRef = useRef(0);
  const [tagWaveActiveIndex, setTagWaveActiveIndex] = useState(-1);
  const [tagWaveTick, setTagWaveTick] = useState(0);


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

  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<Photo | null>(null);
  const [page, setPage] = useState(hydratedInitialPage);
  const [allPhotos, setAllPhotos] = useState<Photo[]>(hydratedInitialPhotos);
  const [total, setTotal] = useState(hydratedInitialTotal);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(hydratedInitialTotal > hydratedInitialPhotos.length);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [paginationSkeletons, setPaginationSkeletons] = useState<PagingSkeletonItem[]>([]);
  const isLoadingMoreRef = useRef(false);
  const galleryPrefetchTokenRef = useRef(0);
  const galleryPrefetchPromiseRef = useRef<Promise<FetchedGalleryPageData | null> | null>(null);
  const prefetchedGalleryPageRef = useRef<FetchedGalleryPageData | null>(null);
  const prefetchingGalleryPageRef = useRef<{ pageNo: number; folderId: string } | null>(null);
  const pendingAppendScrollTopRef = useRef<number | null>(null);
  const appendScrollRestoreRafRef = useRef<number | null>(null);
  const hasClientInitialFetchStartedRef = useRef(false);
  const loadRequestTokenRef = useRef(0);
  const allPhotosRef = useRef<Photo[]>(hydratedInitialPhotos);
  const pageRef = useRef(hydratedInitialPage);
  const selectedFolderIdRef = useRef(selectedFolderId);
  const resolvedFirstPageFolderIdRef = useRef<string | null>(null);
  const paginationZoneArmedRef = useRef(true);
  const autoFillRemainingRef = useRef(GALLERY_INITIAL_AUTOFILL_MAX_BATCHES);
  const pageSize = 20;
  const GALLERY_CACHE_KEY = `${GALLERY_PAGE_CACHE_KEY}_${ROOT_GALLERY_FOLDER_ID}`;
  const maxFilterDate = useMemo(() => getTodayUTC8(), []);
  const activeFilterPreset = useMemo(
    () => getActiveGalleryFilterPreset(filterMode, sortMode),
    [filterMode, sortMode]
  );
  const normalizedFilterDateStart = normalizeDateOnlyText(filterDateStart);
  const normalizedFilterDateEnd = normalizeDateOnlyText(filterDateEnd);
  const photos = useMemo(() => {
    let viewRows = Array.isArray(allPhotos) ? allPhotos.slice() : [];

    viewRows = viewRows.filter((photo) => doesGalleryPhotoBelongToFolder(photo, selectedFolderId));

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
  }, [allPhotos, filterMode, normalizedFilterDateEnd, normalizedFilterDateStart, selectedFolderId, sortMode]);

  useEffect(() => {
    allPhotosRef.current = allPhotos;
    pageRef.current = page;
    selectedFolderIdRef.current = selectedFolderId;
    const defaultFolderId = resolveDefaultGalleryFolderId(folders, hideRootFolder);
    if (selectedFolderId === defaultFolderId) {
      writeGalleryMemoryCache(
        allPhotos,
        Math.max(total, allPhotos.length),
        folders,
        rootFolderName,
        hideRootFolder,
        selectedFolderId,
        folderSnapshotReady
      );
    }
  }, [allPhotos, folderSnapshotReady, folders, hideRootFolder, page, rootFolderName, selectedFolderId, total]);

  useEffect(() => () => {
    if (appendScrollRestoreRafRef.current !== null && typeof window !== 'undefined') {
      window.cancelAnimationFrame(appendScrollRestoreRafRef.current);
      appendScrollRestoreRafRef.current = null;
    }
  }, []);

  useLayoutEffect(() => {
    const targetScrollTop = pendingAppendScrollTopRef.current;
    const scrollContainer = scrollContainerRef.current;
    if (targetScrollTop == null || !scrollContainer) {
      return;
    }

    const restoreScrollTop = () => {
      const activeContainer = scrollContainerRef.current;
      if (!activeContainer) {
        return;
      }
      activeContainer.scrollTop = targetScrollTop;
    };

    restoreScrollTop();
    appendScrollRestoreRafRef.current = window.requestAnimationFrame(() => {
      restoreScrollTop();
      pendingAppendScrollTopRef.current = null;
      appendScrollRestoreRafRef.current = null;
    });

    return () => {
      if (appendScrollRestoreRafRef.current !== null) {
        window.cancelAnimationFrame(appendScrollRestoreRafRef.current);
        appendScrollRestoreRafRef.current = null;
      }
    };
  }, [allPhotos.length]);

  useEffect(() => {
    if (!memoryGallery) return;

    const nextRootFolderName = resolveGalleryRootFolderName(memoryGallery.rootFolderName);
    const nextHideRootFolder = normalizeGalleryBoolean(memoryGallery.hideRootFolder, false);
    const nextFolderSnapshotReady = normalizeGalleryBoolean(memoryGallery.folderSnapshotReady, false);
    const nextFolders = buildGalleryFolderList(
      memoryGallery.folders,
      nextRootFolderName,
      [],
      { includeRoot: !nextHideRootFolder }
    );
    const hasFolderChanges =
      nextFolderSnapshotReady !== folderSnapshotReady
      || nextHideRootFolder !== hideRootFolder
      || selectedFolderId !== normalizeGalleryFolderId(memoryGallery.targetFolderId)
      || nextRootFolderName !== rootFolderName
      || nextFolders.length !== folders.length
      || nextFolders.some((folder, index) => {
        const currentFolder = folders[index];
        return !currentFolder || currentFolder.id !== folder.id || currentFolder.name !== folder.name;
      });

    if (!hasFolderChanges) return;

    setFolderSnapshotReady(nextFolderSnapshotReady);
    setHideRootFolder(nextHideRootFolder);
    setRootFolderName(nextRootFolderName);
    setFolders(nextFolders);
  }, [folderSnapshotReady, folders, hideRootFolder, memoryGallery, rootFolderName, selectedFolderId]);

  const showPaginationSkeletons = useCallback((pageNo: number, folderId: string, pagePhotos?: Photo[]) => {
    const normalizedFolderId = String(folderId || ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID;
    const prefix = `gallery_${normalizedFolderId}_${Math.max(1, Math.round(Number(pageNo || 1)))}`;
    const nextSkeletons =
      Array.isArray(pagePhotos) && pagePhotos.length > 0
        ? createPagingSkeletonItemsFromPhotos(pagePhotos, { prefix, seed: Date.now() })
        : createPagingSkeletonItems(GALLERY_PAGING_SKELETON_COUNT, { prefix, seed: Date.now() });
    setPaginationSkeletons(nextSkeletons);
  }, []);

  const clearPaginationSkeletons = useCallback(() => {
    setPaginationSkeletons((current) => (current.length > 0 ? [] : current));
  }, []);

  const invalidateGalleryPrefetch = useCallback((invalidateToken: boolean = true) => {
    if (invalidateToken) {
      galleryPrefetchTokenRef.current += 1;
    }
    galleryPrefetchPromiseRef.current = null;
    prefetchedGalleryPageRef.current = null;
    prefetchingGalleryPageRef.current = null;
  }, []);

  const canUsePrefetchedGalleryPage = useCallback((pageNo: number, folderId: string) => {
    const prefetched = prefetchedGalleryPageRef.current;
    if (!prefetched) {
      return false;
    }
    return (
      Number(prefetched.pageNo || 0) === Math.max(1, Math.round(Number(pageNo || 1))) &&
      String(prefetched.targetFolderId || '') === (String(folderId || ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID)
    );
  }, []);

  const fetchGalleryPageData = useCallback(async (
    pageNo: number,
    folderId: string
  ): Promise<FetchedGalleryPageData> => {
    const dbClient = createClient();
    if (!dbClient) {
      return {
        errorMessage: '数据库客户端不可用',
        pageNo,
        targetFolderId: folderId,
        rows: [],
        total: 0,
        rootFolderName,
        folders,
        hideRootFolder,
      };
    }

    const { data, error } = await dbClient.rpc('get_public_gallery', {
      page_no: pageNo,
      page_size: pageSize,
      folder_id: folderId,
      client_source: 'web',
    });

    if (error) {
      return {
        errorMessage: String(error.message || '加载失败').trim() || '加载失败',
        pageNo,
        targetFolderId: folderId,
        rows: [],
        total: 0,
        rootFolderName,
        folders,
        hideRootFolder,
      };
    }

    const payload = data ?? {};
    const rawPagePhotos = Array.isArray(payload.photos) ? (payload.photos as Photo[]) : [];
    const pagePhotos = rawPagePhotos.length > 0
      ? await hydratePhotoDimensions(rawPagePhotos)
      : rawPagePhotos;
    const nextRootFolderName =
      typeof payload.root_folder_name === 'string' && payload.root_folder_name.trim()
        ? payload.root_folder_name.trim()
        : rootFolderName;
    const nextHideRootFolder = normalizeGalleryBoolean(
      (payload as { hide_root_folder?: unknown; hideRootFolder?: unknown }).hide_root_folder
        ?? (payload as { hide_root_folder?: unknown; hideRootFolder?: unknown }).hideRootFolder,
      false
    );
    const nextFolders = buildGalleryFolderList(
      Array.isArray(payload.folders) ? payload.folders : folders,
      nextRootFolderName,
      folders,
      { includeRoot: !nextHideRootFolder }
    );
    const resolvedFolderId = normalizeGalleryFolderId(
      String((payload as { folder_id?: unknown; folderId?: unknown }).folder_id
        ?? (payload as { folder_id?: unknown; folderId?: unknown }).folderId
        ?? folderId)
    );

    return {
      errorMessage: '',
      pageNo,
      targetFolderId: resolvedFolderId,
      rows: pagePhotos,
      total: Math.max(0, Number(payload.total ?? 0) || 0),
      rootFolderName: nextRootFolderName,
      folders: nextFolders,
      hideRootFolder: nextHideRootFolder,
    };
  }, [folders, hideRootFolder, pageSize, rootFolderName]);

  const prefetchGalleryPage = useCallback(async (
    pageNo: number,
    folderId: string
  ): Promise<FetchedGalleryPageData | null> => {
    const normalizedPageNo = Math.max(1, Math.round(Number(pageNo || 1)));
    const normalizedFolderId = String(folderId || ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID;
    if (normalizedPageNo <= 1) {
      return null;
    }
    if (selectedFolderIdRef.current !== normalizedFolderId) {
      return null;
    }
    if (canUsePrefetchedGalleryPage(normalizedPageNo, normalizedFolderId)) {
      return prefetchedGalleryPageRef.current;
    }

    const inFlight = prefetchingGalleryPageRef.current;
    if (
      inFlight &&
      inFlight.pageNo === normalizedPageNo &&
      inFlight.folderId === normalizedFolderId &&
      galleryPrefetchPromiseRef.current
    ) {
      return galleryPrefetchPromiseRef.current;
    }

    const token = galleryPrefetchTokenRef.current + 1;
    galleryPrefetchTokenRef.current = token;
    prefetchedGalleryPageRef.current = null;
    prefetchingGalleryPageRef.current = { pageNo: normalizedPageNo, folderId: normalizedFolderId };

    const task = fetchGalleryPageData(normalizedPageNo, normalizedFolderId)
      .then((pageData) => {
        if (token !== galleryPrefetchTokenRef.current) {
          return null;
        }
        if (!pageData || pageData.errorMessage) {
          return null;
        }
        if (selectedFolderIdRef.current !== normalizedFolderId) {
          return null;
        }
        prefetchedGalleryPageRef.current = { ...pageData };
        return prefetchedGalleryPageRef.current;
      })
      .catch(() => null)
      .finally(() => {
        if (token === galleryPrefetchTokenRef.current) {
          galleryPrefetchPromiseRef.current = null;
          prefetchingGalleryPageRef.current = null;
        }
      });

    galleryPrefetchPromiseRef.current = task;
    return task;
  }, [canUsePrefetchedGalleryPage, fetchGalleryPageData]);

  const commitGalleryPageData = useCallback((
    pageNo: number,
    targetFolderId: string,
    pageData: FetchedGalleryPageData,
    options?: { silent?: boolean }
  ) => {
    const isFirstPage = pageNo === 1;
    const resolvedFolderId = normalizeGalleryFolderId(pageData.targetFolderId || targetFolderId);
    const mergedPhotos = isFirstPage
      ? pageData.rows
      : appendUniquePhotos(allPhotosRef.current, pageData.rows);

    if (!isFirstPage && mergedPhotos.length > allPhotosRef.current.length) {
      const scrollContainer = scrollContainerRef.current;
      pendingAppendScrollTopRef.current = scrollContainer ? scrollContainer.scrollTop : null;
    } else {
      pendingAppendScrollTopRef.current = null;
    }

    const nextTotal = Math.max(0, Number(pageData.total ?? 0) || 0);
    const hasKnownTotal = nextTotal > 0;
    const nextHasMore = hasKnownTotal
      ? pageData.rows.length >= pageSize && mergedPhotos.length < nextTotal
      : pageData.rows.length >= pageSize;

    setFolderSnapshotReady(true);
    setHideRootFolder(pageData.hideRootFolder);
    setRootFolderName(pageData.rootFolderName);
    setFolders(pageData.folders);
    setAllPhotos(mergedPhotos);
    setTotal(nextTotal);
    pageRef.current = pageNo;
    setPage(pageNo);
    setHasMore(nextHasMore);
    if (isFirstPage) {
      selectedFolderIdRef.current = resolvedFolderId;
      resolvedFirstPageFolderIdRef.current = resolvedFolderId;
      setSelectedFolderId(resolvedFolderId);
      setTempFolderId(resolvedFolderId);
      if (options?.silent) {
        setPendingTagPhotoIds(
          Array.from(
            new Set(
              mergedPhotos
                .slice(0, GALLERY_SWITCH_OVERLAY_TRACK_COUNT)
                .map((photo) => String(photo.id || '').trim())
                .filter(Boolean)
            )
          )
        );
      } else {
        setPendingTagPhotoIds([]);
      }
    }
    setIsSwitchingTag(false);

    const defaultFolderId = resolveDefaultGalleryFolderId(pageData.folders, pageData.hideRootFolder);
    if (resolvedFolderId === defaultFolderId && isFirstPage) {
      const galleryCacheKey = `${GALLERY_PAGE_CACHE_KEY}_${ROOT_GALLERY_FOLDER_ID}`;
      try {
        if (mergedPhotos.length > 0 || pageData.folders.length > (pageData.hideRootFolder ? 0 : 1)) {
          localStorage.setItem(
            galleryCacheKey,
            JSON.stringify({
              photos: mergedPhotos,
              total: nextTotal || mergedPhotos.length,
              folders: pageData.folders,
              folder_id: resolvedFolderId,
              folder_snapshot_ready: 1,
              hide_root_folder: pageData.hideRootFolder,
              root_folder_name: pageData.rootFolderName,
              cachedAt: Date.now(),
            })
          );
        } else {
          localStorage.removeItem(galleryCacheKey);
        }
      } catch {
      }
    }

    if (nextHasMore) {
      void prefetchGalleryPage(pageNo + 1, resolvedFolderId);
    } else {
      invalidateGalleryPrefetch(false);
    }

    return true;
  }, [invalidateGalleryPrefetch, pageSize, prefetchGalleryPage]);

  const loadGalleryPage = useCallback(
    async (pageNo: number, options?: { silent?: boolean; folderId?: string }) => {
      const silent = Boolean(options?.silent);
      const targetFolderId =
        String(options?.folderId ?? selectedFolderIdRef.current ?? ROOT_GALLERY_FOLDER_ID).trim() || ROOT_GALLERY_FOLDER_ID;
      const isFirstPage = pageNo === 1;
      const requestToken = loadRequestTokenRef.current + 1;
      loadRequestTokenRef.current = requestToken;

      if (isFirstPage) {
        invalidateGalleryPrefetch();
        setIsSilentTagLoadPending(silent);
        if (!silent) {
          setIsLoading(true);
        }
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
        clearPaginationSkeletons();
      } else {
        if (canUsePrefetchedGalleryPage(pageNo, targetFolderId)) {
          const prefetched = prefetchedGalleryPageRef.current;
          prefetchedGalleryPageRef.current = null;
          return commitGalleryPageData(pageNo, targetFolderId, prefetched as FetchedGalleryPageData, { silent });
        }
        isLoadingMoreRef.current = true;
        setIsLoadingMore(true);
        showPaginationSkeletons(pageNo, targetFolderId);
      }

      try {
        const pageData = pageNo > 1
          ? await (prefetchGalleryPage(pageNo, targetFolderId) || fetchGalleryPageData(pageNo, targetFolderId))
          : await fetchGalleryPageData(pageNo, targetFolderId);

        if (requestToken !== loadRequestTokenRef.current) {
          return false;
        }
        if (selectedFolderIdRef.current !== targetFolderId) {
          return false;
        }

        if (!pageData || pageData.errorMessage) {
          throw new Error(pageData?.errorMessage || '加载失败');
        }

        if (canUsePrefetchedGalleryPage(pageNo, targetFolderId)) {
          prefetchedGalleryPageRef.current = null;
        }

        return commitGalleryPageData(pageNo, targetFolderId, pageData, { silent });
      } catch (loadError) {
        if (requestToken !== loadRequestTokenRef.current) {
          return false;
        }

        console.warn('load public gallery page failed:', loadError);
        setPendingTagPhotoIds([]);
        setIsSwitchingTag(false);
        return false;
      } finally {
        if (requestToken !== loadRequestTokenRef.current) {
          return;
        }

        if (isFirstPage) {
          setIsSilentTagLoadPending(false);
          setIsLoading(false);
          setHasInitialContentReady(true);
        }
        clearPaginationSkeletons();
        isLoadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    },
    [
      canUsePrefetchedGalleryPage,
      clearPaginationSkeletons,
      commitGalleryPageData,
      fetchGalleryPageData,
      invalidateGalleryPrefetch,
      prefetchGalleryPage,
      showPaginationSkeletons,
    ]
  );

  const refreshGallery = useCallback(
    async (options?: { silent?: boolean; folderId?: string }) => {
      return loadGalleryPage(1, options);
    },
    [loadGalleryPage]
  );

  useEffect(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
  }, [selectedFolderId]);

  // 无初始数据时尝试读取本地缓存，避免反复进入加载动画
  useEffect(() => {
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
        folder_id?: string;
        folder_snapshot_ready?: boolean | number | string;
        hide_root_folder?: boolean | number | string;
        root_folder_name?: string;
        cachedAt?: number;
      };
      const cachedFolderSnapshotReady = normalizeGalleryBoolean(parsed?.folder_snapshot_ready, false);
      if (!cachedFolderSnapshotReady) return;
      const cachedPhotos = Array.isArray(parsed?.photos) ? parsed.photos : [];
      const cachedRootFolderName = resolveGalleryRootFolderName(parsed?.root_folder_name);
      const cachedHideRootFolder = normalizeGalleryBoolean(parsed?.hide_root_folder, false);
      const cachedFolders = buildGalleryFolderList(
        parsed?.folders,
        cachedRootFolderName,
        [],
        { includeRoot: !cachedHideRootFolder }
      );
      const cachedTargetFolderId = normalizeGalleryFolderId(
        parsed?.folder_id ?? resolveDefaultGalleryFolderId(cachedFolders, cachedHideRootFolder)
      );
      if (cachedPhotos.length === 0 && cachedFolders.length <= (cachedHideRootFolder ? 0 : 1)) return;

      const isExpired = typeof parsed.cachedAt === 'number' && Date.now() - parsed.cachedAt > 30 * 60 * 1000;
      if (isExpired || photoListHasMissingDimensions(cachedPhotos)) {
        localStorage.removeItem(GALLERY_CACHE_KEY);
        return;
      }

      const cachedTotal = typeof parsed.total === 'number' ? parsed.total : cachedPhotos.length;
      selectedFolderIdRef.current = cachedTargetFolderId;
      setSelectedFolderId(cachedTargetFolderId);
      setTempFolderId(cachedTargetFolderId);
      setFolderSnapshotReady(true);
      setHideRootFolder(cachedHideRootFolder);
      setRootFolderName(cachedRootFolderName);
      setFolders(cachedFolders);
      setAllPhotos(cachedPhotos);
      setTotal(cachedTotal);
      setPage(1);
      setHasMore(cachedPhotos.length < cachedTotal);
      setHasInitialContentReady(true);
      resolvedFirstPageFolderIdRef.current = cachedTargetFolderId;
    } catch {
      // 忽略缓存解析失败
    }
  }, [GALLERY_CACHE_KEY, allPhotos.length, initialPhotos.length, memoryGallery, shouldForceRefreshFromDirty]);

  const requestNextPage = useCallback(() => {
    if (isLoading || isLoadingMoreRef.current || !hasMore) {
      return false;
    }

    void loadGalleryPage(pageRef.current + 1, { folderId: selectedFolderIdRef.current });
    return true;
  }, [hasMore, isLoading, loadGalleryPage]);

  const maybeAutoFillViewport = useCallback(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer || isLoading || isLoadingMoreRef.current || !hasMore) {
      return false;
    }

    if (!(autoFillRemainingRef.current > 0)) {
      return false;
    }

    const viewportHeight = Number(scrollContainer.clientHeight || 0);
    const contentHeight = Number(scrollContainer.scrollHeight || 0);

    if (!(viewportHeight > 0) || !(contentHeight > 0)) {
      return false;
    }

    if (contentHeight > viewportHeight + GALLERY_VIEWPORT_FILL_BUFFER_PX) {
      return false;
    }

    autoFillRemainingRef.current -= 1;
    const hasRequested = requestNextPage();
    if (!hasRequested) {
      autoFillRemainingRef.current += 1;
    }
    return hasRequested;
  }, [hasMore, isLoading, requestNextPage]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    const sentinel = paginationSentinelRef.current;
    if (!scrollContainer || !sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }

        if (!entry.isIntersecting) {
          paginationZoneArmedRef.current = true;
          return;
        }

        if (!paginationZoneArmedRef.current) {
          return;
        }

        paginationZoneArmedRef.current = false;
        const hasRequested = requestNextPage();
        if (!hasRequested) {
          paginationZoneArmedRef.current = true;
        }
      },
      {
        root: scrollContainer,
        rootMargin: `0px 0px ${GALLERY_SCROLL_LOAD_AHEAD_PX}px 0px`,
        threshold: GALLERY_LOAD_SENTINEL_THRESHOLD,
      }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [photos.length, requestNextPage, selectedFolderId]);

  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMore || photos.length === 0) {
      return;
    }

    let firstFrame = 0;
    let secondFrame = 0;

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        maybeAutoFillViewport();
      });
    });

    return () => {
      if (firstFrame) {
        window.cancelAnimationFrame(firstFrame);
      }
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [hasMore, isLoading, isLoadingMore, maybeAutoFillViewport, photos.length, selectedFolderId]);

  useEffect(() => {
    if (isLoading || isLoadingMore || !hasMore || photos.length === 0) {
      return;
    }
    void prefetchGalleryPage(pageRef.current + 1, selectedFolderIdRef.current);
  }, [hasMore, isLoading, isLoadingMore, photos.length, prefetchGalleryPage, selectedFolderId]);

  useEffect(() => {
    paginationZoneArmedRef.current = true;
    autoFillRemainingRef.current = GALLERY_INITIAL_AUTOFILL_MAX_BATCHES;
  }, [selectedFolderId]);



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

  const syncPhotoViewCount = useCallback((photoId: string, viewCount: number) => {
    const normalizedPhotoId = String(photoId || '').trim();
    const normalizedViewCount = toNonNegativeInteger(viewCount);
    if (!normalizedPhotoId || normalizedViewCount === null) {
      return;
    }

    setAllPhotos((prev) => prev.map((photo) => (
      photo.id === normalizedPhotoId
        ? { ...photo, view_count: normalizedViewCount }
        : photo
    )));
    setPreviewPhoto((prev) => (
      prev && prev.id === normalizedPhotoId
        ? { ...prev, view_count: normalizedViewCount }
        : prev
    ));
    setFullscreenPhoto((prev) => (
      prev && prev.id === normalizedPhotoId
        ? { ...prev, view_count: normalizedViewCount }
        : prev
    ));
  }, []);

  const incrementPhotoViewCount = useCallback(async (photoId: string, fallbackViewCount?: number | null) => {
    const normalizedPhotoId = String(photoId || '').trim();
    if (!normalizedPhotoId) {
      return null;
    }

    const dbClient = createClient();
    if (!dbClient) {
      return null;
    }

    try {
      const { data } = await dbClient.rpc('increment_photo_view', {
        p_photo_id: normalizedPhotoId,
        p_session_id: getSessionId(),
      });

      const counted = Boolean(
        data
        && typeof data === 'object'
        && (data as { counted?: unknown }).counted
      );
      const nextViewCount = readPayloadNumberField(data, 'view_count')
        ?? (counted ? Math.max(0, Number(fallbackViewCount ?? 0)) + 1 : null);

      if (nextViewCount !== null) {
        syncPhotoViewCount(normalizedPhotoId, nextViewCount);
      }

      return nextViewCount;
    } catch {
      return null;
    }
  }, [syncPhotoViewCount]);

  const handlePreview = async (photo: Photo) => {
    setPreviewPhoto(photo);
    await incrementPhotoViewCount(photo.id, photo.view_count);
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

  const markTagSwitchPhotoSettled = useCallback((photoId: string) => {
    const normalizedPhotoId = String(photoId || '').trim();
    if (!normalizedPhotoId) {
      return;
    }

    setPendingTagPhotoIds((prev) => {
      if (!prev.includes(normalizedPhotoId)) {
        return prev;
      }

      return prev.filter((currentPhotoId) => currentPhotoId !== normalizedPhotoId);
    });
  }, []);

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
      resolvedFirstPageFolderIdRef.current = null;
      pageRef.current = 1;
      selectedFolderIdRef.current = nextFolderId;
      setIsSwitchingTag(true);
      setPendingTagPhotoIds([]);
      setPage(1);
      setHasMore(true);
      setIsLoadingMore(false);
      setStoryOpenMap({});
      setPhotoAspectRatioMap({});
      invalidateGalleryPrefetch();
      setPreviewPhoto(null);
      setFullscreenPhoto(null);
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: 'auto' });
      setSelectedFolderId(nextFolderId);
      void refreshGallery({ folderId: nextFolderId, silent: true });
    },
    [dismissTagGuide, invalidateGalleryPrefetch, refreshGallery, selectedFolderId]
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
    setTempFolderId(resolveDefaultGalleryFolderId(folders, hideRootFolder));
    setTempFilterPreset('default_desc');
    setTempFilterDateStart('');
    setTempFilterDateEnd('');
    setFilterModalError('');
  }, [folders, hideRootFolder]);

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
    const shouldAllowLiveRelayout = isSwitchingTag || isSilentTagLoadPending || pendingTagPhotoIds.length > 0;
    if (!shouldAllowLiveRelayout) {
      return;
    }

    const nextRatio = resolveLoadedPhotoAspectRatio(dimensions.width, dimensions.height, 1);
    const currentPhoto = allPhotosRef.current.find((photo) => photo.id === photoId);
    const hasStableStoredRatio = Boolean(
      currentPhoto
      && Number(currentPhoto.width || 0) > 0
      && Number(currentPhoto.height || 0) > 0
    );
    if (hasStableStoredRatio) {
      return;
    }
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
  }, [isSilentTagLoadPending, isSwitchingTag, pendingTagPhotoIds]);

  const resolvePhotoAspectRatio = useCallback(
    (photo: Photo) => photoAspectRatioMap[photo.id] ?? clampPhotoAspectRatio(photo.width, photo.height, 1),
    [photoAspectRatioMap]
  );

  const isTagOverlayLoading = isSwitchingTag || isSilentTagLoadPending || pendingTagPhotoIds.length > 0;
  const loadingTitle = PAGE_LOADING_COPY.title;
  const loadingDescription = PAGE_LOADING_COPY.description;

  const showInitialPageLoading = !hasInitialContentReady || (isLoading && allPhotos.length === 0 && !isTagOverlayLoading);
  const showContentOverlayLoading = isTagOverlayLoading;

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

  const galleryPaginationSkeletonColumns = useMemo(() => {
    const columns = Array.from({ length: galleryColumnCount }, () => [] as PagingSkeletonItem[]);
    if (paginationSkeletons.length === 0) {
      return columns;
    }

    const heights = Array.from({ length: galleryColumnCount }, (_, columnIndex) => (
      (galleryColumns[columnIndex] || []).reduce(
        (total, { photo }) => total + estimateGalleryCardHeight(
          photo,
          Boolean(storyOpenMap[photo.id]),
          resolvePhotoAspectRatio(photo)
        ),
        0
      )
    ));

    paginationSkeletons.forEach((skeleton) => {
      let targetColumnIndex = 0;
      for (let index = 1; index < heights.length; index += 1) {
        if (heights[index] < heights[targetColumnIndex]) {
          targetColumnIndex = index;
        }
      }

      columns[targetColumnIndex].push(skeleton);
      heights[targetColumnIndex] += estimateGalleryCardHeight(
        {
          id: skeleton.id,
          folder_id: null,
          thumbnail_url: '',
          preview_url: '',
          original_url: '',
          width: 1,
          height: skeleton.aspectRatio,
          like_count: 0,
          view_count: 0,
          is_liked: false,
          created_at: '',
        },
        false,
        skeleton.aspectRatio
      );
    });

    return columns;
  }, [galleryColumnCount, galleryColumns, paginationSkeletons, resolvePhotoAspectRatio, storyOpenMap]);

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
      resolvedFirstPageFolderIdRef.current = null;
      invalidateGalleryPrefetch();
      isLoadingMoreRef.current = false;
      setIsLoading(false);
      setIsLoadingMore(false);
      setIsSwitchingTag(false);
      setIsSilentTagLoadPending(false);
      setPendingTagPhotoIds([]);
      return;
    }

    const hasResolvedCurrentFolderFirstPage = resolvedFirstPageFolderIdRef.current === selectedFolderId;
    const shouldSkipInitialRefresh =
      hasResolvedCurrentFolderFirstPage
      || selectedFolderId !== ROOT_GALLERY_FOLDER_ID
      || (allPhotos.length > 0 && folders.length > 1);

    if (
      hasClientInitialFetchStartedRef.current
      || shouldSkipInitialRefresh
      || isLoading
      || isSwitchingTag
      || isSilentTagLoadPending
      || backendState.backendReconnecting
    ) {
      return;
    }

    hasClientInitialFetchStartedRef.current = true;
    void refreshGallery();
  }, [allPhotos.length, backendState.backendReconnecting, folders.length, invalidateGalleryPrefetch, isLoading, isSilentTagLoadPending, isSwitchingTag, pathname, refreshGallery, selectedFolderId]);

  useEffect(() => {
    if (!isTagOverlayLoading || pathname !== '/gallery') {
      return;
    }

    const timer = window.setTimeout(() => {
      setIsSwitchingTag(false);
      setPendingTagPhotoIds([]);
    }, GALLERY_SWITCH_OVERLAY_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [isTagOverlayLoading, pathname]);

  if (showInitialPageLoading) {
    return (
      <MiniProgramRecoveryScreen
        title={loadingTitle}
        description={loadingDescription}
        className="min-h-[100dvh] px-6"
      />
    );
  }

  return (
    <PrimaryPageShell
      title={managedTitle}
      badge={managedSubtitle || undefined}
      className="h-full w-full"
      contentClassName="min-h-0"
    >
      {/* 滚动区域 */}
      <PreviewAwareScrollArea
        ref={scrollContainerRef}
        className={`relative flex-1 gallery-scroll-container ${showContentOverlayLoading ? 'overflow-hidden overscroll-none' : 'overflow-y-auto'}`}
        style={{ overflowAnchor: 'none' }}
      >
        <div className={`sticky top-0 z-20 border-b border-[#5D4037]/5 bg-[#FFFBF0] ${showContentOverlayLoading ? 'pointer-events-none' : ''}`}>
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
                  disabled={showContentOverlayLoading}
                  className={`tag-button inline-flex shrink-0 items-center justify-center rounded-full border-2 border-[#5D4037] bg-[#5D4037] px-2 py-0.5 text-xs font-bold leading-none text-white transition-all duration-200 md:px-3 md:py-1.5 ${
                    showContentOverlayLoading
                      ? 'pointer-events-none opacity-60'
                      : 'hover:bg-[#6A4B41] active:scale-[0.98] active:opacity-92'
                  }`}
                >
                  全部
                </button>
            </div>
          </div>
        </div>

        {showContentOverlayLoading && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 top-[46px] z-[15]">
            <MiniProgramRecoveryScreen
              title={loadingTitle}
              description={loadingDescription}
              className="h-full min-h-0 bg-[#FFFBF0]/82 px-4 backdrop-blur-[6px]"
              contentClassName="gap-3"
            />
          </div>
        )}

        <div className="relative min-h-[60vh] px-3 pt-3">
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
            <div className={`flex items-start ${galleryColumnGapClassName}`} style={{ overflowAnchor: 'none' }}>
              {galleryColumns.map((column, columnIndex) => (
                <div
                  key={`gallery-column-${columnIndex}`}
                  className={`flex min-w-0 flex-1 flex-col ${galleryColumnGapClassName}`}
                >
                  {column.map(({ photo }) => (
                <div key={photo.id} className="min-w-0">
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
                      <AnimatePresence initial={false} mode="wait">
                        {storyOpenMap[photo.id] && hasStory(photo) ? (
                          <motion.div
                            key={`story-${photo.id}`}
                            initial={shouldReduceMotion ? { opacity: 1 } : { opacity: 0, y: 12, scale: 0.985 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.985 }}
                            transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.28, ease: 'easeOut' }}
                            className="min-h-[140px] box-border origin-top bg-[linear-gradient(150deg,#FFFDF7_0%,#FFF5DC_52%,#FCEBC5_100%)] p-[8px]"
                          >
                            <div className="relative min-h-[124px] rounded-[9px] border border-[#A67E52]/24 bg-[linear-gradient(180deg,rgba(255,251,242,0.98)_0%,rgba(255,246,231,0.98)_100%),repeating-linear-gradient(180deg,transparent_0px,transparent_23px,rgba(93,64,55,0.055)_23px,rgba(93,64,55,0.055)_24px)] px-[9px] pt-[9px] pb-[10px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_10px_rgba(93,64,55,0.14)]">
                              <span className="mb-[5px] inline-flex h-[17px] items-center justify-center rounded-full border border-[#5D4037]/16 bg-[#FFC857]/22 px-[7px] text-[10px] font-bold leading-none text-[#5D4037]/86">
                                {String.fromCodePoint(0x5173, 0x4E8E, 0x6B64, 0x523B)}
                              </span>
                              <p className="whitespace-pre-wrap break-words text-left text-[12.5px] font-semibold leading-[1.78] tracking-[0.4px] text-[#5D4037]/93">
                                {String(photo.story_text || '').trim()}
                              </p>
                            </div>
                          </motion.div>
                        ) : (
                          <div key={`photo-${photo.id}`}>
                            <div
                              className="relative cursor-pointer origin-top"
                              onClick={() => handlePreview(photo)}
                            >
                              <SimpleImage
                                src={photo.thumbnail_url}
                                alt="照片"
                                aspectRatio={resolvePhotoAspectRatio(photo)}
                                loadingVariant="quiet"
                                onLoad={() => markTagSwitchPhotoSettled(photo.id)}
                                onError={() => markTagSwitchPhotoSettled(photo.id)}
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
                          </div>
                        )}
                      </AnimatePresence>

                      {hasStory(photo) && (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.9 }}
                          onClick={(e) => toggleStoryCard(photo.id, e)}
                          className={`absolute right-[5px] top-[5px] z-[4] flex items-center justify-center overflow-hidden rounded-full border p-0 leading-none transition-[transform,background-color,border-color,box-shadow] duration-300 [appearance:none] [-webkit-appearance:none] ${
                            isHighlighted(photo)
                              ? 'border border-[#5D4037]/45 bg-[linear-gradient(135deg,#FFD76E_0%,#FFC857_100%)] text-[#5D4037] animate-pulse'
                              : 'border border-white/45 bg-black/38 text-white'
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
                          <motion.span
                            animate={
                              shouldReduceMotion
                                ? { rotate: 0, scale: 1 }
                                : { rotate: storyOpenMap[photo.id] ? 180 : 0, scale: storyOpenMap[photo.id] ? 1.06 : 1 }
                            }
                            transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 300, damping: 20 }}
                            className={`${isHighlighted(photo) ? 'drop-shadow-[0_0.5px_0_rgba(255,255,255,0.55)]' : ''}`}
                          >
                            <RotateCw className="h-[15px] w-[15px]" strokeWidth={2.35} />
                          </motion.span>
                        </motion.button>
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
                </div>
                  ))}
                  {galleryPaginationSkeletonColumns[columnIndex].map((skeleton) => (
                    <div key={skeleton.id} className="min-w-0">
                      <div className="box-border overflow-hidden rounded-[12px] border border-[#5D4037]/[0.06] bg-white/88 shadow-[0_5px_15px_rgba(93,64,55,0.08)]">
                        <div
                          className="relative overflow-hidden bg-[linear-gradient(135deg,rgba(255,251,240,0.98)_0%,rgba(255,247,233,0.98)_100%)]"
                          style={{ paddingTop: skeleton.paddingTop }}
                        >
                          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.24)_0%,rgba(255,248,232,0.92)_52%,rgba(255,244,224,0.96)_100%)]" />
                          <motion.div
                            className="absolute inset-y-0 left-[-42%] w-[42%] bg-[linear-gradient(90deg,rgba(255,255,255,0)_0%,rgba(255,255,255,0.52)_48%,rgba(255,255,255,0)_100%)]"
                            animate={{ x: ['0%', '340%'] }}
                            transition={{ duration: 1.45, repeat: Infinity, ease: 'easeInOut' }}
                          />
                        </div>
                        <div className="px-[6px] pt-[5px] pb-[5px] leading-none">
                          <div className="flex h-[10px] w-full items-center justify-between gap-[6px] overflow-hidden">
                            <motion.div
                              className="h-[10px] flex-1 rounded-full bg-[linear-gradient(90deg,rgba(93,64,55,0.08)_0%,rgba(93,64,55,0.16)_50%,rgba(93,64,55,0.08)_100%)] bg-[length:220%_100%]"
                              animate={{ backgroundPositionX: ['0%', '100%', '0%'], opacity: [0.72, 1, 0.72] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <motion.div
                              className="h-[10px] w-[44px] rounded-full bg-[linear-gradient(90deg,rgba(93,64,55,0.08)_0%,rgba(93,64,55,0.16)_50%,rgba(93,64,55,0.08)_100%)] bg-[length:220%_100%]"
                              animate={{ backgroundPositionX: ['0%', '100%', '0%'], opacity: [0.72, 1, 0.72] }}
                              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <div ref={paginationSentinelRef} className="h-px w-full" aria-hidden="true" />

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
      </PreviewAwareScrollArea>

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
                className="relative flex max-h-[66vh] flex-col overflow-hidden rounded-[20px] border border-[#5D4037]/8 bg-[#FFFDF7] shadow-[0_18px_44px_rgba(93,64,55,0.18)]"
              >
                <div className="flex items-center justify-between border-b border-[#5D4037]/10 px-4 py-3 pr-12">
                  <div>
                    <h3 className="text-[15px] font-bold text-[#5D4037]">{String.fromCodePoint(0x5168, 0x90E8, 0x7B5B, 0x9009)}</h3>
                    <p className="mt-1 text-[11px] text-[#8D6E63]/72">{String.fromCodePoint(0x9009, 0x62E9, 0x4F60, 0x60F3, 0x770B, 0x7684, 0x6807, 0x7B7E, 0x5206, 0x7C7B)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={closeFolderSelector}
                    aria-label={String.fromCodePoint(0x5173, 0x95ED, 0x5168, 0x90E8, 0x7B5B, 0x9009)}
                    className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
                  >
                    <X className="action-icon-svg" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4">
                  <div>
                    <p className="mb-3 text-[12px] font-extrabold text-[#8D6E63]/82">{String.fromCodePoint(0x6807, 0x7B7E)}</p>
                    <div className="grid max-h-[180px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
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
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
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
        onIndexChange={(index) => {
          const target = photos[index] ?? null;
          setFullscreenPhoto(target);
          if (target?.id) {
            void incrementPhotoViewCount(target.id, target.view_count);
          }
        }}
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
    </PrimaryPageShell>
  );
}
