'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Download, Sparkles, CheckSquare, Square, Trash2, ArrowLeft, X, Heart } from 'lucide-react';
import LetterOpeningModal from '@/components/LetterOpeningModal';
import DonationModal from '@/components/DonationModal';
import WechatDownloadGuide from '@/components/WechatDownloadGuide';
import ImagePreview from '@/components/ImagePreview';
import { createClient } from '@/lib/cloudbase/client';
import { downloadPhoto, vibrate } from '@/lib/android';
import { isWechatBrowser } from '@/lib/wechat';
import { parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import { normalizeAccessKey } from '@/lib/utils/access-key';
import { getSessionId } from '@/lib/utils/session';
import { markGalleryCacheDirty } from '@/lib/gallery/cache-sync';
import { useStableMasonryColumns } from '@/lib/hooks/useStableMasonryColumns';
import { mutate } from 'swr';

interface Folder {
  id: string;
  name: string;
}

interface Comment {
  id: string;
  content: string;
  nickname: string;
  created_at: string;
}

interface Photo {
  id: string;
  folder_id: string | null;
  thumbnail_url: string;  // 速览图 URL (300px, ~100KB)
  preview_url: string;    // 高质量预览 URL (1200px, ~500KB)
  original_url: string;   // 原图 URL (完整质量)
  thumbnail_url_resolved?: string;
  preview_url_resolved?: string;
  original_url_resolved?: string;
  card_url_resolved?: string;
  fullscreen_url_resolved?: string;
  story_text?: string | null;
  has_story?: boolean;
  is_highlight?: boolean;
  story_open?: boolean;
  story_highlight?: boolean;
  width: number;
  height: number;
  is_public: boolean;
  blurhash?: string;
  rating?: number;
  comments?: Comment[];
  __ratio?: number;
  __media_padding_top?: string;
}

interface AlbumData {
  album: {
    id: string;
    title: string;
    welcome_letter: string;
    cover_url: string | null;
    enable_tipping: boolean;
    enable_welcome_letter?: boolean;
    donation_qr_code_url?: string | null;
    recipient_name?: string;
    expires_at?: string;
    is_expired?: boolean;
  };
  folders: Folder[];
  photos: Photo[];
}

const ALBUM_PAGE_SIZE = 20;
const ALBUM_SELECT_ALL_MAX_PAGES = 200;
const ALBUM_FOLDER_GUIDE_AUTO_DISMISS_MS = 15000;
const ALBUM_FOLDER_WAVE_ROUNDS = 3;
const ALBUM_FOLDER_WAVE_STEP_DELAY_MS = 380;
const ALBUM_FOLDER_WAVE_ROUND_GAP_MS = 240;
const ALBUM_FOLDER_BUTTON_VARIANTS = {
  idle: { y: 0, scale: 1 },
  waveA: { y: [0, -4, 0], scale: [1, 1.02, 1] },
  waveB: { y: [0, -4, 0], scale: [1, 1.02, 1] },
};

function clampPhotoAspectRatio(width: number, height: number, fallback = 4 / 3) {
  const safeWidth = Number(width || 0);
  const safeHeight = Number(height || 0);
  const ratio = safeWidth > 0 && safeHeight > 0 ? safeHeight / safeWidth : fallback;
  return Math.min(2.8, Math.max(0.72, ratio));
}

function resolveAlbumPhotoRatio(photo: Photo, ratioMap?: Record<string, number>) {
  const id = photo?.id ? String(photo.id) : '';
  const runtimeRatio = id && ratioMap ? Number(ratioMap[id] || 0) : 0;
  if (runtimeRatio > 0) {
    return clampPhotoAspectRatio(1, runtimeRatio, 4 / 3);
  }

  const photoRatio = Number(photo?.__ratio || 0);
  if (photoRatio > 0) {
    return clampPhotoAspectRatio(1, photoRatio, 4 / 3);
  }

  return clampPhotoAspectRatio(photo.width, photo.height, 4 / 3);
}

function resolveAlbumPhotoListRatios(list: Photo[], ratioMap?: Record<string, number>) {
  const source = Array.isArray(list) ? list : [];
  let changed = false;

  const next = source.map((photo) => {
    const nextRatio = resolveAlbumPhotoRatio(photo, ratioMap);
    const nextPaddingTop = `${nextRatio * 100}%`;
    if (
      Math.abs(Number(photo?.__ratio || 0) - nextRatio) < 0.001 &&
      String(photo?.__media_padding_top || '') === nextPaddingTop
    ) {
      return photo;
    }

    changed = true;
    return {
      ...photo,
      __ratio: nextRatio,
      __media_padding_top: nextPaddingTop,
    };
  });

  return changed ? next : source;
}

function normalizeAlbumPhoto(photo: Photo): Photo {
  const thumbnailUrl = String(photo?.thumbnail_url || '').trim();
  const previewUrl = String(photo?.preview_url || '').trim();
  const originalUrl = String(photo?.original_url || '').trim();
  const storyText = String(photo?.story_text || '').trim();
  const hasStory = Boolean(storyText);
  const isHighlight = Boolean(photo?.is_highlight);
  const ratio = resolveAlbumPhotoRatio(photo);

  return {
    ...photo,
    thumbnail_url_resolved: thumbnailUrl,
    preview_url_resolved: previewUrl,
    original_url_resolved: originalUrl,
    card_url_resolved: thumbnailUrl || previewUrl || originalUrl,
    fullscreen_url_resolved: originalUrl || previewUrl || thumbnailUrl,
    story_text: storyText,
    has_story: hasStory,
    story_open: false,
    story_highlight: hasStory || isHighlight,
    __ratio: ratio,
    __media_padding_top: `${ratio * 100}%`,
  };
}

function estimateAlbumCardHeight(photo: Photo, isStoryOpen: boolean, ratioMap?: Record<string, number>) {
  const hasStoryText = Boolean(String(photo.story_text || '').trim());
  const mediaHeight = isStoryOpen && hasStoryText
    ? 220
    : resolveAlbumPhotoRatio(photo, ratioMap) * 180;
  return mediaHeight + 38;
}

function buildAlbumExpiryNotice(expiresAt?: string | null) {
  if (!expiresAt) {
    return '✨ 当前空间内照片默认保留 7 天，请及时下载保存。';
  }

  const expiryDate = parseDateTimeUTC8(expiresAt);
  if (!expiryDate) {
    return '✨ 当前空间内照片默认保留 7 天，请及时下载保存。';
  }

  const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  if (daysLeft > 0) {
    return `✨ 当前空间还可查看 ${daysLeft} 天，请及时下载保存。`;
  }

  return '✨ 当前空间有效期已结束，照片已不可查看。';
}

export default function AlbumDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accessKey = params.id as string;
  const normalizedAccessKey = useMemo(() => normalizeAccessKey(accessKey), [accessKey]);
  const bindNoticeStorageKey = useMemo(() => `album_bind_notice_${normalizedAccessKey}`, [normalizedAccessKey]);
  const welcomeStorageKey = useMemo(() => `album_welcome_seen_${normalizedAccessKey}`, [normalizedAccessKey]);
  const shouldReduceMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [showWelcomeLetter, setShowWelcomeLetter] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [pageNo, setPageNo] = useState(0);
  const [totalPhotos, setTotalPhotos] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [confirmPhotoId, setConfirmPhotoId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null); // 全屏查看的照片ID
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set()); // 已加载的图片ID
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set()); // 加载失败的图片ID
  const [photoAspectRatioMap, setPhotoAspectRatioMap] = useState<Record<string, number>>({});
  const [showFolderGuide, setShowFolderGuide] = useState(false);
  const [storyOpenMap, setStoryOpenMap] = useState<Record<string, boolean>>({});
  const [showDonationModal, setShowDonationModal] = useState(false); // 赞赏弹窗显示状态
  const [showWechatGuide, setShowWechatGuide] = useState(false); // 微信下载引导弹窗
  const [isWechat, setIsWechat] = useState(false); // 是否在微信浏览器中
  const [previewPhotoPool, setPreviewPhotoPool] = useState<Photo[] | null>(null);
  const photosRef = useRef<Photo[]>([]);
  const photoScrollRef = useRef<HTMLDivElement | null>(null);
  const folderButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const loadingMoreRef = useRef(false);
  const photoLoadTokenRef = useRef(0);
  const previewPhotoLoadTokenRef = useRef(0);
  const folderGuideTimerRef = useRef<number | null>(null);
  const folderGuideShownOnceRef = useRef(false);
  const folderWaveTimerRef = useRef<number | null>(null);
  const folderWaveRunTokenRef = useRef(0);
  const selectedFolderRef = useRef(selectedFolder);
  const [folderWaveActiveIndex, setFolderWaveActiveIndex] = useState(-1);
  const [folderWaveTick, setFolderWaveTick] = useState(0);

  const markGalleryDirty = () => {
    markGalleryCacheDirty();
    void mutate(
      (key: unknown) => Array.isArray(key) && key[0] === 'gallery',
      undefined,
      { revalidate: false }
    );
  };

  const folderTabs = useMemo<Folder[]>(() => {
    return [{ id: 'all', name: '原图' }, ...(albumData?.folders ?? [])];
  }, [albumData]);

  const clearFolderWaveTimer = useCallback(() => {
    folderWaveRunTokenRef.current += 1;
    if (folderWaveTimerRef.current) {
      window.clearTimeout(folderWaveTimerRef.current);
      folderWaveTimerRef.current = null;
    }
    setFolderWaveActiveIndex(-1);
    setFolderWaveTick(0);
  }, []);

  const startFolderWaveAnimation = useCallback(() => {
    clearFolderWaveTimer();
    const folderCount = folderTabs.length;
    if (folderCount <= 0) {
      return;
    }

    const runToken = folderWaveRunTokenRef.current;
    let round = 0;
    let index = 0;
    let tick = 0;

    const schedule = (delayMs: number, task: () => void) => {
      folderWaveTimerRef.current = window.setTimeout(() => {
        if (runToken !== folderWaveRunTokenRef.current) {
          return;
        }
        task();
      }, delayMs);
    };

    const triggerNext = () => {
      if (runToken !== folderWaveRunTokenRef.current) {
        return;
      }

      if (round >= ALBUM_FOLDER_WAVE_ROUNDS) {
        setFolderWaveActiveIndex(-1);
        setFolderWaveTick(0);
        folderWaveTimerRef.current = null;
        return;
      }

      tick = tick === 1 ? 0 : 1;
      const nextIndex = index;
      index += 1;

      let nextDelay = ALBUM_FOLDER_WAVE_STEP_DELAY_MS;
      if (index >= folderCount) {
        index = 0;
        round += 1;
        if (round < ALBUM_FOLDER_WAVE_ROUNDS) {
          nextDelay += ALBUM_FOLDER_WAVE_ROUND_GAP_MS;
        }
      }

      setFolderWaveActiveIndex(nextIndex);
      setFolderWaveTick(tick);
      schedule(nextDelay, triggerNext);
    };

    setFolderWaveActiveIndex(-1);
    schedule(120, triggerNext);
  }, [clearFolderWaveTimer, folderTabs.length]);

  const dismissFolderGuide = useCallback(() => {
    if (folderGuideTimerRef.current) {
      window.clearTimeout(folderGuideTimerRef.current);
      folderGuideTimerRef.current = null;
    }
    clearFolderWaveTimer();
    setShowFolderGuide(false);
  }, [clearFolderWaveTimer]);

  const setFolderButtonRef = useCallback(
    (folderId: string) => (node: HTMLButtonElement | null) => {
      folderButtonRefs.current[folderId] = node;
    },
    []
  );

  const incrementPhotoViewCount = async (photoId: string) => {
    const id = String(photoId || '').trim();
    if (!id) return;

    const dbClient = createClient();
    if (!dbClient) return;

    try {
      await dbClient.rpc('increment_photo_view', {
        p_photo_id: id,
        p_session_id: getSessionId(),
      });
    } catch {
      // ignore counting errors
    }
  };

  const incrementPhotoDownloadCount = async (photoId: string, count = 1) => {
    const id = String(photoId || '').trim();
    if (!id) return;

    const dbClient = createClient();
    if (!dbClient) return;

    const incrementBy = Number.isFinite(Number(count))
      ? Math.max(1, Math.min(50, Math.round(Number(count))))
      : 1;

    try {
      await dbClient.rpc('increment_photo_download', {
        p_photo_id: id,
        p_count: incrementBy,
      });
    } catch {
      // ignore counting errors
    }
  };

  // 检测微信浏览器环境
  const preloadAlbumPreviewPhotos = useCallback(async () => {
    if (!normalizedAccessKey) return;
    if (previewPhotoPool && previewPhotoPool.length > 0) return;

    const dbClient = createClient();
    if (!dbClient) return;

    const loadToken = previewPhotoLoadTokenRef.current + 1;
    previewPhotoLoadTokenRef.current = loadToken;

    try {
      const { data, error } = await dbClient.rpc('get_album_content', {
        input_key: normalizedAccessKey,
        include_photos: true,
      });

      if (error) return;
      if (loadToken !== previewPhotoLoadTokenRef.current) return;

      const payload = (data && typeof data === 'object') ? (data as Partial<AlbumData>) : null;
      const nextPhotos = Array.isArray(payload?.photos)
        ? resolveAlbumPhotoListRatios((payload.photos as Photo[]).map(normalizeAlbumPhoto), photoAspectRatioMap)
        : [];
      if (nextPhotos.length > 0) {
        setPreviewPhotoPool(nextPhotos);
      }
    } catch {
      // ignore preview prefetch errors
    }
  }, [normalizedAccessKey, photoAspectRatioMap, previewPhotoPool]);

  useEffect(() => {
    setIsWechat(isWechatBrowser());
  }, []);

  // 加载相册数据
  useEffect(() => {
    loadAlbumData();
  }, [normalizedAccessKey]);

  // Toast提示
  useEffect(() => {
    if (!loading && albumData) {
      const timer = setTimeout(() => {
        setShowToast(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, albumData]);

  useEffect(() => {
    if (!albumData) return;
    if (previewPhotoPool && previewPhotoPool.length > 0) return;
    if (photos.length === 0) return;

    if (totalPhotos <= photos.length) {
      setPreviewPhotoPool(photos);
      return;
    }

    const timer = window.setTimeout(() => {
      void preloadAlbumPreviewPhotos();
    }, 160);

    return () => window.clearTimeout(timer);
  }, [albumData, photos, preloadAlbumPreviewPhotos, previewPhotoPool, totalPhotos]);

  useEffect(() => {
    if (loading || !normalizedAccessKey || typeof window === 'undefined') {
      return;
    }

    const shouldShowBindNotice = sessionStorage.getItem(bindNoticeStorageKey);
    if (!shouldShowBindNotice) {
      return;
    }

    sessionStorage.removeItem(bindNoticeStorageKey);
    const bindSuccessMessage = '🎉 已自动绑定该空间到您的账号';
    setToast({ message: bindSuccessMessage, type: 'success' });

    const timer = setTimeout(() => {
      setToast((prev) => (prev?.message === bindSuccessMessage ? null : prev));
    }, 3000);

    return () => clearTimeout(timer);
  }, [loading, normalizedAccessKey, bindNoticeStorageKey]);

  const resolveFolderRpcArg = (folderId: string): string | null => {
    const normalized = String(folderId || '').trim();
    if (!normalized || normalized === 'all') {
      return null;
    }
    return normalized;
  };

  const loadAlbumPhotoPage = async (
    folderId: string,
    targetPageNo: number,
    options?: { reset?: boolean; silent?: boolean }
  ) => {
    const reset = Boolean(options?.reset);
    const silent = Boolean(options?.silent);
    const nextPageNo = Math.max(1, Math.round(Number(targetPageNo || 1)));
    const normalizedFolderId = String(folderId || 'all');

    if (!normalizedAccessKey) return;
    if (!reset && (loadingMoreRef.current || !hasMore)) return;

    const dbClient = createClient();
    if (!dbClient) {
      setToast({ message: '服务初始化失败，请刷新页面后重试', type: 'error' });
      return;
    }

    if (reset) {
      if (!silent) {
        setLoading(true);
      }
      setLoadingMore(false);
    } else {
      setLoadingMore(true);
    }

    const loadToken = photoLoadTokenRef.current + 1;
    photoLoadTokenRef.current = loadToken;

    try {
      const { data, error } = await dbClient.rpc('get_album_photo_page', {
        input_key: normalizedAccessKey,
        folder_id: resolveFolderRpcArg(normalizedFolderId),
        page_no: nextPageNo,
        page_size: ALBUM_PAGE_SIZE,
      });

      if (error) {
        if (!(reset && silent)) {
          setToast({ message: `加载失败：${error.message}`, type: 'error' });
          setTimeout(() => setToast(null), 3000);
        }
        return;
      }

      if (loadToken !== photoLoadTokenRef.current) {
        return;
      }
      if (selectedFolderRef.current !== normalizedFolderId) {
        return;
      }

      const payload = (data && typeof data === 'object') ? (data as any) : {};
      const pageRows = Array.isArray(payload.photos)
        ? resolveAlbumPhotoListRatios((payload.photos as Photo[]).map(normalizeAlbumPhoto), photoAspectRatioMap)
        : [];
      const previousRows = reset ? [] : photosRef.current;
      const previousIds = new Set(previousRows.map((photo) => String(photo.id)));
      const incrementalRows = pageRows.filter((photo) => !previousIds.has(String(photo.id)));
      const mergedRows = reset ? pageRows : previousRows.concat(incrementalRows);

      const payloadTotal = Number(payload.total);
      const normalizedTotal = Number.isFinite(payloadTotal) && payloadTotal >= 0
        ? Math.round(payloadTotal)
        : mergedRows.length;
      const hasKnownTotal = normalizedTotal > 0;
      const hasMoreFromPayload = typeof payload.has_more === 'boolean' ? payload.has_more : null;
      const computedHasMore = hasMoreFromPayload === null
        ? (hasKnownTotal ? mergedRows.length < normalizedTotal : pageRows.length >= ALBUM_PAGE_SIZE)
        : hasMoreFromPayload;

      setPhotos(mergedRows);
      photosRef.current = mergedRows;
      setPageNo(nextPageNo);
      setTotalPhotos(normalizedTotal);
      setHasMore(Boolean(computedHasMore));
    } catch (error) {
      if (!(reset && silent)) {
        setToast({ message: '加载失败，请稍后重试', type: 'error' });
        setTimeout(() => setToast(null), 3000);
      }
    } finally {
      if (loadToken === photoLoadTokenRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const loadAllPhotosForFolder = useCallback(async (folderId: string) => {
    if (!normalizedAccessKey) {
      return [];
    }

    const dbClient = createClient();
    if (!dbClient) {
      throw new Error('服务初始化失败，请刷新页面后重试');
    }

    const normalizedFolderId = String(folderId || 'all');
    const mergedRows: Photo[] = [];
    const loadedIds = new Set<string>();
    let currentPage = 1;
    let shouldContinue = true;

    while (shouldContinue && currentPage <= ALBUM_SELECT_ALL_MAX_PAGES) {
      const { data, error } = await dbClient.rpc('get_album_photo_page', {
        input_key: normalizedAccessKey,
        folder_id: resolveFolderRpcArg(normalizedFolderId),
        page_no: currentPage,
        page_size: ALBUM_PAGE_SIZE,
      });

      if (error) {
        throw new Error(error.message || '加载失败，请稍后重试');
      }

      const payload = (data && typeof data === 'object') ? (data as any) : {};
      const pageRows = Array.isArray(payload.photos)
        ? resolveAlbumPhotoListRatios((payload.photos as Photo[]).map(normalizeAlbumPhoto), photoAspectRatioMap)
        : [];

      for (const photo of pageRows) {
        const photoId = String(photo.id);
        if (loadedIds.has(photoId)) {
          continue;
        }
        loadedIds.add(photoId);
        mergedRows.push(photo);
      }

      const payloadTotal = Number(payload.total);
      const normalizedTotal = Number.isFinite(payloadTotal) && payloadTotal >= 0
        ? Math.round(payloadTotal)
        : mergedRows.length;
      const hasKnownTotal = normalizedTotal > 0;
      const hasMoreFromPayload = typeof payload.has_more === 'boolean' ? payload.has_more : null;
      shouldContinue = hasMoreFromPayload === null
        ? (hasKnownTotal ? mergedRows.length < normalizedTotal : pageRows.length >= ALBUM_PAGE_SIZE)
        : hasMoreFromPayload;

      if (pageRows.length === 0) {
        break;
      }

      currentPage += 1;
    }

    return mergedRows;
  }, [normalizedAccessKey, photoAspectRatioMap]);

  const loadAlbumData = async () => {
    setLoading(true);
    setLoadingMore(false);
    setHasMore(true);
    setPageNo(0);
    setTotalPhotos(0);
    setPhotos([]);
    setPreviewPhotoPool(null);
    setSelectedPhotos(new Set());
    setLoadedImages(new Set());
    setFailedImages(new Set());
    setPhotoAspectRatioMap({});
    setStoryOpenMap({});
    setFullscreenPhoto(null);
    setConfirmPhotoId(null);
    setShowDeleteConfirm(false);
    photosRef.current = [];
    setSelectedFolder('all');
    selectedFolderRef.current = 'all';
    photoLoadTokenRef.current += 1;
    previewPhotoLoadTokenRef.current += 1;
    dismissFolderGuide();
    folderGuideShownOnceRef.current = false;

    if (!normalizedAccessKey) {
      setLoading(false);
      setToast({ message: '密钥格式无效，请重新输入', type: 'error' });
      setTimeout(() => router.push('/album'), 2000);
      return;
    }

    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      setToast({ message: '服务初始化失败，请刷新页面后重试', type: 'error' });
      return;
    }

    const { data, error } = await dbClient.rpc('get_album_content', {
      input_key: normalizedAccessKey,
      include_photos: false,
    });

    if (error) {
      console.error('相册数据加载失败:', error);
      const errorMsg = error?.message || error?.details || JSON.stringify(error) || '未知错误';
      setToast({ message: `加载失败：${errorMsg}`, type: 'error' });
      setTimeout(() => router.push('/album'), 2000);
      return;
    }

    if (!data) {
      console.error('相册数据为空');
      setToast({ message: '加载失败：相册不存在或已过期', type: 'error' });
      setTimeout(() => router.push('/album'), 2000);
      return;
    }

    const payload = data as AlbumData;
    setAlbumData(payload);

    // 根据管理员设置决定是否显示欢迎信（仅首次打开显示）
    const hasSeenWelcome = typeof window !== 'undefined' && localStorage.getItem(welcomeStorageKey);
    const shouldShow = payload.album.enable_welcome_letter !== false && !hasSeenWelcome;
    setShowWelcomeLetter(shouldShow);

    await loadAlbumPhotoPage('all', 1, { reset: true, silent: false });
  };

  const handleWelcomeClose = () => {
    setShowWelcomeLetter(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(welcomeStorageKey, '1');
      } catch {
        // 忽略存储异常（如隐私模式）
      }
    }
  };

  const handleSelectFolder = async (folderId: string) => {
    dismissFolderGuide();
    const normalized = String(folderId || 'all');
    if (normalized === selectedFolder) return;

    setSelectedFolder(normalized);
    selectedFolderRef.current = normalized;
    setFullscreenPhoto(null);
    setStoryOpenMap({});
    setSelectedPhotos(new Set());
    setLoadedImages(new Set());
    setFailedImages(new Set());
    setPhotos([]);
    photosRef.current = [];
    setHasMore(true);
    setPageNo(0);
    setTotalPhotos(0);
    photoLoadTokenRef.current += 1;

    await loadAlbumPhotoPage(normalized, 1, { reset: true, silent: false });
  };

  const filteredPhotos = useMemo(() => {
    if (selectedFolder === 'all') return photos;
    return photos.filter(photo => String(photo.folder_id || '') === selectedFolder);
  }, [photos, selectedFolder]);

  const resolvedFilteredPhotos = useMemo(
    () => resolveAlbumPhotoListRatios(filteredPhotos, photoAspectRatioMap),
    [filteredPhotos, photoAspectRatioMap]
  );

  const hasLoadedAllVisiblePhotos = !hasMore && (
    totalPhotos === 0 ? filteredPhotos.length > 0 : filteredPhotos.length >= totalPhotos
  );

  const isSelectAll = filteredPhotos.length > 0
    && selectedPhotos.size === filteredPhotos.length
    && hasLoadedAllVisiblePhotos;

  const previewPhotos = useMemo(() => {
    const sourcePhotos = previewPhotoPool && previewPhotoPool.length > 0
      ? previewPhotoPool
      : photos;
    const currentPhotoMap = new Map(photos.map((photo) => [String(photo.id), photo]));
    const mergedPhotos = sourcePhotos.map((photo) => {
      const currentPhoto = currentPhotoMap.get(String(photo.id));
      return currentPhoto ? { ...photo, ...currentPhoto } : photo;
    });

    if (selectedFolder === 'all') return mergedPhotos;
    return mergedPhotos.filter(photo => String(photo.folder_id || '') === selectedFolder);
  }, [photos, previewPhotoPool, selectedFolder]);

  const previewCurrentIndex = useMemo(() => {
    if (!fullscreenPhoto) return 0;
    const targetIndex = previewPhotos.findIndex((photo) => photo.id === fullscreenPhoto);
    return targetIndex >= 0 ? targetIndex : 0;
  }, [fullscreenPhoto, previewPhotos]);

  const loadNextPhotoPage = async () => {
    if (loading || loadingMore || !hasMore) return;
    await loadAlbumPhotoPage(selectedFolder, pageNo + 1, { reset: false, silent: false });
  };

  const handlePhotoScroll = (event: React.UIEvent<HTMLDivElement>) => {
    if (loading || loadingMore || !hasMore) return;
    const target = event.currentTarget;
    const scrollHeight = Number(target.scrollHeight || 0);
    const clientHeight = Number(target.clientHeight || 0);
    const scrollTop = Number(target.scrollTop || 0);
    if (!(scrollHeight > 0) || !(clientHeight > 0)) return;

    const progress = (scrollTop + clientHeight) / scrollHeight;
    if (progress >= 0.8) {
      void loadNextPhotoPage();
    }
  };

  const hasStory = (photo: Photo): boolean => Boolean(String(photo.story_text || '').trim());
  const isHighlighted = (photo: Photo): boolean => hasStory(photo) || Boolean(photo.is_highlight);

  const handlePhotoRatioReady = useCallback((photoId: string, dimensions: { width: number; height: number }) => {
    const nextRatio = clampPhotoAspectRatio(dimensions.width, dimensions.height, 4 / 3);
    setPhotoAspectRatioMap((prev) => {
      const currentRatio = Number(prev[photoId] || 0);
      if (currentRatio > 0 && Math.abs(currentRatio - nextRatio) < 0.01) {
        return prev;
      }
      return {
        ...prev,
        [photoId]: nextRatio,
      };
    });
  }, []);

  const toggleStoryCard = (photoId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setStoryOpenMap((prev) => ({
      ...prev,
      [photoId]: !prev[photoId],
    }));
  };

  const albumMasonryItems = useMemo(
    () => resolvedFilteredPhotos.map((photo, index) => ({ photo, index })),
    [resolvedFilteredPhotos]
  );

  const { columns: albumColumns } = useStableMasonryColumns({
    items: albumMasonryItems,
    getItemId: ({ photo }) => photo.id,
    estimateItemHeight: ({ photo }) => estimateAlbumCardHeight(photo, Boolean(storyOpenMap[photo.id]), photoAspectRatioMap),
    resetKey: `${normalizedAccessKey}_${selectedFolder}`,
  });

  useEffect(() => {
    loadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  useEffect(() => {
    selectedFolderRef.current = selectedFolder;
  }, [selectedFolder]);

  useEffect(() => {
    const targetButton = folderButtonRefs.current[selectedFolder];
    if (!targetButton) {
      return;
    }

    targetButton.scrollIntoView({
      behavior: 'smooth',
      inline: 'center',
      block: 'nearest',
    });
  }, [selectedFolder, folderTabs.length]);

  useEffect(() => {
    dismissFolderGuide();

    if (folderGuideShownOnceRef.current || loading || loadingMore || folderTabs.length <= 1) {
      return;
    }

    folderGuideShownOnceRef.current = true;
    setShowFolderGuide(true);
    startFolderWaveAnimation();
    folderGuideTimerRef.current = window.setTimeout(() => {
      dismissFolderGuide();
    }, ALBUM_FOLDER_GUIDE_AUTO_DISMISS_MS);

    return () => {
      if (folderGuideTimerRef.current) {
        window.clearTimeout(folderGuideTimerRef.current);
        folderGuideTimerRef.current = null;
      }
      clearFolderWaveTimer();
    };
  }, [clearFolderWaveTimer, dismissFolderGuide, folderTabs.length, loading, loadingMore, startFolderWaveAnimation]);

  useEffect(() => {
    if (Object.keys(photoAspectRatioMap).length === 0) {
      return;
    }

    setPhotos((prev) => resolveAlbumPhotoListRatios(prev, photoAspectRatioMap));
    setPreviewPhotoPool((prev) => (prev ? resolveAlbumPhotoListRatios(prev, photoAspectRatioMap) : prev));
  }, [photoAspectRatioMap]);

  useEffect(() => {
    setStoryOpenMap({});
  }, [selectedFolder]);

  // 计算相册过期天数
  const expiryDays = useMemo(() => {
    if (!albumData?.album?.expires_at) return 7; // 默认7天
    const expiryDate = parseDateTimeUTC8(albumData.album.expires_at);
    if (!expiryDate) return 7;
    const diffTime = expiryDate.getTime() - Date.now();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 7; // 如果已过期或计算出错，默认7天
  }, [albumData]);

  const togglePublic = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    const dbClient = createClient();
    if (!dbClient) {
      setToast({ message: '服务初始化失败，请刷新页面后重试', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    // 使用RPC函数确保安全性
    const { error } = await dbClient.rpc('pin_photo_to_wall', {
      p_access_key: normalizedAccessKey,
      p_photo_id: photoId
    });

    if (!error) {
      const newIsPublic = !photo.is_public;
      setPhotos(prev => {
        const next = prev.map(p =>
          p.id === photoId ? { ...p, is_public: newIsPublic } : p
        );
        photosRef.current = next;
        return next;
      });
      setPreviewPhotoPool(prev => prev
        ? prev.map(p => (p.id === photoId ? { ...p, is_public: newIsPublic } : p))
        : prev
      );
      markGalleryDirty();

      // 显示提示信息
      if (newIsPublic) {
        setToast({
          message: '✨ 照片已定格到照片墙！虽然照片7天后会像魔法一样消失，但现在它会被魔法定格，永远保留哦！',
          type: 'success'
        });
      } else {
        setToast({
          message: '照片已从照片墙移除',
          type: 'success'
        });
      }
      setTimeout(() => setToast(null), 5000);
    } else {
      setToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
  };

  const togglePhotoSelection = (photoId: string) => {
    setSelectedPhotos(prev => {
      const newSet = new Set(prev);
      if (newSet.has(photoId)) {
        newSet.delete(photoId);
      } else {
        newSet.add(photoId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = async () => {
    if (loading || loadingMore || filteredPhotos.length === 0) {
      return;
    }

    if (isSelectAll) {
      setSelectedPhotos(new Set());
      return;
    }

    const targetFolderId = selectedFolderRef.current;

    try {
      setLoadingMore(true);
      const fullRows = await loadAllPhotosForFolder(targetFolderId);
      if (selectedFolderRef.current !== targetFolderId) {
        return;
      }

      setPhotos(fullRows);
      photosRef.current = fullRows;
      setTotalPhotos(fullRows.length);
      setPageNo(fullRows.length > 0 ? Math.ceil(fullRows.length / ALBUM_PAGE_SIZE) : 0);
      setHasMore(false);
      setSelectedPhotos(new Set(fullRows.map((photo) => photo.id)));
    } catch (error) {
      const message = error instanceof Error && error.message
        ? error.message
        : '全选失败，请稍后重试';
      setToast({ message, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleBatchDownload = async () => {
    // 微信浏览器环境：显示引导弹窗
    if (isWechat) {
      setShowWechatGuide(true);
      return;
    }

    await executeBatchDownload();
  };

  const executeBatchDownload = async () => {
    // 非微信浏览器：正常批量下载
    const photosToDownload = selectedPhotos.size > 0
      ? photos.filter(p => selectedPhotos.has(p.id))
      : filteredPhotos;

    for (const photo of photosToDownload) {
      try {
        // 使用Android原生下载（自动降级到Web下载）
        await downloadPhoto(photo.original_url, `photo_${photo.id}.jpg`);
        void incrementPhotoDownloadCount(photo.id);
        vibrate(30); // 触觉反馈

        // 添加延迟避免浏览器阻止多个下载
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('下载失败:', error);
      }
    }

    setToast({ message: `成功保存 ${photosToDownload.length} 张原图 📸`, type: 'success' });
    setTimeout(() => setToast(null), 3000);
  };

  const handleBatchDelete = async () => {
    setShowDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    const dbClient = createClient();
    if (!dbClient) {
      setShowDeleteConfirm(false);
      setToast({ message: '服务初始化失败，请刷新页面后重试', type: 'error' });
      setTimeout(() => setToast(null), 3000);
      return;
    }

    let successCount = 0;
    let failCount = 0;
    let storageWarningCount = 0;
    let hasDeletedPublicPhoto = false;
    const deletedPhotoIds = new Set<string>();
    const visibilityMap = new Map(photos.map((photo) => [photo.id, Boolean(photo.is_public)]));

    for (const photoId of Array.from(selectedPhotos)) {
      if (!photos.some((p) => p.id === photoId)) continue;

      const { data, error: deleteError } = await dbClient.rpc('delete_album_photo', {
        p_access_key: normalizedAccessKey,
        p_photo_id: photoId
      });

      if (deleteError) {
        failCount++;
      } else {
        successCount++;
        deletedPhotoIds.add(photoId);
        if (visibilityMap.get(photoId)) {
          hasDeletedPublicPhoto = true;
        }

        if (Boolean((data as any)?.storage_cleanup_failed)) {
          storageWarningCount++;
        }
      }
    }

    setShowDeleteConfirm(false);

    if (successCount > 0) {
      setPhotos(prev => {
        const next = prev.filter(p => !deletedPhotoIds.has(p.id));
        photosRef.current = next;
        return next;
      });
      setPreviewPhotoPool(prev => prev
        ? prev.filter(photo => !deletedPhotoIds.has(photo.id))
        : prev
      );
      if (confirmPhotoId && deletedPhotoIds.has(confirmPhotoId)) {
        setConfirmPhotoId(null);
      }
      if (fullscreenPhoto && deletedPhotoIds.has(fullscreenPhoto)) {
        setFullscreenPhoto(null);
      }
      setSelectedPhotos(prev => new Set(Array.from(prev).filter(id => !deletedPhotoIds.has(id))));
      if (hasDeletedPublicPhoto) {
        markGalleryDirty();
      }
    }

    const warningParts: string[] = [];
    if (storageWarningCount > 0) {
      warningParts.push(`${storageWarningCount} 张云存储清理失败`);
    }
    if (failCount > 0) {
      warningParts.push(`失败 ${failCount} 张`);
    }

    if (warningParts.length > 0) {
      setToast({
        message: `删除完成：成功 ${successCount} 张，${warningParts.join('，')}`,
        type: 'error',
      });
    } else {
      setToast({ message: `成功删除 ${successCount} 张照片`, type: 'success' });
    }
    setTimeout(() => setToast(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-6"
        >
          {/* 时光中动画 */}
          <div className="relative">
            {/* 外圈旋转 */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
            />
            {/* 内圈反向旋转 */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
            />
            {/* 中心图标 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-[#FFC857]" />
            </div>
          </div>

          {/* 加载文字 */}
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
              正在为你打开相册
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (!albumData) {
    return null;
  }

  const albumNoticeMessage = buildAlbumExpiryNotice(albumData.album.expires_at);
  const hasVisiblePhotos = filteredPhotos.length > 0;
  const batchDownloadLabel = selectedPhotos.size > 0 ? '下载' : '全部下载';

  return (
    <div className="flex flex-col h-full w-full">
      {/* 隐藏底部导航栏 */}
      <style jsx global>{`
        nav {
          display: none !important;
        }
      `}</style>

      {/* 手账风页头 - 使用弹性布局适配不同屏幕 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-2 flex items-center justify-between gap-2">
          <button
            onClick={() => router.push('/album')}
            className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-[#5D4037] leading-none truncate" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              {albumData.album.title || '相册空间'}
            </h1>
          </div>

          <div className="flex-shrink-0 inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">✨ 趁魔法消失前，把美好定格 ✨</p>
          </div>
        </div>
      </motion.div>

      {/* 极细提示跑马灯 */}
      <AnimatePresence>
        {showToast && albumData && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex-none h-6 bg-[#FFC857]/15 flex items-center justify-center relative overflow-hidden"
          >
            <motion.div
              animate={shouldReduceMotion ? { x: 0 } : { x: ['0%', '-50%'] }}
              transition={shouldReduceMotion ? { duration: 0 } : { duration: 20, repeat: Infinity, ease: "linear" }}
              className="text-[10px] text-[#5D4037]/60 whitespace-nowrap"
            >
              <span className="inline-block">{albumNoticeMessage}</span>
              <span className="inline-block ml-8">{albumNoticeMessage}</span>
            </motion.div>
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setShowToast(false)}
              className="absolute right-2 text-[#5D4037]/40 hover:text-[#5D4037]/60"
            >
              ×
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 顶部工具栏 */}
      <div className="sticky top-0 z-10 flex-none border-b border-[#5D4037]/5 bg-[#FFFBF0]/96 backdrop-blur-md">
        <div className="px-[3px] py-0">
          <div className={`flex min-h-[46px] gap-[6px] ${showFolderGuide ? 'items-start' : 'items-center'}`}>
            <div className={`relative min-w-0 flex-1 border-x border-[#FFFBF0] bg-[#FFFBF0] ${showFolderGuide ? 'pt-[36px]' : ''}`}>
              <AnimatePresence>
                {showFolderGuide && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, y: -6, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    onClick={dismissFolderGuide}
                    className="compact-button absolute left-0 top-0 z-[3] inline-flex h-[26px] max-w-[190px] items-center rounded-[7px] bg-[#5D4037] px-[9px] text-left shadow-[0_5px_12px_rgba(93,64,55,0.28)]"
                  >
                    <span className="whitespace-nowrap text-[10px] font-semibold leading-none text-[#FFFAF0]">
                      左右滑动 / 点击标签可切换
                    </span>
                    <span className="absolute bottom-[-4px] left-[11px] h-[8px] w-[8px] rotate-45 bg-[#5D4037]" />
                  </motion.button>
                )}
              </AnimatePresence>

              <div className="scrollbar-hidden overflow-x-auto whitespace-nowrap" onScroll={showFolderGuide ? dismissFolderGuide : undefined}>
                <div className="inline-flex items-center gap-2 px-0 py-0">
                  {folderTabs.map((folder, index) => {
                    const isWaveActive = showFolderGuide && folderWaveActiveIndex === index;
                    return (
                      <motion.button
                        key={folder.id}
                        type="button"
                        ref={setFolderButtonRef(String(folder.id))}
                        whileTap={{ scale: 0.98 }}
                        initial={false}
                        animate={isWaveActive ? (folderWaveTick === 1 ? 'waveA' : 'waveB') : 'idle'}
                        variants={ALBUM_FOLDER_BUTTON_VARIANTS}
                        onClick={() => { void handleSelectFolder(folder.id); }}
                        className={`tag-button inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-full border-2 px-2 py-0.5 text-xs font-bold leading-none transition-all duration-200 active:scale-[0.98] md:px-3 md:py-1.5 ${
                          selectedFolder === folder.id
                            ? 'border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0_rgba(93,64,55,0.15)]'
                            : 'border-[#5D4037]/15 bg-white/60 text-[#5D4037]/60 hover:border-[#5D4037]/30 hover:text-[#5D4037]'
                        }`}
                        aria-pressed={selectedFolder === folder.id}
                      >
                        {folder.name}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>

            {hasVisiblePhotos && (
              <div className="flex shrink-0 items-center gap-[5px]">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => { void toggleSelectAll(); }}
                  aria-pressed={isSelectAll}
                  className={`inline-flex min-h-[30px] items-center justify-center gap-[6px] rounded-full px-3 text-[11px] font-bold leading-none transition-all duration-200 ${loading || loadingMore ? 'pointer-events-none opacity-60' : ''} ${
                    isSelectAll
                      ? 'border-[1.5px] border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037] shadow-[1.5px_1.5px_0_rgba(93,64,55,0.15)]'
                      : 'border-[1.5px] border-dashed border-[#5D4037]/15 bg-white/60 text-[#5D4037]/70 hover:border-[#5D4037]/30 hover:text-[#5D4037]'
                  }`}
                >
                  {isSelectAll ? <CheckSquare className="h-[13px] w-[13px]" /> : <Square className="h-[13px] w-[13px]" />}
                  <span>全选</span>
                </motion.button>

                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={handleBatchDownload}
                  className={`relative inline-flex h-[30px] items-center justify-center gap-[6px] rounded-full border-[1.5px] border-[#5D4037]/20 bg-[#FFC857] px-3 text-[11px] font-bold leading-none text-[#5D4037] shadow-[1.5px_1.5px_0_rgba(93,64,55,0.15)] transition-all duration-200 ${loadingMore ? 'pointer-events-none opacity-60' : ''} ${selectedPhotos.size > 0 ? 'min-w-[62px]' : 'min-w-[76px]'}`}
                >
                  <Download className="h-[13px] w-[13px]" />
                  <span>{batchDownloadLabel}</span>
                  {selectedPhotos.size > 0 && (
                    <span className="absolute -right-[5px] -top-[6px] flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#5D4037] px-1 text-[10px] font-bold leading-none text-white shadow-[0_4px_10px_rgba(93,64,55,0.22)]">
                      {selectedPhotos.size > 99 ? '99+' : selectedPhotos.size}
                    </span>
                  )}
                </motion.button>

                {selectedPhotos.size > 0 && (
                  <motion.button
                    type="button"
                    initial={{ opacity: 0, scale: 0.86 }}
                    animate={{ opacity: 1, scale: 1 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={handleBatchDelete}
                    className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border border-red-400/25 bg-red-500/10 text-red-600 shadow-[0_3px_10px_rgba(239,68,68,0.12)] transition-all duration-200 ${loadingMore ? 'pointer-events-none opacity-60' : ''}`}
                  >
                    <Trash2 className="h-[14px] w-[14px]" />
                  </motion.button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        ref={photoScrollRef}
        onScroll={handlePhotoScroll}
        className="flex-1 overflow-y-auto px-2 pt-3 pb-32"
      >
        <div className="flex items-start gap-2">
          {albumColumns.map((column, columnIndex) => (
            <div
              key={`album-column-${columnIndex}`}
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
              {/* 瀑布流卡片 */}
              <div
                className={`overflow-hidden rounded-[18px] bg-white transition-all duration-300 ${
                  isHighlighted(photo)
                    ? 'border-[2px] border-[#FFB703] bg-[#FFFDF7] shadow-[0_0_0_1px_rgba(255,229,156,0.92),0_7px_18px_rgba(255,183,3,0.42),0_5px_14px_rgba(93,64,55,0.18)]'
                    : 'border border-transparent shadow-[0_5px_16px_rgba(93,64,55,0.14)]'
                }`}
              >
                <div
                  className="relative cursor-pointer overflow-hidden"
                  onClick={() => {
                    if (storyOpenMap[photo.id] && hasStory(photo)) {
                      return;
                    }
                    setFullscreenPhoto(photo.id);
                    void incrementPhotoViewCount(photo.id);
                  }}
                >
                  {storyOpenMap[photo.id] && hasStory(photo) ? (
                    <div className="min-h-[190px] p-2 bg-[linear-gradient(160deg,#FFFDF7_0%,#FFF5DC_52%,#FCEBC5_100%)]">
                      <div className="relative min-h-[168px] rounded-[12px] border border-[#A67E52]/24 bg-[linear-gradient(180deg,rgba(255,251,242,0.98)_0%,rgba(255,246,231,0.98)_100%),repeating-linear-gradient(180deg,transparent_0px,transparent_23px,rgba(93,64,55,0.055)_23px,rgba(93,64,55,0.055)_24px)] px-[10px] py-[10px] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_4px_10px_rgba(93,64,55,0.14)]">
                        <span className="mb-[6px] inline-flex h-[17px] items-center rounded-full border border-[#5D4037]/16 bg-[#FFC857]/22 px-[7px] text-[10px] font-bold leading-none text-[#5D4037]/86">
                          关于此刻
                        </span>
                        <p className="whitespace-pre-wrap break-words text-[12.5px] font-semibold leading-[1.78] tracking-[0.02em] text-[#5D4037]/93">
                          {String(photo.story_text || '').trim()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div
                        className="relative w-full overflow-hidden bg-[linear-gradient(135deg,#f8f2e6,#efe5d2)]"
                        style={{ paddingTop: photo.__media_padding_top || `${resolveAlbumPhotoRatio(photo, photoAspectRatioMap) * 100}%` }}
                      >
                        <img
                          src={photo.card_url_resolved || photo.thumbnail_url_resolved || photo.thumbnail_url}
                          alt="照片"
                          loading="lazy"
                          decoding="async"
                          className="album-card-image absolute inset-0 h-full w-full object-cover"
                          style={{ width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover' }}
                          onLoad={(event) => {
                            const target = event.currentTarget;
                            setLoadedImages((prev) => new Set([...prev, photo.id]));
                            setFailedImages((prev) => {
                              if (!prev.has(photo.id)) {
                                return prev;
                              }
                              const next = new Set(prev);
                              next.delete(photo.id);
                              return next;
                            });
                            handlePhotoRatioReady(photo.id, {
                              width: target.naturalWidth,
                              height: target.naturalHeight,
                            });
                          }}
                          onError={() => setFailedImages((prev) => new Set([...prev, photo.id]))}
                        />
                      </div>

                      {!loadedImages.has(photo.id) && !failedImages.has(photo.id) && (
                        <div
                          className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                          style={{ background: 'linear-gradient(135deg, #FFFBF0 0%, #FFF8E8 50%, #FFF4E0 100%)' }}
                        >
                          <motion.div
                            animate={{ rotate: [-2, 2, -2], scale: [1, 1.05, 1] }}
                            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            className="relative"
                          >
                            <motion.div
                              className="text-4xl"
                              animate={{ filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)'] }}
                              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              📷
                            </motion.div>
                            <motion.div
                              className="absolute -top-1 -right-1 text-xl"
                              animate={{ opacity: [0, 1, 0], scale: [0.5, 1.2, 0.5] }}
                              transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                            >
                              ✨
                            </motion.div>
                          </motion.div>
                          <motion.p
                            className="text-xs font-medium text-[#5D4037]/60"
                            animate={{ opacity: [0.6, 1, 0.6] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                            style={{ fontFamily: "'ZQKNNY', cursive" }}
                          >
                            拾光中...
                          </motion.p>
                          <motion.div
                            className="absolute left-1/4 top-1/4 text-sm opacity-30"
                            animate={{ y: [-10, 10, -10], x: [-5, 5, -5], rotate: [0, 360] }}
                            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            ✨
                          </motion.div>
                          <motion.div
                            className="absolute bottom-1/4 right-1/4 text-sm opacity-30"
                            animate={{ y: [10, -10, 10], x: [5, -5, 5], rotate: [360, 0] }}
                            transition={{ duration: 3.5, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
                          >
                            💫
                          </motion.div>
                        </div>
                      )}

                      {failedImages.has(photo.id) && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#FFFBF0]">
                          <div className="flex flex-col items-center gap-2 px-4 text-center">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                              <X className="h-6 w-6 text-red-500" />
                            </div>
                            <p className="text-xs text-[#5D4037]/60">加载失败</p>
                            <button
                              onClick={(event) => {
                                event.stopPropagation();
                                setFailedImages((prev) => {
                                  const next = new Set(prev);
                                  next.delete(photo.id);
                                  return next;
                                });
                              }}
                              className="text-xs text-[#FFC857] underline"
                            >
                              重试
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {hasStory(photo) && (
                    <button
                      onClick={(event) => toggleStoryCard(photo.id, event)}
                      className={`absolute z-[3] flex h-[30px] w-[30px] items-center justify-center rounded-full border transition-all ${
                        storyOpenMap[photo.id] ? 'bottom-[6px] right-[6px]' : 'left-[6px] top-[6px]'
                      } ${
                        isHighlighted(photo)
                          ? 'bg-gradient-to-br from-[#FFD76E] to-[#FFC857] border-[1.5px] border-[#5D4037]/45 text-[#5D4037] shadow-[0_0_0_1px_rgba(255,229,156,0.9),0_5px_12px_rgba(255,183,3,0.55)] animate-pulse'
                          : 'bg-black/35 border-white/50 text-white'
                      }`}
                      aria-label="查看关于此刻"
                      title="关于此刻"
                    >
                      <span
                        className={`text-[16px] font-bold leading-none transition-transform duration-200 ${
                          storyOpenMap[photo.id] ? 'rotate-180' : ''
                        } ${isHighlighted(photo) ? 'drop-shadow-[0_0.5px_0_rgba(255,255,255,0.55)]' : ''}`}
                      >
                        ↗
                      </span>
                    </button>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(event) => {
                      event.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                    className="absolute right-[7px] top-[7px] z-[4] flex h-[28px] w-[28px] items-center justify-center rounded-full border border-[#5D4037]/15 bg-white/92 shadow-[0_4px_12px_rgba(0,0,0,0.18)] backdrop-blur-[2px] transition-all"
                  >
                    <span
                      className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border text-[11px] font-black leading-none ${
                        selectedPhotos.has(photo.id)
                          ? 'border-[#FFC857] bg-[#FFC857] text-[#5D4037]'
                          : 'border-[#5D4037]/42 bg-transparent text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </motion.button>
                </div>

                <div className="flex items-center justify-center px-[6px] pt-[3px] pb-[5px]">
                  <motion.button
                    whileTap={{ scale: 0.92 }}
                    onClick={() => photo.is_public ? togglePublic(photo.id) : setConfirmPhotoId(photo.id)}
                    className={`inline-flex items-center gap-[5px] rounded-full border px-[10px] py-[4px] text-[11px] font-bold leading-none transition-all ${
                      photo.is_public
                        ? 'border-[#5D4037]/20 bg-[#FFC857] text-[#5D4037]'
                        : 'border-[#5D4037]/12 bg-[#5D4037]/10 text-[#5D4037]/65'
                    }`}
                  >
                    <Sparkles className="h-[12px] w-[12px]" />
                    <span>{photo.is_public ? '已定格' : '定格'}</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
              ))}
            </div>
          ))}
        </div>

        {/* 赞赏入口 - 自然且不突兀 */}
        {albumData.album.enable_tipping && albumData.album.donation_qr_code_url && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="mt-8 mb-4 flex justify-center"
          >
            <button
              onClick={() => setShowDonationModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-orange-50 to-pink-50 text-[#5D4037] rounded-full shadow-sm hover:shadow-md active:scale-95 transition-all border border-orange-200/50"
            >
              <Heart className="w-4 h-4 text-orange-500" />
              <span className="text-sm font-medium">留下一份心意</span>
            </button>
          </motion.div>
        )}

        {loadingMore && (
          <div className="flex justify-center items-center gap-2 mt-6 mb-2">
            <div className="w-5 h-5 border-2 border-[#FFC857] border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-[#5D4037]/60">加载中...</p>
          </div>
        )}
        {!hasMore && filteredPhotos.length > 0 && (
          <div className="text-center mt-6 mb-2">
            <p className="text-xs text-[#5D4037]/40">✨ 已经到底啦 ✨</p>
          </div>
        )}
      </div>

      {/* 拆信交互 */}
      <LetterOpeningModal
        isOpen={showWelcomeLetter}
        onClose={handleWelcomeClose}
        letterContent={albumData.album.welcome_letter || '欢迎来到专属空间 ✨'}
        recipientName={albumData.album.recipient_name}
      />

      {/* 定格确认弹窗 */}
      <AnimatePresence>
        {confirmPhotoId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setConfirmPhotoId(null)}
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
                  <Sparkles className="w-8 h-8 text-[#FFC857]" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-3">✨ 施展定格魔法？</h3>
                <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-3">
                  魔法生效后，这张照片就会飞到 <span className="font-bold text-[#FFC857]">【照片墙】</span> 上，和更多人分享这份美好！📸 这样它就有了 <span className="font-bold text-[#FFC857]">【永恒】</span> 的魔法加持，打破 {expiryDays} 天消失的魔咒，永远在这里闪闪发光啦~ ✨
                </p>
                <p className="text-xs text-[#5D4037]/50 leading-relaxed">
                  💡 Tips：如果改变主意，可以随时再次点击让魔法失效，照片会回到专属空间继续 {expiryDays} 天倒计时哦~
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setConfirmPhotoId(null)}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors"
                >
                  再想想
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    togglePublic(confirmPhotoId);
                    setConfirmPhotoId(null);
                  }}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#FFC857] text-[#5D4037] shadow-md hover:shadow-lg transition-all"
                >
                  ✨ 确认定格
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量删除确认弹窗 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDeleteConfirm(false)}
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
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-3">确定要删除吗？</h3>
                <p className="text-sm text-[#5D4037]/70 leading-relaxed">
                  您即将删除 <span className="font-bold text-red-600">{selectedPhotos.size}</span> 张照片，此操作不可撤销。
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors"
                >
                  取消
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={confirmBatchDelete}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-red-600 text-white shadow-md hover:bg-red-700 transition-all"
                >
                  确认删除
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ImagePreview 组件 */}
      <ImagePreview
        images={previewPhotos.map(p => p.original_url)}
        downloadUrls={previewPhotos.map(p => p.original_url)}
        currentIndex={previewCurrentIndex}
        isOpen={!!fullscreenPhoto}
        onClose={() => setFullscreenPhoto(null)}
        onIndexChange={(index) => {
          const target = previewPhotos[index];
          setFullscreenPhoto(target?.id || null);
          if (target?.id) {
            void incrementPhotoViewCount(target.id);
          }
        }}
        onDownload={(index) => {
          const target = previewPhotos[index];
          if (!target?.id) return;
          void incrementPhotoDownloadCount(target.id);
        }}
        showCounter={true}
        showScale={true}
        enableLongPressDownload={!isWechat}
      />

      {/* 赞赏弹窗 */}
      {albumData.album.donation_qr_code_url && (
        <DonationModal
          isOpen={showDonationModal}
          onClose={() => setShowDonationModal(false)}
          qrCodeUrl={albumData.album.donation_qr_code_url}
        />
      )}

      {/* 微信下载引导弹窗 */}
      <WechatDownloadGuide
        isOpen={showWechatGuide}
        onClose={() => setShowWechatGuide(false)}
        imageUrl={fullscreenPhoto ? photos.find((p) => p.id === fullscreenPhoto)?.original_url : undefined}
        isBatchDownload={selectedPhotos.size > 0 || !fullscreenPhoto}
        onTryDownload={executeBatchDownload}
      />

      {/* Toast 提示 */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`px-6 py-3 rounded-full shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}>
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


