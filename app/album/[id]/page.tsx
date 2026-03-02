'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Download, Sparkles, CheckSquare, Square, Trash2, ArrowLeft, X, Heart, RotateCcw } from 'lucide-react';
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
  story_text?: string | null;
  has_story?: boolean;
  is_highlight?: boolean;
  width: number;
  height: number;
  is_public: boolean;
  blurhash?: string;
  rating?: number;
  comments?: Comment[];
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
  const [storyOpenMap, setStoryOpenMap] = useState<Record<string, boolean>>({});
  const [showDonationModal, setShowDonationModal] = useState(false); // 赞赏弹窗显示状态
  const [showWechatGuide, setShowWechatGuide] = useState(false); // 微信下载引导弹窗
  const [isWechat, setIsWechat] = useState(false); // 是否在微信浏览器中
  const photosRef = useRef<Photo[]>([]);
  const photoScrollRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const photoLoadTokenRef = useRef(0);
  const selectedFolderRef = useRef(selectedFolder);

  const markGalleryDirty = () => {
    markGalleryCacheDirty();
    void mutate(
      (key: unknown) => Array.isArray(key) && key[0] === 'gallery',
      undefined,
      { revalidate: false }
    );
  };

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
      const pageRows = Array.isArray(payload.photos) ? (payload.photos as Photo[]) : [];
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

  const loadAlbumData = async () => {
    setLoading(true);
    setLoadingMore(false);
    setHasMore(true);
    setPageNo(0);
    setTotalPhotos(0);
    setPhotos([]);
    photosRef.current = [];
    setSelectedFolder('all');
    selectedFolderRef.current = 'all';
    photoLoadTokenRef.current += 1;

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
    setLoading(false);

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
    const normalized = String(folderId || 'all');
    if (normalized === selectedFolder) return;

    setSelectedFolder(normalized);
    selectedFolderRef.current = normalized;
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

  const toggleStoryCard = (photoId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    setStoryOpenMap((prev) => ({
      ...prev,
      [photoId]: !prev[photoId],
    }));
  };

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

  const toggleSelectAll = () => {
    if (selectedPhotos.size === filteredPhotos.length) {
      setSelectedPhotos(new Set());
    } else {
      setSelectedPhotos(new Set(filteredPhotos.map(p => p.id)));
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
              时光中...
            </p>
            <p className="text-sm text-[#5D4037]/60">
              正在为你打开专属回忆
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  if (!albumData) {
    return null;
  }

  const folders = [
    { id: 'all', name: '原图' },
    ...albumData.folders
  ];

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
              {albumData.album.title || '专属回忆'}
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
              {(() => {
                const expiresAt = albumData.album.expires_at;
                if (!expiresAt) {
                  // 如果没有过期时间，显示默认的7天提示
                  return (
                    <>
                      <span className="inline-block">✨ 这里的照片只有 7 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......</span>
                      <span className="inline-block ml-8">✨ 这里的照片只有 7 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......</span>
                    </>
                  );
                }

                const expiryDate = parseDateTimeUTC8(expiresAt);
                if (!expiryDate) {
                  return (
                    <>
                      <span className="inline-block">✨ 这里的照片只有 7 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......</span>
                      <span className="inline-block ml-8">✨ 这里的照片只有 7 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......</span>
                    </>
                  );
                }
                const daysLeft = Math.ceil((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

                const message = daysLeft > 0
                  ? `✨ 这里的照片只有 ${daysLeft} 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......`
                  : `✨ 这里的照片魔法时效已过期，未被【定格】的照片已经消失......`;

                return (
                  <>
                    <span className="inline-block">{message}</span>
                    <span className="inline-block ml-8">{message}</span>
                  </>
                );
              })()}
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

      {/* 折叠式工具栏 */}
      <div className="flex-none h-12 sticky top-0 bg-[#FFFBF0] z-10 px-3 flex items-center gap-2 border-b border-[#5D4037]/5">
        {/* 左侧：文件夹胶囊 */}
        <div className="flex-1 flex gap-1.5 overflow-x-auto scrollbar-hidden">
          {folders.map((folder) => (
            <motion.button
              key={folder.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => { void handleSelectFolder(folder.id); }}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all
                ${selectedFolder === folder.id
                  ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                  : 'bg-white/60 text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
                }
              `}
            >
              {folder.name}
            </motion.button>
          ))}
        </div>

        {/* 右侧：功能图标按钮 */}
        <div className="flex-none flex items-center gap-1.5">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={toggleSelectAll}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              selectedPhotos.size === filteredPhotos.length
                ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                : 'bg-white/60 text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
            }`}
          >
            {selectedPhotos.size === filteredPhotos.length ? (
              <>
                <CheckSquare className="w-4 h-4" />
                <span>全选</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" />
                <span>全选</span>
              </>
            )}
          </motion.button>

          {/* 下载按钮 - 常驻显示 */}
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleBatchDownload}
            className={`flex-shrink-0 flex items-center gap-1.5 rounded-full text-xs font-bold transition-all ${
              selectedPhotos.size > 0
                ? 'compact-button w-9 h-9 bg-[#FFC857] shadow-sm justify-center relative'
                : 'px-3 py-1.5 bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
            }`}
          >
            <Download className="w-4 h-4" />
            {selectedPhotos.size > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[#5D4037] text-white text-[11px] rounded-full flex items-center justify-center font-bold">
                {selectedPhotos.size}
              </span>
            ) : (
              <span>全部下载</span>
            )}
          </motion.button>

          {/* 删除按钮 - 仅在选中时显示 */}
          {selectedPhotos.size > 0 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.9 }}
              onClick={handleBatchDelete}
              className="compact-button w-9 h-9 rounded-full bg-red-500/10 shadow-sm flex items-center justify-center"
            >
              <Trash2 className="w-6 h-6 text-red-600" />
            </motion.button>
          )}
        </div>
      </div>

      {/* 照片瀑布流 - 可滚动 */}
      <div
        ref={photoScrollRef}
        onScroll={handlePhotoScroll}
        className="flex-1 overflow-y-auto px-2 pt-3 pb-32"
      >
        <div className="columns-2 gap-2">
          {filteredPhotos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="break-inside-avoid mb-2"
            >
              {/* 瀑布流卡片 */}
              <div
                className={`bg-white rounded-xl shadow-sm hover:shadow-md overflow-hidden transition-all duration-300 border ${
                  isHighlighted(photo)
                    ? 'border-[3px] border-[#FFB703] bg-gradient-to-b from-[#FFFDF7] to-white ring-2 ring-[#FFD978] ring-offset-1 ring-offset-[#FFFBF0] shadow-[inset_0_0_0_1px_rgba(255,244,210,0.92),0_0_0_3px_rgba(255,183,3,0.42),0_18px_40px_rgba(255,183,3,0.46),0_8px_20px_rgba(93,64,55,0.2)]'
                    : 'border-transparent'
                }`}
              >
                {/* 图片区域 */}
                <div
                  className="relative cursor-pointer"
                  onClick={() => {
                    if (storyOpenMap[photo.id] && hasStory(photo)) {
                      return;
                    }
                    setFullscreenPhoto(photo.id);
                    void incrementPhotoViewCount(photo.id);
                  }}
                >
                  {storyOpenMap[photo.id] && hasStory(photo) ? (
                    <div className="min-h-[220px] p-3 bg-gradient-to-br from-[#FFF8E8] via-[#FFF1D6] to-[#FDE6B7] border-b border-[#5D4037]/10">
                      <div className="rounded-xl border border-[#C9B085]/35 bg-[linear-gradient(180deg,rgba(255,252,245,0.98)_0%,rgba(255,246,231,0.98)_100%)] px-3.5 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.72),0_10px_22px_rgba(93,64,55,0.12)]">
                        <span className="mb-2 inline-flex h-6 items-center rounded-full border border-[#5D4037]/20 bg-[#FFC857]/25 px-2.5 text-[11px] font-semibold text-[#5D4037]/85">
                          关于此刻
                        </span>
                        <p className="text-[13px] leading-6 text-[#5D4037]/92 font-medium whitespace-pre-wrap break-words tracking-[0.01em]">
                          {String(photo.story_text || '').trim()}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <img
                        src={photo.thumbnail_url}
                        alt={`照片 ${photo.id}`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-auto object-cover"
                        onLoad={() => setLoadedImages(prev => new Set([...prev, photo.id]))}
                        onError={() => setFailedImages(prev => new Set([...prev, photo.id]))}
                      />

                      {/* 拾光中加载动画 */}
                      {!loadedImages.has(photo.id) && !failedImages.has(photo.id) && (
                        <div
                          className="absolute inset-0 flex flex-col items-center justify-center gap-3"
                          style={{
                            background: 'linear-gradient(135deg, #FFFBF0 0%, #FFF8E8 50%, #FFF4E0 100%)'
                          }}
                        >
                          {/* 主动画 - 拍立得相机 */}
                          <motion.div
                            animate={{
                              rotate: [-2, 2, -2],
                              scale: [1, 1.05, 1]
                            }}
                            transition={{
                              duration: 2,
                              repeat: Infinity,
                              ease: 'easeInOut'
                            }}
                            className="relative"
                          >
                            <motion.div
                              className="text-4xl"
                              animate={{
                                filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)']
                              }}
                              transition={{
                                duration: 1.5,
                                repeat: Infinity,
                                ease: 'easeInOut'
                              }}
                            >
                              📷
                            </motion.div>

                            {/* 闪光效果 */}
                            <motion.div
                              className="absolute -top-1 -right-1 text-xl"
                              animate={{
                                opacity: [0, 1, 0],
                                scale: [0.5, 1.2, 0.5]
                              }}
                              transition={{
                                duration: 2,
                                repeat: Infinity,
                                ease: 'easeOut'
                              }}
                            >
                              ✨
                            </motion.div>
                          </motion.div>

                          {/* 加载文字 */}
                          <motion.p
                            className="text-xs text-[#5D4037]/60 font-medium"
                            animate={{
                              opacity: [0.6, 1, 0.6]
                            }}
                            transition={{
                              duration: 1.5,
                              repeat: Infinity,
                              ease: 'easeInOut'
                            }}
                            style={{ fontFamily: "'ZQKNNY', cursive" }}
                          >
                            拾光中...
                          </motion.p>

                          {/* 装饰性元素 - 飘动的光点 */}
                          <motion.div
                            className="absolute top-1/4 left-1/4 text-sm opacity-30"
                            animate={{
                              y: [-10, 10, -10],
                              x: [-5, 5, -5],
                              rotate: [0, 360]
                            }}
                            transition={{
                              duration: 4,
                              repeat: Infinity,
                              ease: 'easeInOut'
                            }}
                          >
                            ✨
                          </motion.div>
                          <motion.div
                            className="absolute bottom-1/4 right-1/4 text-sm opacity-30"
                            animate={{
                              y: [10, -10, 10],
                              x: [5, -5, 5],
                              rotate: [360, 0]
                            }}
                            transition={{
                              duration: 3.5,
                              repeat: Infinity,
                              ease: 'easeInOut',
                              delay: 0.5
                            }}
                          >
                            💫
                          </motion.div>
                        </div>
                      )}

                      {/* 加载失败提示 */}
                      {failedImages.has(photo.id) && (
                        <div className="absolute inset-0 bg-[#FFFBF0] flex items-center justify-center">
                          <div className="flex flex-col items-center gap-2 text-center px-4">
                            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                              <X className="w-6 h-6 text-red-500" />
                            </div>
                            <p className="text-xs text-[#5D4037]/60">加载失败</p>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setFailedImages(prev => {
                                  const newSet = new Set(prev);
                                  newSet.delete(photo.id);
                                  return newSet;
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
                      className={`absolute top-2 right-12 w-8 h-8 rounded-full backdrop-blur-sm border flex items-center justify-center transition-all ${
                        isHighlighted(photo)
                          ? 'bg-[#FFC857] border-[#5D4037]/45 text-[#5D4037] ring-2 ring-[#FFE3A0]/95 shadow-[0_10px_22px_rgba(255,183,3,0.62)] hover:scale-105 animate-pulse'
                          : 'bg-black/35 border-white/35 text-white hover:bg-black/50'
                      }`}
                      aria-label="查看关于此刻"
                      title="关于此刻"
                    >
                      <RotateCcw
                        className={`w-4 h-4 transition-transform duration-300 ${
                          storyOpenMap[photo.id] ? 'rotate-180' : ''
                        } ${isHighlighted(photo) ? 'drop-shadow-[0_1px_0_rgba(255,255,255,0.45)]' : ''}`}
                      />
                    </button>
                  )}

                  {/* 选择框 */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                    className="compact-button absolute top-2 right-2 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md border-2 border-white/50 transition-all"
                  >
                    {selectedPhotos.has(photo.id) ? (
                      <CheckSquare className="w-6 h-6 text-[#FFC857]" />
                    ) : (
                      <Square className="w-6 h-6 text-[#5D4037]/40" />
                    )}
                  </motion.button>
                </div>

                {/* 操作栏 */}
                <div className="p-2 flex items-center justify-center">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => photo.is_public ? togglePublic(photo.id) : setConfirmPhotoId(photo.id)}
                    className={`
                      compact-button flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                      ${photo.is_public
                        ? 'bg-[#FFC857] text-[#5D4037]'
                        : 'bg-[#5D4037]/10 text-[#5D4037]/60'
                      }
                    `}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{photo.is_public ? '已定格' : '定格'}</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
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
            <p className="text-xs text-[#5D4037]/60">拾光中...</p>
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
        images={filteredPhotos.map(p => p.original_url)}
        downloadUrls={filteredPhotos.map(p => p.original_url)}
        currentIndex={filteredPhotos.findIndex(p => p.id === fullscreenPhoto)}
        isOpen={!!fullscreenPhoto}
        onClose={() => setFullscreenPhoto(null)}
        onIndexChange={(index) => {
          const target = filteredPhotos[index];
          setFullscreenPhoto(target?.id || null);
          if (target?.id) {
            void incrementPhotoViewCount(target.id);
          }
        }}
        onDownload={(index) => {
          const target = filteredPhotos[index];
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




