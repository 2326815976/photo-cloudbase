'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ArrowRightLeft, FolderPlus, Upload, Trash2, Image as ImageIcon, Folder, X, CheckCircle, XCircle, AlertCircle, Pencil, ChevronUp, ChevronDown, ArrowUpToLine, RotateCcw, Sparkles, Calendar, Eye, EyeOff, Download, MapPin, Heart } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateAlbumImageVersions, generateGalleryImageVersions } from '@/lib/utils/image-versions';
import { generateBlurHash } from '@/lib/utils/blurhash';
import { uploadToCloudBaseDirect } from '@/lib/storage/cloudbase-upload-client';
import { getTodayUTC8 } from '@/lib/utils/date-helpers';
import { markGalleryCacheDirty } from '@/lib/gallery/cache-sync';
import { useBeforeUnloadGuard } from '@/lib/hooks/useBeforeUnloadGuard';
import AdminLoadingCard from '../../components/AdminLoadingCard';
import { useAutoLoadMore } from '../../hooks/useAutoLoadMore';

interface Album {
  id: string;
  title: string;
  access_key: string;
  root_folder_name?: string | null;
  hide_root_folder?: boolean | null;
}

interface AlbumFolder {
  id: string;
  name: string;
  is_hidden?: boolean | null;
  sort_order?: number | null;
  created_at: string;
  photoCount?: number | null;
}

interface Photo {
  id: string;
  url?: string | null;
  thumbnail_url?: string | null;  // 新字段
  preview_url?: string | null;    // 新字段
  original_url?: string | null;   // 新字段
  folder_id: string | null;
  is_public?: boolean | null;
  story_text?: string | null;
  has_story?: boolean;
  is_highlight?: boolean;
  like_count?: number | null;
  sort_order?: number | null;
  shot_date?: string | null;
  shot_location?: string | null;
  width: number | null;
  height: number | null;
  view_count?: number | null;
  download_count?: number | null;
  created_at: string;
}

const ROOT_FOLDER_SENTINEL = '__ROOT__';
const DEFAULT_PHOTO_SORT_ORDER = 2147483647;
const TOP_PIN_SORT_ORDER = 1;
const TOP_PIN_CONFLICT_SORT_ORDER = 11;
const SYSTEM_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';
const DELETE_FOLDER_CONFIRM_PHRASE = '确认删除';
const DELETE_FOLDER_MANUAL_CONFIRM_THRESHOLD = 10;
const ALBUM_PHOTO_STORY_SORT_MIGRATION_HINT = '数据库缺少 story_text / is_highlight / sort_order 字段，请先执行 SQL 迁移：photo/sql/migrations/06_album_photo_story_sort.sql';
const ALBUM_FOLDER_SORT_MIGRATION_HINT = '\u6570\u636e\u5e93\u7f3a\u5c11 album_folders.sort_order \u5b57\u6bb5\uff0c\u8bf7\u5148\u6267\u884c SQL \u8fc1\u79fb\uff1aphoto/sql/migrations/15_album_folder_sort_order.sql';
const ALBUM_FOLDER_VISIBILITY_MIGRATION_HINT = '数据库缺少 album_folders.is_hidden 字段，请先执行 SQL 迁移：photo/sql/migrations/32_album_folder_visibility.sql';
const ALBUM_PHOTO_SHOT_DATE_MIGRATION_HINT = '数据库缺少 shot_date 字段，请先执行 SQL 迁移：photo/sql/migrations/07_album_photo_shot_date.sql';
const ALBUM_PHOTO_SHOT_LOCATION_MIGRATION_HINT = '数据库缺少 shot_location 字段，请先执行 SQL 迁移：photo/sql/migrations/08_album_photo_shot_location.sql';

const ALBUM_ROOT_FOLDER_VISIBILITY_MIGRATION_HINT = '数据库缺少 albums.hide_root_folder 字段，请先执行 SQL 迁移：photo/sql/migrations/33_album_root_folder_visibility.sql';

const normalizeStoryText = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const lowered = text.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined' || lowered === 'none' || lowered === 'nil') {
    return null;
  }
  return text;
};

const normalizeShotDate = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const matched = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!matched) {
    return null;
  }
  return `${matched[1]}-${matched[2]}-${matched[3]}`;
};

const normalizeShotLocation = (value: unknown): string | null => {
  const raw = String(value ?? '').trim();
  if (!raw) {
    return null;
  }
  const lowered = raw.toLowerCase();
  if (lowered === 'null' || lowered === 'undefined') {
    return null;
  }
  return raw.slice(0, 255);
};

const resolvePhotoDisplayDate = (photo: Photo): string | null =>
  normalizeShotDate(photo.shot_date) || normalizeShotDate(photo.created_at);

const normalizeDbBoolean = (value: unknown, fallback = true): boolean => {
  if (value === undefined || value === null || value === '') {
    return Boolean(fallback);
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
  return Boolean(fallback);
};

const normalizePhotoSortOrder = (value: unknown): number => {
  const sortValue = Number(value);
  return Number.isFinite(sortValue) && sortValue > 0 ? Math.round(sortValue) : DEFAULT_PHOTO_SORT_ORDER;
};

const normalizeFolderSortOrder = (value: unknown): number => {
  const sortValue = Number(value);
  return Number.isFinite(sortValue) && sortValue > 0 ? Math.round(sortValue) : DEFAULT_PHOTO_SORT_ORDER;
};

const sortAlbumFolders = (rows: AlbumFolder[]): AlbumFolder[] =>
  [...rows].sort((a, b) => {
    const normalizedA = normalizeFolderSortOrder(a.sort_order);
    const normalizedB = normalizeFolderSortOrder(b.sort_order);
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;
    return String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id));
  });

const sortAdminAlbumPhotos = (rows: Photo[], isSystemWallAlbum: boolean): Photo[] =>
  [...rows].sort((a, b) => {
    const normalizedA = normalizePhotoSortOrder(a.sort_order);
    const normalizedB = normalizePhotoSortOrder(b.sort_order);
    if (normalizedA !== normalizedB) return normalizedA - normalizedB;

    if (isSystemWallAlbum) {
      const displayDateA = resolvePhotoDisplayDate(a) || '';
      const displayDateB = resolvePhotoDisplayDate(b) || '';
      if (displayDateA !== displayDateB) {
        return displayDateB.localeCompare(displayDateA, 'zh-CN');
      }
    }

    const timeA = new Date(String(a.created_at || '')).getTime();
    const timeB = new Date(String(b.created_at || '')).getTime();
    return (Number.isFinite(timeB) ? timeB : 0) - (Number.isFinite(timeA) ? timeA : 0);
  });

const formatPhotoDateText = (value: string | null): string => {
  if (!value) {
    return '----/--/--';
  }
  return value.replace(/-/g, '/');
};

const isColumnMissingError = (message: string, column: string): boolean => {
  const normalized = String(message || '').toLowerCase();
  const target = String(column || '').trim().toLowerCase();
  if (!target) return false;
  return (
    normalized.includes('unknown column') && normalized.includes(target)
  ) || (
    normalized.includes('column') && normalized.includes('not found') && normalized.includes(target)
  ) || (
    normalized.includes('does not exist') && normalized.includes(target)
  );
};

const buildSortOrderValue = (index: number): number => (index + 1) * 10;

type AlbumDetailPageContentProps = {
  albumIdOverride?: string;
  forceSystemWall?: boolean;
};

export function AlbumDetailPageContent({
  albumIdOverride,
  forceSystemWall = false,
}: AlbumDetailPageContentProps = {}) {
  const router = useRouter();
  const params = useParams();
  const albumId = String(albumIdOverride || params.id || '');
  const isSystemWallAlbum = forceSystemWall || String(albumId) === SYSTEM_WALL_ALBUM_ID;

  const [album, setAlbum] = useState<Album | null>(null);
  const [folders, setFolders] = useState<AlbumFolder[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  useBeforeUnloadGuard(uploading);
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('batch');
  const [singleImage, setSingleImage] = useState<File | null>(null);
  const [singleStoryText, setSingleStoryText] = useState('');
  const [singleHighlight, setSingleHighlight] = useState(false);
  const [singleShotDate, setSingleShotDate] = useState(getTodayUTC8());
  const [singleShotLocation, setSingleShotLocation] = useState('');
  const [batchShotDate, setBatchShotDate] = useState(getTodayUTC8());
  const [batchShotLocation, setBatchShotLocation] = useState('');
  const [batchImages, setBatchImages] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [pendingSelectAllPhotos, setPendingSelectAllPhotos] = useState(false);
  const photosPerPage = 20;
  const [photoVisibleCount, setPhotoVisibleCount] = useState(photosPerPage);
  const [totalCount, setTotalCount] = useState(0);
  const [currentFolderTotalCount, setCurrentFolderTotalCount] = useState(0);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<AlbumFolder | null>(null);
  const [deleteFolderConfirmText, setDeleteFolderConfirmText] = useState('');
  const [deletingPhoto, setDeletingPhoto] = useState<Photo | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingPhotoIds, setMovingPhotoIds] = useState<string[]>([]);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>(ROOT_FOLDER_SENTINEL);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [showEditRootModal, setShowEditRootModal] = useState(false);
  const [newRootFolderName, setNewRootFolderName] = useState('');
  const [showEditFolderModal, setShowEditFolderModal] = useState(false);
  const [editingFolder, setEditingFolder] = useState<AlbumFolder | null>(null);
  const [editingFolderName, setEditingFolderName] = useState('');
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [editingStoryPhoto, setEditingStoryPhoto] = useState<Photo | null>(null);
  const [editingStoryText, setEditingStoryText] = useState('');
  const [editingHighlight, setEditingHighlight] = useState(false);
  const [showShotDateModal, setShowShotDateModal] = useState(false);
  const [editingShotDatePhoto, setEditingShotDatePhoto] = useState<Photo | null>(null);
  const [editingShotDateValue, setEditingShotDateValue] = useState(getTodayUTC8());
  const [editingShotLocationValue, setEditingShotLocationValue] = useState('');
  const albumLoadTokenRef = useRef(0);

  const invalidatePublicGalleryCache = () => {
    if (!isSystemWallAlbum) {
      return;
    }
    markGalleryCacheDirty();
  };

  useEffect(() => {
    void loadAlbumData();

    return () => {
      albumLoadTokenRef.current += 1;
    };
  }, [albumId, photoVisibleCount]);

  useEffect(() => {
    if (photos.length > 0) {
      // 只加载尚未加载的照片URL
      const photosToLoad = photos.filter(photo => !photoUrls[photo.id]);
      if (photosToLoad.length > 0) {
        loadPhotoUrls(photosToLoad);
      }
    }
  }, [photos]);

  useEffect(() => {
    if (!selectedFolder) {
      return;
    }
    const exists = (folders || []).some((folder) => String(folder.id) === String(selectedFolder));
    if (!exists) {
      setSelectedFolder(null);
    }
  }, [folders, selectedFolder]);

  const photoHasMoreVisible = !isSystemWallAlbum && photos.length < totalCount;
  const deleteFolderNeedsManualConfirm =
    Math.max(0, Number(deletingFolder?.photoCount || 0)) >= DELETE_FOLDER_MANUAL_CONFIRM_THRESHOLD;
  const deleteFolderConfirmMatched = deleteFolderConfirmText.trim() === DELETE_FOLDER_CONFIRM_PHRASE;

  const handleAutoLoadPhotos = useCallback(() => {
    setPhotoVisibleCount((prev) => prev + photosPerPage);
  }, []);

  useAutoLoadMore({
    enabled: photoHasMoreVisible,
    isLoading: loading || loadingMore,
    onLoadMore: handleAutoLoadPhotos,
  });

  const loadAlbumData = async () => {
    const loadToken = albumLoadTokenRef.current + 1;
    albumLoadTokenRef.current = loadToken;
    const isFirstLoad = !album && photos.length === 0 && folders.length === 0;

    setLoading(isFirstLoad);
    setLoadingMore(!isFirstLoad);
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      setLoadingMore(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const [albumRes, initialFoldersRes] = await Promise.all([
      dbClient.from('albums').select('*').eq('id', albumId).single(),
      dbClient.from('album_folders').select('*').eq('album_id', albumId).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
    ]);

    let foldersRes = initialFoldersRes;
    if (foldersRes.error && isColumnMissingError(foldersRes.error.message || '', 'sort_order')) {
      foldersRes = await dbClient.from('album_folders').select('*').eq('album_id', albumId).order('created_at', { ascending: true });
    }

    let photosQuery = dbClient
      .from('album_photos')
      .select('*', { count: 'exact' })
      .eq('album_id', albumId)
      .order('sort_order', { ascending: true });
    photosQuery = isSystemWallAlbum
      ? photosQuery.order('shot_date', { ascending: false }).order('created_at', { ascending: false })
      : photosQuery.order('created_at', { ascending: false });

    let photosRes = isSystemWallAlbum
    ? await photosQuery
    : await photosQuery.range(0, Math.max(0, photoVisibleCount - 1));

    if (loadToken !== albumLoadTokenRef.current) {
      return;
    }

    if (photosRes.error && isColumnMissingError(photosRes.error.message || '', 'sort_order')) {
      let fallbackQuery = dbClient
        .from('album_photos')
        .select('*', { count: 'exact' })
        .eq('album_id', albumId);
      fallbackQuery = isSystemWallAlbum
        ? fallbackQuery.order('shot_date', { ascending: false }).order('created_at', { ascending: false })
        : fallbackQuery.order('created_at', { ascending: false });
      photosRes = isSystemWallAlbum
        ? await fallbackQuery
        : await fallbackQuery.range(0, Math.max(0, photoVisibleCount - 1));
    }

    if (isSystemWallAlbum && photosRes.error && isColumnMissingError(photosRes.error.message || '', 'shot_date')) {
      photosRes = await dbClient
        .from('album_photos')
        .select('*', { count: 'exact' })
        .eq('album_id', albumId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (photosRes.error && isColumnMissingError(photosRes.error.message || '', 'sort_order')) {
        photosRes = await dbClient
          .from('album_photos')
          .select('*', { count: 'exact' })
          .eq('album_id', albumId)
          .order('created_at', { ascending: false });
      }
    }

    if (loadToken !== albumLoadTokenRef.current) {
      return;
    }

    if (albumRes.data) setAlbum(albumRes.data);
    if (foldersRes.data) {
      setFolders(
        sortAlbumFolders(
          foldersRes.data.map((folder: AlbumFolder) => ({
            ...folder,
            is_hidden: normalizeDbBoolean(folder.is_hidden, false),
            sort_order: normalizeFolderSortOrder(folder.sort_order),
          }))
        )
      );
    }
    if (photosRes.error) {
      setShowToast({ message: `加载照片失败：${photosRes.error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
    if (photosRes.data) {
      const normalized = photosRes.data.map((row: any) => ({
        ...row,
        url: String(row.url ?? row.original_url ?? row.preview_url ?? row.thumbnail_url ?? '').trim() || null,
        thumbnail_url: String(row.thumbnail_url ?? row.preview_url ?? row.original_url ?? row.url ?? '').trim() || null,
        preview_url: String(row.preview_url ?? row.original_url ?? row.thumbnail_url ?? row.url ?? '').trim() || null,
        original_url: String(row.original_url ?? row.preview_url ?? row.thumbnail_url ?? row.url ?? '').trim() || null,
        story_text: normalizeStoryText(row.story_text),
        has_story: Boolean(normalizeStoryText(row.story_text)),
        is_highlight: Boolean(row.is_highlight),
        is_public: normalizeDbBoolean(row.is_public, true),
        like_count: Number.isFinite(Number(row.like_count)) ? Math.max(0, Math.round(Number(row.like_count))) : 0,
        shot_date: normalizeShotDate(row.shot_date),
        shot_location: normalizeShotLocation(row.shot_location),
        view_count: Number.isFinite(Number(row.view_count)) ? Math.max(0, Math.round(Number(row.view_count))) : 0,
        download_count: Number.isFinite(Number(row.download_count)) ? Math.max(0, Math.round(Number(row.download_count))) : 0,
        sort_order: normalizePhotoSortOrder(row.sort_order),
      }));
      setPhotos(sortAdminAlbumPhotos(normalized, isSystemWallAlbum));
      setTotalCount(photosRes.count || normalized.length);
    }

    setLoading(false);
    setLoadingMore(false);
  };

  const loadPhotoUrls = async (photosToLoad: Photo[]) => {
    const dbClient = createClient();
    if (!dbClient) {
      return;
    }

    // 过滤掉所有URL字段都为空的照片，优先使用新字段
    const validPhotos = photosToLoad.filter((photo): photo is Photo & { thumbnail_url?: string | null; url?: string | null } => {
      const url = photo.thumbnail_url || photo.preview_url || photo.original_url || photo.url;
      return url !== null && url !== undefined;
    });

    if (validPhotos.length === 0) {
      return;
    }

    // 并行生成所有URL，优先使用 thumbnail_url
    const urlPromises = validPhotos.map(photo => {
      const storageUrl = photo.thumbnail_url || photo.preview_url || photo.original_url || photo.url;
      // 云存储返回的是完整公开 URL，直接使用
      return Promise.resolve({ id: photo.id, url: storageUrl });
    });

    const results = await Promise.all(urlPromises);

    // 合并新加载的URL到现有的photoUrls
    setPhotoUrls(prev => {
      const newUrls = { ...prev };
      results.forEach(result => {
        if (result.url) {
          newUrls[result.id] = result.url;
        }
      });
      return newUrls;
    });
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setShowToast({ message: '请输入文件夹名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await dbClient.from('album_folders').insert({
      album_id: albumId,
      name: newFolderName,
    });

    setActionLoading(false);

    if (!error) {
      setNewFolderName('');
      setShowNewFolderModal(false);
      loadAlbumData();
      invalidatePublicGalleryCache();
      setShowToast({ message: '文件夹创建成功', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `创建失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleOpenEditRootModal = () => {
    const currentRootName = String(album?.root_folder_name ?? '').trim() || '根目录';
    setNewRootFolderName(currentRootName);
    setShowEditRootModal(true);
  };

  const handleUpdateRootFolderName = async () => {
    const targetName = newRootFolderName.trim();
    if (!targetName) {
      setShowToast({ message: '请输入根目录名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (targetName.length > 30) {
      setShowToast({ message: '根目录名称最多 30 个字符', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data: updated, error } = await dbClient
      .from('albums')
      .update({ root_folder_name: targetName })
      .eq('id', albumId)
      .select('id, root_folder_name')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setAlbum((prev) => (prev ? { ...prev, root_folder_name: targetName } : prev));
    setShowEditRootModal(false);
    invalidatePublicGalleryCache();
    setShowToast({ message: '根目录名称已更新', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleToggleRootFolderVisibility = async () => {
    if (actionLoading) {
      return;
    }

    const nextHidden = !normalizeDbBoolean(album?.hide_root_folder, false);
    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data: updatedAlbum, error } = await dbClient
      .from('albums')
      .update({ hide_root_folder: nextHidden ? 1 : 0 })
      .eq('id', albumId)
      .select('id, hide_root_folder')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      if (isColumnMissingError(error.message || '', 'hide_root_folder')) {
        setShowToast({ message: ALBUM_ROOT_FOLDER_VISIBILITY_MIGRATION_HINT, type: 'warning' });
      } else {
        setShowToast({ message: `更新失败：${error.message}`, type: 'error' });
      }
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!updatedAlbum) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const resolvedHidden = normalizeDbBoolean(updatedAlbum.hide_root_folder, nextHidden);
    setAlbum((prev) => (prev ? { ...prev, hide_root_folder: resolvedHidden } : prev));
    invalidatePublicGalleryCache();
    setShowToast({ message: resolvedHidden ? '根目录已隐藏' : '根目录已显示', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleOpenEditFolderModal = (folder: AlbumFolder) => {
    if (actionLoading) {
      return;
    }
    setEditingFolder(folder);
    setEditingFolderName(String(folder.name || '').trim());
    setShowEditFolderModal(true);
  };

  const handleUpdateFolderName = async () => {
    if (actionLoading || !editingFolder) {
      return;
    }

    const targetName = editingFolderName.trim();
    if (!targetName) {
      setShowToast({ message: '请输入文件夹名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (targetName.length > 50) {
      setShowToast({ message: '文件夹名称最多 50 个字符', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data: updatedFolder, error } = await dbClient
      .from('album_folders')
      .update({ name: targetName })
      .eq('id', editingFolder.id)
      .eq('album_id', albumId)
      .select('id, name, sort_order, created_at')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!updatedFolder) {
      setShowToast({ message: '文件夹不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setFolders((prev) => prev.map((folder) => (
      String(folder.id) === String(updatedFolder.id)
        ? { ...folder, name: String(updatedFolder.name || '').trim() }
        : folder
    )));
    setEditingFolder(null);
    setEditingFolderName('');
    setShowEditFolderModal(false);
    invalidatePublicGalleryCache();
    setShowToast({ message: '文件夹名称已更新', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleToggleFolderVisibility = async (folder: AlbumFolder) => {
    if (actionLoading) {
      return;
    }

    const nextHidden = !normalizeDbBoolean(folder.is_hidden, false);
    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data: updatedFolder, error } = await dbClient
      .from('album_folders')
      .update({ is_hidden: nextHidden ? 1 : 0 })
      .eq('id', folder.id)
      .eq('album_id', albumId)
      .select('id, is_hidden')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      if (isColumnMissingError(error.message || '', 'is_hidden')) {
        setShowToast({ message: ALBUM_FOLDER_VISIBILITY_MIGRATION_HINT, type: 'warning' });
      } else {
        setShowToast({ message: `更新失败：${error.message}`, type: 'error' });
      }
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!updatedFolder) {
      setShowToast({ message: '文件夹不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setFolders((prev) =>
      prev.map((item) => (
        String(item.id) === String(folder.id)
          ? { ...item, is_hidden: normalizeDbBoolean(updatedFolder.is_hidden, nextHidden) }
          : item
      ))
    );
    invalidatePublicGalleryCache();
    setShowToast({ message: nextHidden ? '文件夹已隐藏' : '文件夹已显示', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const persistFolderOrder = async (reordered: AlbumFolder[], successMessage: string) => {
    const currentMap = new Map<string, number>();
    folders.forEach((item, index) => {
      currentMap.set(String(item.id), normalizeFolderSortOrder(item.sort_order ?? buildSortOrderValue(index)));
    });

    const desiredMap = new Map<string, number>();
    reordered.forEach((item, index) => {
      desiredMap.set(String(item.id), buildSortOrderValue(index));
    });

    const changed = reordered.filter((item) => currentMap.get(String(item.id)) !== desiredMap.get(String(item.id)));
    if (changed.length === 0) {
      return;
    }

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '\u670d\u52a1\u521d\u59cb\u5316\u5931\u8d25\uff0c\u8bf7\u5237\u65b0\u540e\u91cd\u8bd5', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      for (const item of changed) {
        const sortOrder = desiredMap.get(String(item.id));
        const { error } = await dbClient
          .from('album_folders')
          .update({ sort_order: sortOrder })
          .eq('id', item.id)
          .eq('album_id', albumId);

        if (error) {
          if (isColumnMissingError(error.message || '', 'sort_order')) {
            throw new Error(ALBUM_FOLDER_SORT_MIGRATION_HINT);
          }
          throw error;
        }
      }

      setFolders((prev) =>
        sortAlbumFolders(
          prev.map((item) => {
            const nextSort = desiredMap.get(String(item.id));
            if (!Number.isFinite(nextSort as number)) return item;
            return {
              ...item,
              sort_order: nextSort as number,
            };
          })
        )
      );
      invalidatePublicGalleryCache();
      setShowToast({ message: successMessage, type: 'success' });
      setTimeout(() => setShowToast(null), 2000);
    } catch (error: any) {
      setShowToast({ message: `\u6587\u4ef6\u5939\u6392\u5e8f\u5931\u8d25\uff1a${error.message || '\u8bf7\u7a0d\u540e\u91cd\u8bd5'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const moveFolderByDirection = async (folderId: string, direction: 'top' | 'up' | 'down') => {
    if (actionLoading) return;

    const list = [...folders];
    const currentIndex = list.findIndex((item) => String(item.id) === String(folderId));
    if (currentIndex < 0) return;

    let targetIndex = currentIndex;
    if (direction === 'top') targetIndex = 0;
    if (direction === 'up') targetIndex = currentIndex - 1;
    if (direction === 'down') targetIndex = currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= list.length || targetIndex === currentIndex) {
      return;
    }

    const reordered = [...list];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const successMessage = direction === 'top' ? '\u6587\u4ef6\u5939\u5df2\u7f6e\u9876' : direction === 'up' ? '\u6587\u4ef6\u5939\u5df2\u4e0a\u79fb' : '\u6587\u4ef6\u5939\u5df2\u4e0b\u79fb';
    await persistFolderOrder(reordered, successMessage);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) {
      return;
    }
    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { count, error } = await dbClient
      .from('album_photos')
      .select('id', { count: 'exact' })
      .eq('album_id', albumId)
      .eq('folder_id', folderId)
      .range(0, 0);

    if (error) {
      setShowToast({ message: `暂时无法校验文件夹照片数量：${error.message}`, type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setDeletingFolder({
      ...folder,
      photoCount: Math.max(0, Number(count || 0)),
    });
    setDeleteFolderConfirmText('');
  };

  const confirmDeleteFolder = async () => {
    if (!deletingFolder) return;
    if (deleteFolderNeedsManualConfirm && !deleteFolderConfirmMatched) {
      setShowToast({ message: `该文件夹照片较多，请先输入“${DELETE_FOLDER_CONFIRM_PHRASE}”再继续`, type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: deletedFolder, error } = await dbClient
      .from('album_folders')
      .delete()
      .eq('id', deletingFolder.id)
      .select('id')
      .maybeSingle();

    setActionLoading(false);
    setDeletingFolder(null);
    setDeleteFolderConfirmText('');

    if (error) {
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!deletedFolder) {
      loadAlbumData();
      setShowToast({ message: '文件夹不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      loadAlbumData();
      invalidatePublicGalleryCache();
      const currentRootName = String(album?.root_folder_name ?? '').trim() || '根目录';
      setShowToast({ message: `文件夹已删除，照片已移至${currentRootName}`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const closeDeleteFolderModal = () => {
    if (actionLoading) {
      return;
    }
    setDeletingFolder(null);
    setDeleteFolderConfirmText('');
  };

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const cleanupUploadedFiles = async (keys: string[]) => {
    const normalized = Array.from(new Set(keys.map((item) => String(item ?? '').trim()).filter(Boolean)));
    if (normalized.length === 0) {
      return;
    }

    try {
      await fetch('/api/batch-delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ keys: normalized }),
      });
    } catch (cleanupError) {
      console.error('清理上传失败的云存储文件失败:', cleanupError);
    }
  };

  const resolveUploadFolderId = async (dbClient: any, folderId: string | null): Promise<string | null> => {
    const normalized = String(folderId ?? '').trim();
    if (!normalized) {
      return null;
    }

    const exists = (folders || []).some((folder) => String(folder.id) === normalized);
    if (!exists) {
      return null;
    }

    const { data, error } = await dbClient
      .from('album_folders')
      .select('id')
      .eq('id', normalized)
      .eq('album_id', albumId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return normalized;
  };

  const isAlbumFolderForeignKeyError = (message: string): boolean => {
    const normalized = String(message || '').toLowerCase();
    return (
      normalized.includes('fk_album_photos_folder') ||
      (normalized.includes('foreign key') && normalized.includes('folder_id')) ||
      (normalized.includes('foreign key constraint fails') && normalized.includes('album_photos'))
    );
  };

  const insertAlbumPhotoWithCompat = async (
    dbClient: any,
    payload: {
      album_id: string;
      folder_id: string | null;
      thumbnail_url: string;
      preview_url: string;
      original_url: string;
      width: number;
      height: number;
      blurhash: string;
      story_text?: string | null;
      is_highlight?: boolean;
      sort_order?: number;
      shot_date?: string | null;
      shot_location?: string | null;
    }
  ): Promise<{ message: string } | null> => {
    const normalizedStory = normalizeStoryText(payload.story_text);
    const normalizedShotDate = normalizeShotDate(payload.shot_date);
    const normalizedShotLocation = normalizeShotLocation(payload.shot_location);
    const hasOptionalMeta =
      normalizedStory !== null ||
      Boolean(payload.is_highlight) ||
      Number.isFinite(Number(payload.sort_order)) ||
      normalizedShotDate !== null ||
      normalizedShotLocation !== null;

    const withOptionalFolderId = (
      row: Record<string, unknown>,
      folderId: string | null
    ): Record<string, unknown> => {
      const normalizedFolderId = String(folderId ?? '').trim();
      if (!normalizedFolderId) {
        return row;
      }
      return {
        ...row,
        folder_id: normalizedFolderId,
      };
    };

    const withOptionalStoryAndSort = (row: Record<string, unknown>): Record<string, unknown> => {
      const withMeta: Record<string, unknown> = { ...row };
      if (normalizedStory !== null) {
        withMeta.story_text = normalizedStory;
      } else if (Boolean(payload.is_highlight)) {
        withMeta.story_text = '';
      }
      if (Boolean(payload.is_highlight)) {
        withMeta.is_highlight = 1;
      }
      const sortOrderNumber = Number(payload.sort_order);
      if (Number.isFinite(sortOrderNumber) && sortOrderNumber > 0) {
        withMeta.sort_order = Math.round(sortOrderNumber);
      }
      if (normalizedShotDate !== null) {
        withMeta.shot_date = normalizedShotDate;
      }
      if (normalizedShotLocation !== null) {
        withMeta.shot_location = normalizedShotLocation;
      }
      return withMeta;
    };

    let lastError: { message: string } | null = null;

    const attemptPayloads = [payload];
    if (payload.folder_id) {
      attemptPayloads.push({
        ...payload,
        folder_id: null,
      });
    }

    for (const attemptPayload of attemptPayloads) {
      const folderId = String(attemptPayload.folder_id ?? '').trim() || null;
      const legacyUrl = String(
        attemptPayload.original_url || attemptPayload.preview_url || attemptPayload.thumbnail_url || ''
      ).trim();
      const variants: Array<Record<string, unknown>> = [
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            thumbnail_url: attemptPayload.thumbnail_url,
            preview_url: attemptPayload.preview_url,
            original_url: attemptPayload.original_url,
            width: attemptPayload.width,
            height: attemptPayload.height,
            blurhash: attemptPayload.blurhash,
          },
          folderId
        ),
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            thumbnail_url: attemptPayload.thumbnail_url,
            preview_url: attemptPayload.preview_url,
            original_url: attemptPayload.original_url,
            width: attemptPayload.width,
            height: attemptPayload.height,
          },
          folderId
        ),
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            thumbnail_url: attemptPayload.thumbnail_url,
            preview_url: attemptPayload.preview_url,
            original_url: attemptPayload.original_url,
            width: attemptPayload.width,
            height: attemptPayload.height,
          },
          folderId
        ),
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            thumbnail_url: attemptPayload.thumbnail_url,
            preview_url: attemptPayload.preview_url,
            original_url: attemptPayload.original_url,
          },
          folderId
        ),
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            original_url: attemptPayload.original_url,
          },
          folderId
        ),
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            preview_url: attemptPayload.preview_url,
          },
          folderId
        ),
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            thumbnail_url: attemptPayload.thumbnail_url,
          },
          folderId
        ),
      ];

      const variantsWithMetaFallback: Array<Record<string, unknown>> = [];
      for (const variant of variants) {
        if (hasOptionalMeta) {
          variantsWithMetaFallback.push(withOptionalStoryAndSort(variant));
        }
        variantsWithMetaFallback.push(variant);
      }

      const uniqueVariants: Array<Record<string, unknown>> = [];
      const seenSignatures = new Set<string>();
      const candidateVariants = legacyUrl
        ? variantsWithMetaFallback.flatMap((variant) => [
            { url: legacyUrl, ...variant },
            variant,
          ])
        : variantsWithMetaFallback;
      for (const variant of candidateVariants) {
        const signature = Object.keys(variant)
          .sort()
          .map((key) => `${key}:${String((variant as Record<string, unknown>)[key])}`)
          .join('|');
        if (seenSignatures.has(signature)) {
          continue;
        }
        seenSignatures.add(signature);
        uniqueVariants.push(variant);
      }

      let shouldRetryInRoot = false;

      for (const variant of uniqueVariants) {
        const { error } = await dbClient.from('album_photos').insert(variant);
        if (!error) {
          return null;
        }

        const message = String(error.message || '写入 album_photos 失败').trim();
        lastError = { message };

        if (folderId && isAlbumFolderForeignKeyError(message)) {
          shouldRetryInRoot = true;
          break;
        }

        const normalizedMessage = message.toLowerCase();
        if (
          normalizedMessage.includes('未授权') ||
          normalizedMessage.includes('unauthorized') ||
          normalizedMessage.includes('forbidden') ||
          normalizedMessage.includes('permission denied')
        ) {
          return lastError;
        }
      }

      if (!shouldRetryInRoot) {
        break;
      }
    }

    return lastError || { message: '写入 album_photos 失败' };
  };

  const handleBatchImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setBatchImages([]);
      return;
    }
    setBatchImages(Array.from(files));
  };

  const handleSingleImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setSingleImage(null);
      return;
    }
    setSingleImage(files[0]);
  };

  const uploadOnePhotoFile = async (
    dbClient: any,
    file: File,
    uploadFolderId: string | null,
    photoIndex: number,
    options?: {
      storyText?: string | null;
      isHighlight?: boolean;
      sortOrder?: number;
      shotDate?: string | null;
      shotLocation?: string | null;
    }
  ): Promise<{ ok: true } | { ok: false; message: string }> => {
    try {
      const versions = isSystemWallAlbum
        ? await generateGalleryImageVersions(file)
        : await generateAlbumImageVersions(file);
      const thumbnailVersion = versions.find((v) => v.type === 'thumbnail');
      const previewVersion = versions.find((v) => v.type === 'preview');
      const originalVersion = versions.find((v) => v.type === 'original');
      if (!thumbnailVersion) {
        return { ok: false, message: '生成图片版本失败' };
      }
      if (isSystemWallAlbum && !previewVersion) {
        return { ok: false, message: '生成图片版本失败' };
      }
      if (!isSystemWallAlbum && !originalVersion) {
        return { ok: false, message: '生成图片版本失败' };
      }

      const blurhash = await generateBlurHash(thumbnailVersion.file);
      const timestamp = Date.now();
      let thumbnail_url = '';
      let preview_url = '';
      let original_url = '';
      const uploadedKeys: string[] = [];

      for (const version of versions) {
        const ext = version.type === 'original'
          ? (file.name.split('.').pop() || 'jpg')
          : 'webp';
        const fileName = `${timestamp}_${photoIndex}_${version.type}.${ext}`;
        const publicUrl = await uploadToCloudBaseDirect(version.file, fileName, 'albums');
        uploadedKeys.push(`albums/${fileName}`);
        if (version.type === 'thumbnail') thumbnail_url = publicUrl;
        if (version.type === 'preview') {
          preview_url = publicUrl;
        }
        if (version.type === 'original') original_url = publicUrl;
      }

      if (isSystemWallAlbum) {
        original_url = preview_url || original_url;
      } else {
        preview_url = original_url || preview_url;
      }

      if (!thumbnail_url || !original_url) {
        await cleanupUploadedFiles(uploadedKeys);
        return { ok: false, message: '上传后未获取完整图片地址' };
      }

      const insertError = await insertAlbumPhotoWithCompat(dbClient, {
        album_id: albumId,
        folder_id: uploadFolderId,
        thumbnail_url,
        preview_url,
        original_url,
        width: (isSystemWallAlbum ? previewVersion?.width : originalVersion?.width) || thumbnailVersion.width,
        height: (isSystemWallAlbum ? previewVersion?.height : originalVersion?.height) || thumbnailVersion.height,
        blurhash,
        story_text: normalizeStoryText(options?.storyText),
        is_highlight: Boolean(options?.isHighlight),
        sort_order: Number.isFinite(Number(options?.sortOrder))
          ? Math.round(Number(options?.sortOrder))
          : undefined,
        shot_date: normalizeShotDate(options?.shotDate),
        shot_location: normalizeShotLocation(options?.shotLocation),
      });

      if (insertError) {
        await cleanupUploadedFiles(uploadedKeys);
        return { ok: false, message: insertError.message };
      }
      return { ok: true };
    } catch (error: any) {
      return { ok: false, message: String(error?.message || '上传流程异常') };
    }
  };

  const openStoryModal = (photo: Photo) => {
    setEditingStoryPhoto(photo);
    setEditingStoryText(String(photo.story_text || ''));
    setEditingHighlight(Boolean(photo.is_highlight));
    setShowStoryModal(true);
  };

  const closeStoryModal = () => {
    if (actionLoading) return;
    setShowStoryModal(false);
    setEditingStoryPhoto(null);
    setEditingStoryText('');
    setEditingHighlight(false);
  };

  const savePhotoStory = async () => {
    if (!editingStoryPhoto) return;
    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const storyText = normalizeStoryText(editingStoryText);
    const payload = {
      story_text: storyText ?? '',
      is_highlight: editingHighlight ? 1 : 0,
    };
    const { data, error } = await dbClient
      .from('album_photos')
      .update(payload)
      .eq('id', editingStoryPhoto.id)
      .eq('album_id', albumId)
      .select('id, story_text, is_highlight')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      if (isColumnMissingError(error.message || '', 'story_text') || isColumnMissingError(error.message || '', 'is_highlight')) {
        setShowToast({ message: `保存失败：${ALBUM_PHOTO_STORY_SORT_MIGRATION_HINT}`, type: 'warning' });
      } else {
        setShowToast({ message: `保存失败：${error.message}`, type: 'error' });
      }
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!data) {
      setShowToast({ message: '照片不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setPhotos((prev) =>
      prev.map((photo) =>
        String(photo.id) === String(data.id)
          ? {
              ...photo,
              story_text: normalizeStoryText(data.story_text),
              has_story: Boolean(normalizeStoryText(data.story_text)),
              is_highlight: Boolean(data.is_highlight),
            }
          : photo
      )
    );
    closeStoryModal();
    invalidatePublicGalleryCache();
    setShowToast({ message: '关于此刻已更新', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const openShotDateModal = (photo: Photo) => {
    const fallbackDate = normalizeShotDate(photo.created_at) || getTodayUTC8();
    setEditingShotDatePhoto(photo);
    setEditingShotDateValue(normalizeShotDate(photo.shot_date) || fallbackDate);
    setEditingShotLocationValue(normalizeShotLocation(photo.shot_location) || '');
    setShowShotDateModal(true);
  };

  const closeShotDateModal = () => {
    if (actionLoading) return;
    setShowShotDateModal(false);
    setEditingShotDatePhoto(null);
    setEditingShotDateValue(getTodayUTC8());
    setEditingShotLocationValue('');
  };

  const savePhotoShotDate = async () => {
    if (!editingShotDatePhoto) return;

    const normalizedShotDate = normalizeShotDate(editingShotDateValue);
    if (!normalizedShotDate) {
      setShowToast({ message: '请选择有效的拍摄日期', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const normalizedShotLocation = normalizeShotLocation(editingShotLocationValue);

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await dbClient
      .from('album_photos')
      .update({ shot_date: normalizedShotDate, shot_location: normalizedShotLocation })
      .eq('id', editingShotDatePhoto.id)
      .eq('album_id', albumId)
      .select('id, shot_date, shot_location')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      if (isColumnMissingError(error.message || '', 'shot_date') || isColumnMissingError(error.message || '', 'shot_location')) {
        const hint = isColumnMissingError(error.message || '', 'shot_location')
          ? ALBUM_PHOTO_SHOT_LOCATION_MIGRATION_HINT
          : ALBUM_PHOTO_SHOT_DATE_MIGRATION_HINT;
        setShowToast({ message: `保存失败：${hint}`, type: 'warning' });
      } else {
        setShowToast({ message: `保存失败：${error.message}`, type: 'error' });
      }
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!data) {
      setShowToast({ message: '照片不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setPhotos((prev) =>
      sortAdminAlbumPhotos(
        prev.map((photo) =>
          String(photo.id) === String(data.id)
            ? {
                ...photo,
                shot_date: normalizeShotDate(data.shot_date),
                shot_location: normalizeShotLocation(data.shot_location),
              }
            : photo
        ),
        isSystemWallAlbum
      )
    );
    closeShotDateModal();
    invalidatePublicGalleryCache();
    setShowToast({ message: '拍摄信息已更新', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const togglePhotoVisibility = async (photoId: string) => {
    if (actionLoading || isSelectionMode || !isSystemWallAlbum) {
      return;
    }

    const target = photos.find((item) => String(item.id) === String(photoId));
    if (!target) {
      setShowToast({ message: '照片不存在或已删除', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const nextPublic = !normalizeDbBoolean(target.is_public, true);
    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { error } = await dbClient
      .from('album_photos')
      .update({ is_public: nextPublic ? 1 : 0 })
      .eq('id', photoId)
      .eq('album_id', albumId)
      .select('id, is_public')
      .maybeSingle();

    setActionLoading(false);

    if (error) {
      setShowToast({ message: `${nextPublic ? '恢复公开' : '隐藏'}失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setPhotos((prev) => sortAdminAlbumPhotos(
      prev.map((item) => (
        String(item.id) === String(photoId)
          ? { ...item, is_public: nextPublic }
          : item
      )),
      isSystemWallAlbum
    ));
    invalidatePublicGalleryCache();
    setShowToast({ message: nextPublic ? '照片已恢复公开' : '照片已隐藏', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };
  const movePhotoOrder = async (photoId: string, direction: 'up' | 'down') => {
    const list = [...filteredPhotos];
    const currentIndex = list.findIndex((item) => String(item.id) === String(photoId));
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= list.length) return;

    const reordered = [...list];
    const [moved] = reordered.splice(currentIndex, 1);
    reordered.splice(targetIndex, 0, moved);

    const currentMap = new Map<string, number>();
    list.forEach((item, index) => {
      const value = Number(item.sort_order);
      currentMap.set(
        String(item.id),
        Number.isFinite(value) && value > 0 ? Math.round(value) : buildSortOrderValue(index)
      );
    });

    const desiredMap = new Map<string, number>();
    reordered.forEach((item, index) => {
      desiredMap.set(String(item.id), buildSortOrderValue(index));
    });

    const changed = reordered.filter((item) => currentMap.get(String(item.id)) !== desiredMap.get(String(item.id)));
    if (changed.length === 0) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      for (const item of changed) {
        const sortOrder = desiredMap.get(String(item.id));
        const { error } = await dbClient
          .from('album_photos')
          .update({ sort_order: sortOrder })
          .eq('id', item.id)
          .eq('album_id', albumId);
        if (error) {
          if (isColumnMissingError(error.message || '', 'sort_order')) {
            throw new Error(ALBUM_PHOTO_STORY_SORT_MIGRATION_HINT);
          }
          throw error;
        }
      }

      setPhotos((prev) =>
        sortAdminAlbumPhotos(
          prev.map((item) => {
            const nextSort = desiredMap.get(String(item.id));
            if (!Number.isFinite(nextSort as number)) return item;
            return {
              ...item,
              sort_order: nextSort as number,
            };
          }),
          isSystemWallAlbum
        )
      );
      invalidatePublicGalleryCache();
      setShowToast({ message: direction === 'up' ? '已上移一位' : '已下移一位', type: 'success' });
      setTimeout(() => setShowToast(null), 2000);
    } catch (error: any) {
      setShowToast({ message: `排序失败：${error.message || '请稍后重试'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const pinPhotoToTop = async (photoId: string) => {
    const target = filteredPhotos.find((item) => String(item.id) === String(photoId));
    if (!target) return;
    if (actionLoading) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      let conflictQuery = dbClient
        .from('album_photos')
        .update({ sort_order: TOP_PIN_CONFLICT_SORT_ORDER })
        .eq('album_id', albumId)
        .eq('sort_order', TOP_PIN_SORT_ORDER)
        .neq('id', photoId);

      conflictQuery = selectedFolder
        ? conflictQuery.eq('folder_id', selectedFolder)
        : conflictQuery.eq('folder_id', null);

      const { error: conflictError } = await conflictQuery;
      if (conflictError) {
        if (isColumnMissingError(conflictError.message || '', 'sort_order')) {
          throw new Error(ALBUM_PHOTO_STORY_SORT_MIGRATION_HINT);
        }
        throw conflictError;
      }

      const { error: updateError } = await dbClient
        .from('album_photos')
        .update({ sort_order: TOP_PIN_SORT_ORDER })
        .eq('id', photoId)
        .eq('album_id', albumId);

      if (updateError) {
        if (isColumnMissingError(updateError.message || '', 'sort_order')) {
          throw new Error(ALBUM_PHOTO_STORY_SORT_MIGRATION_HINT);
        }
        throw updateError;
      }

      loadAlbumData();
      invalidatePublicGalleryCache();
      setShowToast({ message: '已置顶', type: 'success' });
      setTimeout(() => setShowToast(null), 2000);
    } catch (error: any) {
      setShowToast({ message: `置顶失败：${error.message || '请稍后重试'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const handleUploadSinglePhoto = async () => {
    if (!singleImage) {
      setShowToast({ message: '请选择图片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setUploading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setUploading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    let uploadFolderId: string | null = await resolveUploadFolderId(dbClient, selectedFolder);
    if (selectedFolder && !uploadFolderId) {
      setSelectedFolder(null);
      uploadFolderId = null;
    }

    setUploadProgress({ current: 1, total: 1 });
    const normalizedSingleShotDate = normalizeShotDate(singleShotDate) || getTodayUTC8();
    const result = await uploadOnePhotoFile(dbClient, singleImage, uploadFolderId, 0, {
      storyText: singleStoryText,
      isHighlight: singleHighlight,
      sortOrder: TOP_PIN_SORT_ORDER,
      shotDate: normalizedSingleShotDate,
      shotLocation: normalizeShotLocation(singleShotLocation),
    });
    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });

    if (result.ok) {
      setShowUploadModal(false);
      setSingleImage(null);
      setSingleStoryText('');
      setSingleHighlight(false);
      setSingleShotDate(getTodayUTC8());
      setSingleShotLocation('');
      loadAlbumData();
      invalidatePublicGalleryCache();
      setShowToast({ message: '单图上传成功', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setShowToast({ message: `上传失败：${result.message}`, type: 'error' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleUploadPhotos = async () => {
    if (batchImages.length === 0) {
      setShowToast({ message: '请选择图片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setUploading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setUploading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    let successCount = 0;
    let failCount = 0;
    let firstFailureReason = '';
    let uploadFolderId: string | null = null;

    uploadFolderId = await resolveUploadFolderId(dbClient, selectedFolder);
    if (selectedFolder && !uploadFolderId) {
      setSelectedFolder(null);
    }

    setUploadProgress({ current: 0, total: batchImages.length });
    const normalizedBatchShotDate = normalizeShotDate(batchShotDate) || getTodayUTC8();
    const normalizedBatchShotLocation = normalizeShotLocation(batchShotLocation);

    for (let i = 0; i < batchImages.length; i++) {
      const file = batchImages[i];
      setUploadProgress({ current: i + 1, total: batchImages.length });
      const result = await uploadOnePhotoFile(dbClient, file, uploadFolderId, i, {
        storyText: null,
        isHighlight: false,
        sortOrder: TOP_PIN_SORT_ORDER,
        shotDate: normalizedBatchShotDate,
        shotLocation: normalizedBatchShotLocation,
      });
      if (result.ok) {
        successCount++;
      } else {
        if (!firstFailureReason) {
          firstFailureReason = result.message;
        }
        failCount++;
      }
    }

    setUploading(false);
    setShowUploadModal(false);
    setBatchImages([]);
    setSingleShotDate(getTodayUTC8());
    setSingleShotLocation('');
    setBatchShotDate(getTodayUTC8());
    setBatchShotLocation('');
    setUploadProgress({ current: 0, total: 0 });

    if (successCount > 0) {
      loadAlbumData();
      invalidatePublicGalleryCache();
    }

    if (failCount > 0) {
      const compactReason = firstFailureReason ? `（${firstFailureReason.slice(0, 36)}）` : '';
      setShowToast({ message: `上传完成：成功 ${successCount} 张，失败 ${failCount} 张${compactReason}`, type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `成功上传 ${successCount} 张照片`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeletePhoto = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (photo) {
      setDeletingPhoto(photo);
    }
  };

  const confirmDeletePhoto = async () => {
    if (!deletingPhoto) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingPhoto(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: targetPhoto, error: snapshotError } = await dbClient
        .from('album_photos')
        .select('*')
        .eq('id', deletingPhoto.id)
        .eq('album_id', albumId)
        .maybeSingle();

      if (snapshotError) {
        throw snapshotError;
      }
      if (!targetPhoto) {
        setActionLoading(false);
        setDeletingPhoto(null);
        setShowToast({ message: '照片不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const filesToDelete = Array.from(
        new Set(
          [
            String(targetPhoto.url ?? '').trim(),
            String(targetPhoto.thumbnail_url ?? '').trim(),
            String(targetPhoto.preview_url ?? '').trim(),
            String(targetPhoto.original_url ?? '').trim(),
          ].filter(Boolean)
        )
      );

      const { error: deleteError } = await dbClient
        .from('album_photos')
        .delete()
        .eq('id', targetPhoto.id)
        .eq('album_id', albumId);
      if (deleteError) {
        throw deleteError;
      }

      const { data: remainingPhoto, error: verifyError } = await dbClient
        .from('album_photos')
        .select('id')
        .eq('id', targetPhoto.id)
        .maybeSingle();
      if (verifyError) {
        throw verifyError;
      }
      if (remainingPhoto) {
        throw new Error('数据库记录删除失败，请稍后重试');
      }

      let storageCleanupFailed = false;
      if (filesToDelete.length > 0) {
        try {
          const response = await fetch('/api/batch-delete', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ urls: filesToDelete }),
          });

          if (!response.ok) {
            storageCleanupFailed = true;
          }
        } catch (error) {
          console.error('删除云存储文件时出错:', error);
          storageCleanupFailed = true;
        }
      }

      setActionLoading(false);
      setDeletingPhoto(null);
      loadAlbumData();
      invalidatePublicGalleryCache();

      if (storageCleanupFailed) {
        setShowToast({ message: '照片记录已删除，但云存储清理失败，请稍后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: '照片已删除', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      }
    } catch (error: any) {
      setActionLoading(false);
      setDeletingPhoto(null);
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleSelectFolder = (folderId: string | null) => {
    setSelectedFolder(folderId);
    setPhotoVisibleCount(photosPerPage);
    setPendingSelectAllPhotos(false);
    setIsSelectionMode(false);
    setSelectedPhotoIds([]);
  };

  const toggleSelectAllPhotos = () => {
    const allVisibleSelected =
      filteredPhotos.length > 0 &&
      filteredPhotos.every((photo) => selectedPhotoIds.includes(photo.id));
    if (allVisibleSelected && !pendingSelectAllPhotos) {
      setPendingSelectAllPhotos(false);
      setSelectedPhotoIds([]);
      return;
    }

    if (loading || loadingMore || actionLoading) {
      return;
    }

    if (photoHasMoreVisible) {
      setPendingSelectAllPhotos(true);
      setPhotoVisibleCount(Math.max(totalCount, photosPerPage));
      return;
    }

    setPendingSelectAllPhotos(false);
    setSelectedPhotoIds(filteredPhotos.map((photo) => photo.id));
  };
  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const clearPhotoSelection = () => {
    setPendingSelectAllPhotos(false);
    setSelectedPhotoIds([]);
    setIsSelectionMode(false);
  };

  const openMoveModal = (photoIds: string[]) => {
    const uniqueIds = Array.from(new Set((photoIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
    if (uniqueIds.length === 0) {
      setShowToast({ message: '请先选择要迁移的照片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const firstPhoto = photos.find((photo) => String(photo.id) === uniqueIds[0]);
    const initialTarget = String(firstPhoto?.folder_id ?? '').trim() || ROOT_FOLDER_SENTINEL;

    setMovingPhotoIds(uniqueIds);
    setMoveTargetFolder(initialTarget);
    setShowMoveModal(true);
  };

  const closeMoveModal = () => {
    if (actionLoading) {
      return;
    }
    setShowMoveModal(false);
    setMovingPhotoIds([]);
    setMoveTargetFolder(ROOT_FOLDER_SENTINEL);
  };

  const handleBatchMove = () => {
    if (selectedPhotoIds.length === 0) {
      setShowToast({ message: '请先选择要迁移的照片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    openMoveModal(selectedPhotoIds);
  };

  const confirmMovePhotos = async () => {
    if (movingPhotoIds.length === 0) {
      closeMoveModal();
      return;
    }

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const normalizedTargetFolder =
      moveTargetFolder === ROOT_FOLDER_SENTINEL ? null : String(moveTargetFolder || '').trim() || null;
    if (normalizedTargetFolder) {
      const folderExists = (folders || []).some((folder) => String(folder.id) === normalizedTargetFolder);
      if (!folderExists) {
        setActionLoading(false);
        setShowToast({ message: '目标文件夹不存在，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
    }

    try {
      const { data: snapshotRows, error: snapshotError } = await dbClient
        .from('album_photos')
        .select('id, folder_id')
        .eq('album_id', albumId)
        .in('id', movingPhotoIds);
      if (snapshotError) {
        throw snapshotError;
      }

      const rows = Array.isArray(snapshotRows) ? snapshotRows : [];
      if (rows.length === 0) {
        setActionLoading(false);
        closeMoveModal();
        setShowToast({ message: '未找到可迁移照片，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const toMoveIds = rows
        .filter((row: any) => {
          const currentFolder = String(row.folder_id ?? '').trim() || null;
          return currentFolder !== normalizedTargetFolder;
        })
        .map((row: any) => String(row.id));

      if (toMoveIds.length === 0) {
        setActionLoading(false);
        closeMoveModal();
        setShowToast({ message: '选中的照片已在目标文件夹', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const updatePayload: Record<string, unknown> = normalizedTargetFolder
        ? { folder_id: normalizedTargetFolder }
        : { folder_id: null };

      const { error: updateError } = await dbClient
        .from('album_photos')
        .update(updatePayload)
        .eq('album_id', albumId)
        .in('id', toMoveIds);
      if (updateError) {
        throw updateError;
      }

      const targetFolderName = normalizedTargetFolder
        ? folders.find((folder) => String(folder.id) === normalizedTargetFolder)?.name || '目标文件夹'
        : String(album?.root_folder_name ?? '').trim() || '根目录';

      setPhotos((prev) =>
        prev.map((photo) =>
          toMoveIds.includes(String(photo.id)) ? { ...photo, folder_id: normalizedTargetFolder } : photo
        )
      );
      setSelectedPhotoIds((prev) => prev.filter((id) => !toMoveIds.includes(String(id))));

      setActionLoading(false);
      closeMoveModal();
      invalidatePublicGalleryCache();
      setShowToast({ message: `成功迁移 ${toMoveIds.length} 张照片到${targetFolderName}`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `迁移失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPhotoIds.length === 0) {
      setShowToast({ message: '请先选择要删除的照片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    setShowBatchDeleteConfirm(false);
    setActionLoading(true);

    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: selectedRows, error: snapshotError } = await dbClient
        .from('album_photos')
        .select('*')
        .eq('album_id', albumId)
        .in('id', selectedPhotoIds);
      if (snapshotError) {
        throw snapshotError;
      }

      const rows = Array.isArray(selectedRows) ? selectedRows : [];
      const missingCount = Math.max(0, selectedPhotoIds.length - rows.length);
      if (rows.length === 0) {
        setActionLoading(false);
        setShowToast({ message: '未找到可删除照片，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error: dbError } = await dbClient
        .from('album_photos')
        .delete()
        .eq('album_id', albumId)
        .in('id', rows.map((row: any) => String(row.id)));
      if (dbError) {
        throw dbError;
      }

      const targetIds = rows.map((row: any) => String(row.id));
      const { data: remainingRows, error: verifyError } = await dbClient
        .from('album_photos')
        .select('id')
        .eq('album_id', albumId)
        .in('id', targetIds);
      if (verifyError) {
        throw verifyError;
      }

      const remainingIdSet = new Set((remainingRows || []).map((row: any) => String(row.id)));
      const deletedRows = rows.filter((row: any) => !remainingIdSet.has(String(row.id)));
      if (deletedRows.length === 0) {
        throw new Error('照片删除失败，请刷新后重试');
      }

      const filesToDelete = deletedRows.flatMap((photo: any) => [
        String(photo.url ?? '').trim() || null,
        String(photo.thumbnail_url ?? '').trim() || null,
        String(photo.preview_url ?? '').trim() || null,
        String(photo.original_url ?? '').trim() || null,
      ]).filter(Boolean) as string[];
      const uniqueFilesToDelete = Array.from(new Set(filesToDelete));

      let storageCleanupFailed = false;
      if (uniqueFilesToDelete.length > 0) {
        try {
          const response = await fetch('/api/batch-delete', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ urls: uniqueFilesToDelete }),
          });

          if (!response.ok) {
            storageCleanupFailed = true;
          }
        } catch (error) {
          console.error('删除云存储文件失败:', error);
          storageCleanupFailed = true;
        }
      }

      setActionLoading(false);
      setSelectedPhotoIds([]);
      setIsSelectionMode(false);
      loadAlbumData();
      invalidatePublicGalleryCache();

      const partialFailedCount = remainingIdSet.size;
      const warningParts: string[] = [];
      if (partialFailedCount > 0) {
        warningParts.push(`有 ${partialFailedCount} 张照片删除失败`);
      }
      if (missingCount > 0) {
        warningParts.push(`${missingCount} 张照片已不存在`);
      }
      if (storageCleanupFailed) {
        warningParts.push('云存储清理失败');
      }

      if (warningParts.length > 0) {
        setShowToast({
          message: `成功删除 ${deletedRows.length} 张照片，${warningParts.join('，')}`,
          type: 'warning',
        });
      } else {
        setShowToast({ message: `成功删除 ${deletedRows.length} 张照片`, type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `批量删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const filteredPhotos = sortAdminAlbumPhotos(
    selectedFolder
      ? photos.filter((p) => p.folder_id === selectedFolder)
      : photos.filter((p) => !p.folder_id),
    isSystemWallAlbum
  );
  const rootFolderName = String(album?.root_folder_name ?? '').trim() || '根目录';
  const folderPhotoCountMap = new Map<string, number>();
  let rootPhotoCount = 0;
  photos.forEach((photo) => {
    const folderId = String(photo.folder_id ?? '').trim();
    if (!folderId) {
      rootPhotoCount += 1;
      return;
    }
    folderPhotoCountMap.set(folderId, Number(folderPhotoCountMap.get(folderId) || 0) + 1);
  });
  const foldersWithCounts = folders.map((folder) => ({
    ...folder,
    photoCount: Number(folderPhotoCountMap.get(String(folder.id)) || 0),
  }));
  const rootFolderHidden = normalizeDbBoolean(album?.hide_root_folder, false);
  const selectedFolderEntity = selectedFolder
    ? folders.find((folder) => String(folder.id) === String(selectedFolder)) || null
    : null;
  const selectedFolderIndex = selectedFolderEntity
    ? folders.findIndex((folder) => String(folder.id) === String(selectedFolderEntity.id))
    : -1;
  const canPinSelectedFolderTop = selectedFolderIndex > 0;
  const canMoveSelectedFolderUp = selectedFolderIndex > 0;
  const canMoveSelectedFolderDown = selectedFolderIndex >= 0 && selectedFolderIndex < folders.length - 1;
  const selectedFolderName = selectedFolderEntity ? String(selectedFolderEntity.name || '').trim() : rootFolderName;
  const selectedFolderHidden = selectedFolderEntity
    ? normalizeDbBoolean(selectedFolderEntity.is_hidden, false)
    : rootFolderHidden;
  const currentFolderLoadedCount = filteredPhotos.length;
  const currentFolderDisplayTotalCount = Math.max(currentFolderTotalCount, currentFolderLoadedCount);
  const systemWallRows = filteredPhotos.map((photo) => {
    const hasStory = Boolean(normalizeStoryText(photo.story_text));
    const isHighlighted = hasStory || Boolean(photo.is_highlight);
    const isPublic = normalizeDbBoolean(photo.is_public, true);
    const viewCount = Number(photo.view_count || 0);
    const likeCount = Number(photo.like_count || 0);
    return {
      ...photo,
      dateText: formatPhotoDateText(resolvePhotoDisplayDate(photo)),
      shotLocationText: normalizeShotLocation(photo.shot_location) || '未知',
      viewCount: Number.isFinite(viewCount) ? Math.max(0, Math.round(viewCount)) : 0,
      likeCount: Number.isFinite(likeCount) ? Math.max(0, Math.round(likeCount)) : 0,
      isPublic,
      isHighlighted,
      visibilityText: isPublic ? '公开' : '已隐藏',
      visibilityClass: isPublic ? 'photo-card__visibility--public' : 'photo-card__visibility--hidden',
      selected: selectedPhotoIds.includes(photo.id),
      hasStory,
      story_highlight: Boolean(photo.is_highlight),
      imageUrl: photoUrls[photo.id] || photo.thumbnail_url || photo.preview_url || photo.original_url || photo.url || '',
    };
  });
  const showAllSelected = filteredPhotos.length > 0 && selectedPhotoIds.length === filteredPhotos.length;

  useEffect(() => {
    if (isSystemWallAlbum) {
      setCurrentFolderTotalCount(currentFolderLoadedCount);
      return;
    }

    let cancelled = false;
    const dbClient = createClient();
    if (!dbClient) {
      setCurrentFolderTotalCount(currentFolderLoadedCount);
      return;
    }

    const loadCurrentFolderTotalCount = async () => {
      let countQuery = dbClient
        .from('album_photos')
        .select('id', { count: 'exact' })
        .eq('album_id', albumId)
        .limit(1);

      countQuery = selectedFolder
        ? countQuery.eq('folder_id', selectedFolder)
        : countQuery.eq('folder_id', null);

      const countRes = await countQuery;
      if (cancelled) {
        return;
      }

      if (countRes.error) {
        setCurrentFolderTotalCount(currentFolderLoadedCount);
        return;
      }

      setCurrentFolderTotalCount(Math.max(0, Number(countRes.count || 0)));
    };

    void loadCurrentFolderTotalCount();

    return () => {
      cancelled = true;
    };
  }, [albumId, currentFolderLoadedCount, isSystemWallAlbum, selectedFolder, totalCount]);

  useEffect(() => {
    if (!pendingSelectAllPhotos || loading || loadingMore || photoHasMoreVisible) {
      return;
    }

    setSelectedPhotoIds(filteredPhotos.map((photo) => photo.id));
    setPendingSelectAllPhotos(false);
  }, [filteredPhotos, loading, loadingMore, pendingSelectAllPhotos, photoHasMoreVisible]);

  if (loading) {
    return (
      <AdminLoadingCard
        description={isSystemWallAlbum ? '正在同步照片墙照片与目录结构，请稍候。' : '正在同步当前空间照片与文件夹数据，请稍候。'}
        variant="page"
      />
    );
  }

  return (
    <div className="admin-mobile-page album-detail-admin-page space-y-6 pt-6">
      {isSystemWallAlbum ? (
        <div className="system-wall-shell">
          <div className="system-wall-shell__head">
            <div className="system-wall-shell__summary">
              <h1 className="system-wall-shell__title">{"\u7167\u7247\u5899\u7ba1\u7406"}</h1>
              <p className="system-wall-shell__subtitle">{"\u516c\u5f00\u56fe\u96c6\u5185\u5bb9\u7ba1\u7406"}</p>
            </div>
          </div>

          <div className="album-detail-page system-wall-manager">
            <div className="main-content">
              <div className="header-section">
                {!isSelectionMode ? (
                  <div className="toolbar-actions toolbar-actions--normal">
                    <button type="button" className="toolbar-btn toolbar-btn--soft" onClick={() => setShowNewFolderModal(true)}>
                      <FolderPlus className="toolbar-btn__icon" />
                      <span className="toolbar-btn__text">新建文件夹</span>
                    </button>
                    <button type="button" className="toolbar-btn toolbar-btn--ghost" onClick={() => setIsSelectionMode(true)}>
                      <Trash2 className="toolbar-btn__icon" />
                      <span className="toolbar-btn__text">批量删除</span>
                    </button>
                    <button
                      type="button"
                      className="toolbar-btn toolbar-btn--primary"
                      onClick={() => {
                        setShowUploadModal(true);
                        setUploadMode('batch');
                        setSingleImage(null);
                        setSingleStoryText('');
                        setSingleHighlight(false);
                        setSingleShotDate(getTodayUTC8());
                        setSingleShotLocation('');
                        setBatchShotDate(getTodayUTC8());
                        setBatchShotLocation('');
                        setBatchImages([]);
                        setUploadProgress({ current: 0, total: 0 });
                      }}
                    >
                      <Upload className="toolbar-btn__icon" />
                      <span className="toolbar-btn__text">上传照片</span>
                    </button>
                  </div>
                ) : (
                  <div className="toolbar-actions toolbar-actions--selection">
                    <button type="button" className="toolbar-btn toolbar-btn--ghost toolbar-btn--select-toggle" onClick={toggleSelectAllPhotos}>
                      {pendingSelectAllPhotos
                        ? '全选加载中...'
                        : showAllSelected
                          ? '取消全选'
                          : `全选(${selectedPhotoIds.length}/${filteredPhotos.length})`}
                    </button>
                    <button type="button" className="toolbar-btn toolbar-btn--ghost toolbar-btn--selection-cancel" onClick={clearPhotoSelection}>
                      取消
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn toolbar-btn--primary ${selectedPhotoIds.length === 0 ? 'toolbar-btn--disabled' : ''}`}
                      onClick={() => openMoveModal(selectedPhotoIds)}
                      disabled={selectedPhotoIds.length === 0}
                    >
                      <ArrowRightLeft className="toolbar-btn__icon" />
                      <span className="toolbar-btn__text">迁移({selectedPhotoIds.length})</span>
                    </button>
                    <button
                      type="button"
                      className={`toolbar-btn toolbar-btn--danger ${selectedPhotoIds.length === 0 ? 'toolbar-btn--disabled' : ''}`}
                      onClick={handleBatchDelete}
                      disabled={selectedPhotoIds.length === 0}
                    >
                      <Trash2 className="toolbar-btn__icon" />
                      <span className="toolbar-btn__text">删除({selectedPhotoIds.length})</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="folder-tabs">
                <div className="folder-tab-wrap">
                  <button
                    type="button"
                    className={`folder-tab ${selectedFolder === null ? 'folder-tab--active' : ''}`}
                    onClick={() => handleSelectFolder(null)}
                  >
                    <span className="folder-tab__text">{rootFolderName}{rootFolderHidden ? ' ·已隐藏' : ''} ({rootPhotoCount})</span>
                  </button>
                </div>
                {foldersWithCounts.map((folder) => (
                  <div key={folder.id} className="folder-tab-wrap">
                    <button
                      type="button"
                      className={`folder-tab ${selectedFolder === folder.id ? 'folder-tab--active' : ''}`}
                      onClick={() => handleSelectFolder(folder.id)}
                    >
                      <Folder className="folder-tab__icon" />
                      <span className="folder-tab__text">{folder.name}{normalizeDbBoolean(folder.is_hidden, false) ? ' ·已隐藏' : ''} ({folder.photoCount})</span>
                    </button>
                  </div>
                ))}
              </div>

              {!isSelectionMode && (
                <div className="folder-current-actions">
                  {selectedFolder === null ? (
                    <>
                      <button
                        type="button"
                        className="folder-current-action-btn folder-current-action-btn--edit folder-current-action-btn--single"
                        onClick={handleOpenEditRootModal}
                      >
                        编辑根目录
                      </button>
                    <button
                      type="button"
                      className="folder-current-action-btn folder-current-action-btn--edit folder-current-action-btn--single"
                      onClick={handleToggleRootFolderVisibility}
                      disabled={actionLoading}
                    >
                      {rootFolderHidden ? '显示根目录' : '隐藏根目录'}
                    </button>
                    </>
                  ) : selectedFolderEntity ? (
                    <>
                      <button
                        type="button"
                        className="folder-current-action-btn"
                        onClick={() => moveFolderByDirection(selectedFolderEntity.id, 'top')}
                        disabled={!canPinSelectedFolderTop || actionLoading}
                      >
                        置顶
                      </button>
                      <button
                        type="button"
                        className="folder-current-action-btn"
                        onClick={() => moveFolderByDirection(selectedFolderEntity.id, 'up')}
                        disabled={!canMoveSelectedFolderUp || actionLoading}
                      >
                        上移
                      </button>
                      <button
                        type="button"
                        className="folder-current-action-btn"
                        onClick={() => moveFolderByDirection(selectedFolderEntity.id, 'down')}
                        disabled={!canMoveSelectedFolderDown || actionLoading}
                      >
                        下移
                      </button>
                      <button
                        type="button"
                        className="folder-current-action-btn"
                        onClick={() => handleToggleFolderVisibility(selectedFolderEntity)}
                        disabled={actionLoading}
                      >
                        {selectedFolderHidden ? '显示文件夹' : '隐藏文件夹'}
                      </button>
                      <button
                        type="button"
                        className="folder-current-action-btn folder-current-action-btn--edit folder-current-action-btn--half"
                        onClick={() => handleOpenEditFolderModal(selectedFolderEntity)}
                      >
                        编辑文件夹
                      </button>
                      <button
                        type="button"
                        className="folder-current-action-btn folder-current-action-btn--danger folder-current-action-btn--half"
                        onClick={() => handleDeleteFolder(selectedFolderEntity.id)}
                      >
                        删除文件夹
                      </button>
                    </>
                  ) : null}
                </div>
              )}

              {systemWallRows.length === 0 ? (
                <div className="empty-state">
                  <span className="empty-icon">🖼️</span>
                  <span className="empty-text">暂无照片</span>
                </div>
              ) : (
                <div className="photos-grid">
                  <AnimatePresence>
                    {systemWallRows.map((photo, index) => (
                      <motion.div
                        key={photo.id}
                        initial={{ opacity: 0, scale: 0.96 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.96 }}
                        className={`photo-card ${isSelectionMode && photo.selected ? 'photo-card--selected' : ''} ${photo.isHighlighted ? 'photo-card--story-highlight' : ''}`}
                        onClick={() => {
                          if (isSelectionMode) {
                            togglePhotoSelection(photo.id);
                            return;
                          }
                          setPreviewPhoto(photo);
                        }}
                      >
                        <div className="photo-card__image-wrap">
                          {photo.imageUrl ? (
                            <img className="photo-card__image" src={photo.imageUrl} alt="" />
                          ) : (
                            <div className="photo-card__image-loading">
                              <div className="photo-card__image-spinner" />
                            </div>
                          )}

                          {isSelectionMode ? (
                            <div className={`photo-card__check ${photo.selected ? 'photo-card__check--active' : ''}`}>
                              {photo.selected ? '✓' : ''}
                            </div>
                          ) : (
                            <div className="photo-card__actions">
                              <button
                                type="button"
                                className={`photo-card__action compact-button photo-card__action--visibility ${photo.isPublic ? 'photo-card__action--visible' : 'photo-card__action--hidden'}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  togglePhotoVisibility(photo.id);
                                }}
                                title={photo.isPublic ? '隐藏照片' : '恢复公开'}
                              >
                                {photo.isPublic ? (
                                  <EyeOff className="photo-card__action-icon" />
                                ) : (
                                  <Eye className="photo-card__action-icon" />
                                )}
                              </button>
                              <button
                                type="button"
                                className={`photo-card__action compact-button photo-card__action--story ${photo.hasStory ? 'photo-card__action--story-active' : ''}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openStoryModal(photo);
                                }}
                                title={photo.hasStory ? '编辑关于此刻' : '添加关于此刻'}
                              >
                                {photo.hasStory ? (
                                  <RotateCcw className="photo-card__action-icon photo-card__action-icon--light" />
                                ) : (
                                  <Sparkles className="photo-card__action-icon photo-card__action-icon--light" />
                                )}
                              </button>
                              <button
                                type="button"
                                className="photo-card__action compact-button photo-card__action--date"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openShotDateModal(photo);
                                }}
                                title="编辑拍摄信息"
                              >
                                <Calendar className="photo-card__action-icon" />
                              </button>
                              <button
                                type="button"
                                className="photo-card__action compact-button photo-card__action--move"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openMoveModal([photo.id]);
                                }}
                                title="迁移照片"
                              >
                                <ArrowRightLeft className="photo-card__action-icon" />
                              </button>
                              <button
                                type="button"
                                className="photo-card__action compact-button photo-card__action--danger"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeletePhoto(photo.id);
                                }}
                                title="删除照片"
                              >
                                <Trash2 className="photo-card__action-icon" />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="photo-card__meta">
                          <div className="photo-card__shot-time">
                            <Calendar className="photo-card__shot-time-icon" />
                            <span className="photo-card__shot-time-text">{photo.dateText}</span>
                          </div>
                          <div className="photo-card__shot-location">
                            <MapPin className="photo-card__shot-location-icon" />
                            <span className="photo-card__shot-location-text">{photo.shotLocationText}</span>
                          </div>
                          <div className="photo-card__meta-bottom">
                            <span className="photo-card__stat">
                              <Heart className="h-3 w-3" />
                              <span>{photo.likeCount}</span>
                            </span>
                            <span className="photo-card__stat">
                              <Eye className="h-3 w-3" />
                              <span>{photo.viewCount}</span>
                            </span>
                            <span className={`photo-card__visibility ${photo.visibilityClass}`}>
                              {photo.visibilityText}
                            </span>
                          </div>
                          <div className="photo-card__meta-extra">
                            <div className="photo-card__meta-extra-main">
                              {photo.hasStory ? (
                                <span className="photo-card__story-badge">故事</span>
                              ) : photo.story_highlight ? (
                                <span className="photo-card__story-badge photo-card__story-badge--highlight">高亮</span>
                              ) : (
                                <span className="photo-card__meta-extra-spacer" aria-hidden="true" />
                              )}
                            </div>
                            {!isSelectionMode && (
                              <div className="photo-card__sort-actions">
                                <button
                                  type="button"
                                  className={`photo-card__sort-btn compact-button ${index === 0 || actionLoading ? 'photo-card__sort-btn--disabled' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    pinPhotoToTop(photo.id);
                                  }}
                                  disabled={index === 0 || actionLoading}
                                  aria-label="置顶"
                                  title="置顶"
                                >
                                  <ArrowUpToLine className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  type="button"
                                  className={`photo-card__sort-btn compact-button ${index === 0 || actionLoading ? 'photo-card__sort-btn--disabled' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    movePhotoOrder(photo.id, 'up');
                                  }}
                                  disabled={index === 0 || actionLoading}
                                  aria-label="上移"
                                  title="上移"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </button>
                                <button
                                  type="button"
                                  className={`photo-card__sort-btn compact-button ${index === systemWallRows.length - 1 || actionLoading ? 'photo-card__sort-btn--disabled' : ''}`}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    movePhotoOrder(photo.id, 'down');
                                  }}
                                  disabled={index === systemWallRows.length - 1 || actionLoading}
                                  aria-label="下移"
                                  title="下移"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {currentFolderDisplayTotalCount > 0 ? (
                <div className="pagination">
                  <span className="pagination__info">已全部加载，共 {currentFolderDisplayTotalCount} 张</span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="icon-button action-icon-btn action-icon-btn--back"
          >
            <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              {album?.title || '未命名空间'}
            </h1>
            <p className="text-sm text-[#5D4037]/60">密钥: {album?.access_key}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isSelectionMode ? (
            <>
              <button
                onClick={() => setShowNewFolderModal(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FFC857]/20 text-[#5D4037] rounded-full text-sm font-medium hover:bg-[#FFC857]/30 active:scale-95 transition-all whitespace-nowrap"
              >
                <FolderPlus className="w-4 h-4" />
                <span className="hidden sm:inline">新建文件夹</span>
                <span className="sm:hidden">新建</span>
              </button>
              <button
                onClick={() => setIsSelectionMode(true)}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white text-[#5D4037] rounded-full text-sm font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 active:scale-95 transition-all whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                <span className="hidden sm:inline">批量删除</span>
                <span className="sm:hidden">批量</span>
              </button>
              <button
                onClick={() => {
                  setShowUploadModal(true);
                  setUploadMode('batch');
                  setSingleImage(null);
                  setSingleStoryText('');
                  setSingleHighlight(false);
                  setSingleShotDate(getTodayUTC8());
                  setSingleShotLocation('');
                  setBatchShotDate(getTodayUTC8());
                  setBatchShotLocation('');
                  setBatchImages([]);
                  setUploadProgress({ current: 0, total: 0 });
                }}
                className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full text-sm font-medium hover:shadow-md active:scale-95 transition-all whitespace-nowrap"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">上传照片</span>
                <span className="sm:hidden">上传</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={toggleSelectAllPhotos}
                className="px-3 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 active:scale-95 transition-all whitespace-nowrap"
              >
                {pendingSelectAllPhotos
                  ? '全选加载中...'
                  : showAllSelected
                    ? '取消全选'
                    : `全选 (${selectedPhotoIds.length}/${filteredPhotos.length})`}
              </button>
              <button
                onClick={handleBatchMove}
                disabled={selectedPhotoIds.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-[#FFC857] text-[#5D4037] rounded-full text-sm font-medium hover:shadow-md active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                <ArrowRightLeft className="w-4 h-4" />
                迁移 ({selectedPhotoIds.length})
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={selectedPhotoIds.length === 0}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 active:scale-95 transition-all disabled:opacity-50 whitespace-nowrap"
              >
                <Trash2 className="w-4 h-4" />
                删除 ({selectedPhotoIds.length})
              </button>
              <button
                onClick={clearPhotoSelection}
                className="px-3 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 active:scale-95 transition-all"
              >
                取消
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative group">
          <button
            onClick={() => handleSelectFolder(null)}
            className={`px-3 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
              selectedFolder === null ? 'bg-[#FFC857] text-[#5D4037] shadow-sm' : 'bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5'
            }`}
          >
            {rootFolderName}{rootFolderHidden ? ' ·已隐藏' : ''} ({photos.filter((p) => !p.folder_id).length})
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEditRootModal();
            }}
            className="icon-button action-icon-btn action-icon-btn--edit absolute -top-2 -right-2 h-7 w-7 opacity-0 group-hover:opacity-100 md:opacity-100 md:scale-75 md:group-hover:scale-100 transition-all"
            aria-label="修改根目录名称"
            title="修改根目录名称"
          >
            <Pencil className="h-3 w-3 -translate-y-[0.5px]" />
          </button>
        </div>
        {folders.map((folder) => (
          <div key={folder.id} className="relative group">
            <button
              onClick={() => handleSelectFolder(folder.id)}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                selectedFolder === folder.id ? 'bg-[#FFC857] text-[#5D4037] shadow-sm' : 'bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5'
              }`}
            >
              <Folder className="w-4 h-4 inline mr-1" />
              {folder.name}{normalizeDbBoolean(folder.is_hidden, false) ? ' ·已隐藏' : ''} ({photos.filter((p) => p.folder_id === folder.id).length})
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              className="icon-button action-icon-btn action-icon-btn--delete absolute -top-2 -right-2 h-7 w-7 opacity-0 group-hover:opacity-100 md:opacity-100 md:scale-75 md:group-hover:scale-100 transition-all"
              aria-label="删除文件夹"
            >
              <Trash2 className="h-3 w-3 -translate-y-[0.5px]" />
            </button>
          </div>
        ))}
      </div>

      {filteredPhotos.length === 0 ? (
        photos.length < totalCount ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
            <ImageIcon className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
            <p className="text-[#5D4037]/60">当前目录暂无已加载照片，可继续加载查看更多</p>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
            <ImageIcon className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
            <p className="text-[#5D4037]/60">暂无照片</p>
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <AnimatePresence>
            {filteredPhotos.map((photo, index) => {
              const dateText = formatPhotoDateText(resolvePhotoDisplayDate(photo));
              const hasStory = Boolean(normalizeStoryText(photo.story_text));
              const isHighlighted = hasStory || Boolean(photo.is_highlight);
              return (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`relative overflow-hidden rounded-[24px] bg-white transition-all ${
                    isSelectionMode
                      ? selectedPhotoIds.includes(photo.id)
                        ? 'ring-4 ring-[#FFC857]/75 shadow-[0_10px_28px_rgba(93,64,55,0.22)]'
                        : isHighlighted
                        ? 'ring-2 ring-[#FFC857]/70 shadow-[0_10px_26px_rgba(255,200,87,0.35)] hover:ring-[#FFC857]'
                        : 'ring-1 ring-[#5D4037]/10 shadow-[0_8px_24px_rgba(93,64,55,0.14)] hover:ring-[#FFC857]/45'
                      : isHighlighted
                      ? 'ring-2 ring-[#FFC857]/70 shadow-[0_10px_26px_rgba(255,200,87,0.35)] hover:translate-y-[-2px] hover:shadow-[0_14px_32px_rgba(255,200,87,0.45)] cursor-pointer'
                      : 'ring-1 ring-[#5D4037]/10 shadow-[0_8px_24px_rgba(93,64,55,0.14)] hover:translate-y-[-2px] hover:shadow-[0_14px_30px_rgba(93,64,55,0.2)] cursor-pointer'
                  }`}
                  onClick={() => {
                    if (isSelectionMode) {
                      togglePhotoSelection(photo.id);
                    } else {
                      setPreviewPhoto(photo);
                    }
                  }}
                >
                  <div className="relative aspect-square bg-[#f5f5f5]">
                    {isSelectionMode && (
                      <div className={`absolute top-3 left-3 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors z-10 ${
                        selectedPhotoIds.includes(photo.id)
                          ? 'bg-[#FFC857] border-[#FFC857]'
                          : 'bg-white border-[#5D4037]/30'
                      }`}>
                        {selectedPhotoIds.includes(photo.id) && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    )}
                    {(() => {
                      const url = photoUrls[photo.id];
                      return url ? (
                        <img
                          src={url}
                          alt=""
                          className="h-full w-full object-cover"
                          onError={(e) => console.error(`❌ 照片 ${photo.id} 加载失败:`, e)}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-[#f5f5f5]">
                          <div className="h-8 w-8 rounded-full border-4 border-[#FFC857] border-t-transparent animate-spin"></div>
                        </div>
                      );
                    })()}

                    {!isSelectionMode && (
                      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openStoryModal(photo);
                          }}
                          className="icon-button h-10 w-10 rounded-full border border-white/70 bg-[#5D4037]/85 text-white shadow-[0_8px_18px_rgba(93,64,55,0.18)] transition-colors hover:bg-[#5D4037]"
                          aria-label={hasStory ? '编辑关于此刻' : '添加关于此刻'}
                          title={hasStory ? '编辑关于此刻' : '添加关于此刻'}
                        >
                          {hasStory ? <RotateCcw className="h-[18px] w-[18px]" /> : <Sparkles className="h-[18px] w-[18px]" />}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openShotDateModal(photo);
                          }}
                          className="icon-button h-10 w-10 rounded-full border border-[#5D4037]/12 bg-white/92 text-[#5D4037] shadow-[0_8px_18px_rgba(93,64,55,0.16)] transition-colors hover:bg-[#FFC857]/16"
                          aria-label="修改拍摄信息"
                          title="修改拍摄信息"
                        >
                          <Calendar className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openMoveModal([photo.id]);
                          }}
                          className="icon-button h-10 w-10 rounded-full bg-[#FFC857] text-[#5D4037] shadow-[0_8px_18px_rgba(255,200,87,0.24)] transition-colors hover:bg-[#f2b93f]"
                          aria-label="迁移照片"
                          title="迁移到其他文件夹"
                        >
                          <ArrowRightLeft className="h-[18px] w-[18px]" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(photo.id);
                          }}
                          className="icon-button h-10 w-10 rounded-full border border-[#fecaca] bg-[#fff1f2] text-[#ef4444] shadow-[0_8px_18px_rgba(239,68,68,0.14)] transition-colors hover:bg-[#fee2e2]"
                          aria-label="删除照片"
                          title="删除照片"
                        >
                          <Trash2 className="h-[18px] w-[18px]" />
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="border-t border-[#5D4037]/10 bg-[#FFFBF0] px-3 py-3">
                    <div className="flex items-center gap-1 text-[12px] text-[#5D4037]/72">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{dateText}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-[#5D4037]/76">
                      <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-[#5D4037]/12 bg-white/90 px-2">
                        <Eye className="h-3.5 w-3.5" />
                        <span>{Math.max(0, Number(photo.view_count || 0))}</span>
                      </span>
                      <span className="inline-flex min-h-6 items-center gap-1 rounded-full border border-[#5D4037]/12 bg-white/90 px-2">
                        <Download className="h-3.5 w-3.5" />
                        <span>{Math.max(0, Number(photo.download_count || 0))}</span>
                      </span>
                      {hasStory && (
                        <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-[#FFC857]/24 px-2 text-[#5D4037]">
                          <RotateCcw className="h-3 w-3" />
                          <span>故事</span>
                        </span>
                      )}
                      {!hasStory && Boolean(photo.is_highlight) && (
                        <span className="inline-flex min-h-6 items-center gap-1 rounded-full bg-[#5D4037]/10 px-2 text-[#5D4037]">
                          <Sparkles className="h-3 w-3" />
                          <span>高亮</span>
                        </span>
                      )}
                    </div>

                    {!isSelectionMode && (
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            pinPhotoToTop(photo.id);
                          }}
                          disabled={index === 0 || actionLoading}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-full border border-[#5D4037]/20 bg-white px-3 text-[12px] font-medium text-[#5D4037] transition-colors hover:bg-[#FFC857]/20 disabled:opacity-40"
                          aria-label="置顶"
                          title="置顶"
                        >
                          <ArrowUpToLine className="h-3.5 w-3.5" />
                          <span>置顶</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            movePhotoOrder(photo.id, 'up');
                          }}
                          disabled={index === 0 || actionLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#5D4037]/20 bg-white text-[#5D4037] transition-colors hover:bg-[#FFC857]/20 disabled:opacity-40"
                          aria-label="上移"
                          title="上移"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            movePhotoOrder(photo.id, 'down');
                          }}
                          disabled={index === filteredPhotos.length - 1 || actionLoading}
                          className="flex h-8 w-8 items-center justify-center rounded-full border border-[#5D4037]/20 bg-white text-[#5D4037] transition-colors hover:bg-[#FFC857]/20 disabled:opacity-40"
                          aria-label="下移"
                          title="下移"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* 分页 */}
      {!loading && !isSystemWallAlbum && currentFolderDisplayTotalCount > 0 ? (
        <div className="mt-6 flex items-center justify-center gap-2">
          <span className="inline-flex min-h-8 items-center rounded-full bg-[#FFC857]/20 px-4 py-2 text-sm font-medium text-[#5D4037]">
            {currentFolderLoadedCount < currentFolderDisplayTotalCount
              ? `已加载 ${currentFolderLoadedCount} / ${currentFolderDisplayTotalCount} 张，继续下滑自动加载`
              : `已全部加载，共 ${currentFolderDisplayTotalCount} 张`}
          </span>
        </div>
      ) : null}

        </>
      )}
      {showNewFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-[#5D4037] mb-4">新建文件夹</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="输入文件夹名称"
              className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 mb-4 transition-all"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={actionLoading}
                className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {actionLoading ? '创建中...' : '创建'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditRootModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => !actionLoading && setShowEditRootModal(false)}
        >
          <div className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-[#5D4037] mb-4">修改根目录名称</h3>
            <input
              type="text"
              value={newRootFolderName}
              onChange={(e) => setNewRootFolderName(e.target.value)}
              placeholder="输入根目录名称"
              maxLength={30}
              className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 mb-2 transition-all"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleUpdateRootFolderName();
                }
              }}
            />
            <p className="text-xs text-[#5D4037]/60 mb-4">建议 2-12 个字，最多 30 个字符</p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowEditRootModal(false)}
                disabled={actionLoading}
                className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleUpdateRootFolderName}
                disabled={actionLoading}
                className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
              >
                {actionLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditFolderModal && (
        <div
          className="gallery-manager-modal-mask"
          onClick={() => {
            if (actionLoading) {
              return;
            }
            setShowEditFolderModal(false);
            setEditingFolder(null);
            setEditingFolderName('');
          }}
        >
          <div className="gallery-manager-modal" onClick={(event) => event.stopPropagation()}>
            <div className="gallery-manager-modal__header">
              <h3 className="gallery-manager-modal__title">修改文件夹名称</h3>
            </div>
            <div className="gallery-manager-modal__body">
              <input
                type="text"
                value={editingFolderName}
                onChange={(event) => setEditingFolderName(event.target.value)}
                placeholder="输入文件夹名称"
                maxLength={50}
                className="gallery-manager-modal__input"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    handleUpdateFolderName();
                  }
                }}
              />
              <p className="gallery-manager-modal__hint">建议 2-12 个字，最多 50 个字符</p>
            </div>
            <div className="gallery-manager-modal__footer">
              <button
                type="button"
                onClick={() => {
                  setShowEditFolderModal(false);
                  setEditingFolder(null);
                  setEditingFolderName('');
                }}
                disabled={actionLoading}
                className="gallery-manager-modal__btn gallery-manager-modal__btn--ghost"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleUpdateFolderName}
                disabled={actionLoading}
                className="gallery-manager-modal__btn gallery-manager-modal__btn--primary"
              >
                {actionLoading ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* 删除文件夹确认对话框 */}
      <AnimatePresence>
        {deletingFolder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeDeleteFolderModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Folder className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除文件夹</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除文件夹 <span className="font-bold">{deletingFolder.name}</span> 吗？
                </p>
                <div className={`${deleteFolderNeedsManualConfirm ? 'bg-red-50' : 'bg-orange-50'} rounded-xl p-4 text-left`}>
                  <p className={`text-sm ${deleteFolderNeedsManualConfirm ? 'text-red-700' : 'text-orange-800'}`}>
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    文件夹内的照片将移至根目录
                  </p>
                  {deleteFolderNeedsManualConfirm && (
                    <p className="mt-2 text-sm leading-6 text-red-700">
                      当前文件夹共有 <span className="font-semibold">{Math.max(0, Number(deletingFolder.photoCount || 0))}</span> 张照片。
                      为避免误删，请先手动输入“<span className="font-semibold">{DELETE_FOLDER_CONFIRM_PHRASE}</span>”。
                    </p>
                  )}
                </div>
                {deleteFolderNeedsManualConfirm && (
                  <div className="mt-4 text-left">
                    <input
                      type="text"
                      value={deleteFolderConfirmText}
                      onChange={(event) => setDeleteFolderConfirmText(event.target.value)}
                      placeholder={`请输入 ${DELETE_FOLDER_CONFIRM_PHRASE}`}
                      maxLength={20}
                      className="gallery-manager-modal__input"
                      autoFocus
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && deleteFolderConfirmMatched) {
                          event.preventDefault();
                          void confirmDeleteFolder();
                        }
                      }}
                    />
                    <p className="gallery-manager-modal__hint text-red-600">
                      仅当输入内容完全等于“<span className="font-semibold">{DELETE_FOLDER_CONFIRM_PHRASE}</span>”时才可删除。
                    </p>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={closeDeleteFolderModal}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteFolder}
                  disabled={actionLoading || (deleteFolderNeedsManualConfirm && !deleteFolderConfirmMatched)}
                  className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-full font-medium hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除照片确认对话框 */}
      <AnimatePresence>
        {deletingPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingPhoto(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除照片</h3>
                <p className="text-sm text-[#5D4037]/80">
                  确定要删除这张照片吗？此操作不可撤销。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingPhoto(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeletePhoto}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量删除确认对话框 */}
      <AnimatePresence>
        {showBatchDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowBatchDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">批量删除照片</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除选中的 <span className="font-bold text-red-600">{selectedPhotoIds.length}</span> 张照片吗？
                </p>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-sm text-red-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    此操作不可撤销！
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmBatchDelete}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 照片迁移对话框 */}
      <AnimatePresence>
        {showMoveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={closeMoveModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-4">
                <div className="w-14 h-14 bg-[#FFC857]/25 rounded-full flex items-center justify-center mx-auto mb-3">
                  <ArrowRightLeft className="w-7 h-7 text-[#5D4037]" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">迁移照片</h3>
                <p className="text-sm text-[#5D4037]/75">
                  选择目标文件夹，将 {movingPhotoIds.length} 张照片迁移过去
                </p>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                <button
                  onClick={() => setMoveTargetFolder(ROOT_FOLDER_SENTINEL)}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all border ${
                    moveTargetFolder === ROOT_FOLDER_SENTINEL
                      ? 'bg-[#FFC857]/25 border-[#FFC857] text-[#5D4037]'
                      : 'bg-white border-[#5D4037]/15 text-[#5D4037]/80 hover:bg-[#FFFBF0]'
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Folder className="w-4 h-4 shrink-0" />
                    <span className="truncate">{rootFolderName}{rootFolderHidden ? ' ·已隐藏' : ''}</span>
                  </span>
                  <span className="text-xs">{photos.filter((p) => !p.folder_id).length}</span>
                </button>

                {folders.map((folder) => (
                  <button
                    key={folder.id}
                    onClick={() => setMoveTargetFolder(folder.id)}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all border ${
                      moveTargetFolder === folder.id
                        ? 'bg-[#FFC857]/25 border-[#FFC857] text-[#5D4037]'
                        : 'bg-white border-[#5D4037]/15 text-[#5D4037]/80 hover:bg-[#FFFBF0]'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Folder className="w-4 h-4 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    <span className="text-xs">{photos.filter((p) => p.folder_id === folder.id).length}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-2 mt-5">
                <button
                  onClick={closeMoveModal}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmMovePhotos}
                  disabled={actionLoading || movingPhotoIds.length === 0}
                  className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '迁移中...' : '确认迁移'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast通知 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-lg backdrop-blur-sm ${
              showToast.type === 'success'
                ? 'bg-green-500/95 text-white'
                : showToast.type === 'warning'
                ? 'bg-orange-500/95 text-white'
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : showToast.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="font-medium">{showToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 上传照片模态框 */}
      <AnimatePresence>
        {showUploadModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => {
              if (uploading) return;
              setShowUploadModal(false);
              setSingleImage(null);
              setSingleStoryText('');
              setSingleHighlight(false);
              setSingleShotDate(getTodayUTC8());
              setSingleShotLocation('');
              setBatchShotDate(getTodayUTC8());
              setBatchShotLocation('');
              setBatchImages([]);
              setUploadProgress({ current: 0, total: 0 });
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold text-[#5D4037]">上传照片</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (uploading) return;
                    setShowUploadModal(false);
                    setSingleImage(null);
                    setSingleStoryText('');
                    setSingleHighlight(false);
                    setSingleShotDate(getTodayUTC8());
                    setSingleShotLocation('');
                    setBatchShotDate(getTodayUTC8());
                    setBatchShotLocation('');
                    setBatchImages([]);
                    setUploadProgress({ current: 0, total: 0 });
                  }}
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭上传照片弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="inline-flex bg-[#FFFBF0] rounded-full p-1 border border-[#5D4037]/15">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadMode('single');
                      setSingleImage(null);
                      setSingleStoryText('');
                      setSingleHighlight(false);
                      setSingleShotDate(getTodayUTC8());
                      setSingleShotLocation('');
                      setBatchShotDate(getTodayUTC8());
                      setBatchShotLocation('');
                      setBatchImages([]);
                      setUploadProgress({ current: 0, total: 0 });
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      uploadMode === 'single' ? 'bg-[#FFC857] text-[#5D4037]' : 'text-[#5D4037]/70 hover:bg-white'
                    }`}
                  >
                    单图
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUploadMode('batch');
                      setSingleImage(null);
                      setSingleStoryText('');
                      setSingleHighlight(false);
                      setSingleShotDate(getTodayUTC8());
                      setSingleShotLocation('');
                      setBatchShotDate(getTodayUTC8());
                      setBatchShotLocation('');
                      setBatchImages([]);
                      setUploadProgress({ current: 0, total: 0 });
                    }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      uploadMode === 'batch' ? 'bg-[#FFC857] text-[#5D4037]' : 'text-[#5D4037]/70 hover:bg-white'
                    }`}
                  >
                    批量
                  </button>
                </div>

                {uploadMode === 'single' ? (
                  <>
                    <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => handleSingleImageSelect(e.target.files)}
                        className="hidden"
                        id="single-upload"
                      />
                      <label htmlFor="single-upload" className="cursor-pointer">
                        <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                        <p className="text-sm text-[#5D4037]/60">
                          {singleImage ? singleImage.name : '点击选择单张图片'}
                        </p>
                      </label>
                    </div>

                    <div className="rounded-xl border border-[#5D4037]/15 bg-[#FFFBF0] px-4 py-3">
                      <label className="block text-sm text-[#5D4037] mb-1">拍摄日期（单图可选）</label>
                      <input
                        type="date"
                        value={singleShotDate}
                        onChange={(e) => setSingleShotDate(e.target.value)}
                        className="w-full rounded-lg border border-[#5D4037]/20 bg-white px-3 py-2 text-sm text-[#5D4037] focus:outline-none focus:border-[#FFC857]"
                      />
                    </div>

                    <div className="rounded-xl border border-[#5D4037]/15 bg-[#FFFBF0] px-4 py-3">
                      <label className="block text-sm text-[#5D4037] mb-1">拍摄地点（单图可选）</label>
                      <input
                        type="text"
                        value={singleShotLocation}
                        onChange={(e) => setSingleShotLocation(e.target.value)}
                        maxLength={255}
                        placeholder="例如：成都·人民公园"
                        className="w-full rounded-lg border border-[#5D4037]/20 bg-white px-3 py-2 text-sm text-[#5D4037] placeholder:text-[#5D4037]/35 focus:outline-none focus:border-[#FFC857]"
                      />
                    </div>

                    <textarea
                      value={singleStoryText}
                      onChange={(e) => setSingleStoryText(e.target.value)}
                      maxLength={800}
                      placeholder="关于此刻（可选，仅单图支持）"
                      className="w-full min-h-[120px] px-4 py-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] bg-[#FFFBF0]/45 text-sm text-[#5D4037]"
                    />

                    <label className="flex items-center justify-between rounded-xl border border-[#5D4037]/15 bg-[#FFFBF0] px-4 py-3 cursor-pointer">
                      <span className="text-sm text-[#5D4037]">高亮该照片（即使没有文案）</span>
                      <input
                        type="checkbox"
                        checked={singleHighlight}
                        onChange={(e) => setSingleHighlight(e.target.checked)}
                        className="w-4 h-4 accent-[#FFC857]"
                      />
                    </label>

                    <button
                      onClick={handleUploadSinglePhoto}
                      disabled={uploading || !singleImage}
                      className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                    >
                      {uploading ? '上传中...' : '上传单张照片'}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => handleBatchImageSelect(e.target.files)}
                        className="hidden"
                        id="batch-upload"
                      />
                      <label htmlFor="batch-upload" className="cursor-pointer">
                        <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                        <p className="text-sm text-[#5D4037]/60">
                          {batchImages.length > 0
                            ? `已选择 ${batchImages.length} 张图片`
                            : '点击选择多张图片'}
                        </p>
                      </label>
                    </div>

                    {batchImages.length > 0 && (
                      <div className="bg-[#FFFBF0] rounded-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-[#5D4037]">
                            已选择 {batchImages.length} 张图片
                          </span>
                          <button
                            onClick={() => setBatchImages([])}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            清空
                          </button>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-1">
                          {batchImages.map((file, index) => (
                            <div key={index} className="text-xs text-[#5D4037]/60 truncate">
                              {index + 1}. {file.name}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="rounded-xl border border-[#5D4037]/15 bg-[#FFFBF0] px-4 py-3">
                      <label className="block text-sm text-[#5D4037] mb-1">拍摄日期（批量统一）</label>
                      <input
                        type="date"
                        value={batchShotDate}
                        onChange={(e) => setBatchShotDate(e.target.value)}
                        className="w-full rounded-lg border border-[#5D4037]/20 bg-white px-3 py-2 text-sm text-[#5D4037] focus:outline-none focus:border-[#FFC857]"
                      />
                    </div>

                    <div className="rounded-xl border border-[#5D4037]/15 bg-[#FFFBF0] px-4 py-3">
                      <label className="block text-sm text-[#5D4037] mb-1">拍摄地点（批量统一，可选）</label>
                      <input
                        type="text"
                        value={batchShotLocation}
                        onChange={(e) => setBatchShotLocation(e.target.value)}
                        maxLength={255}
                        placeholder="例如：成都·人民公园"
                        className="w-full rounded-lg border border-[#5D4037]/20 bg-white px-3 py-2 text-sm text-[#5D4037] placeholder:text-[#5D4037]/35 focus:outline-none focus:border-[#FFC857]"
                      />
                    </div>

                    {uploading && uploadProgress.total > 0 && (
                      <div className="bg-[#FFFBF0] rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-[#5D4037]">
                            上传进度
                          </span>
                          <span className="text-sm text-[#5D4037]/60">
                            {uploadProgress.current} / {uploadProgress.total}
                          </span>
                        </div>
                        <div className="w-full bg-white rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-[#FFC857] transition-all duration-300"
                            style={{ width: `${(uploadProgress.current / uploadProgress.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <button
                      onClick={handleUploadPhotos}
                      disabled={uploading || batchImages.length === 0}
                      className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                    >
                      {uploading
                        ? `上传中 (${uploadProgress.current}/${uploadProgress.total})...`
                        : `批量上传 (${batchImages.length} 张)`}
                    </button>
                  </>
                )}

                {uploadMode === 'batch' ? (
                  <div className="text-xs text-[#5D4037]/55">批量上传可统一设置拍摄日期和拍摄地点，不支持“关于此刻”，可在列表中后续编辑。</div>
                ) : (
                  <div className="text-xs text-[#5D4037]/55">单图上传支持设置拍摄日期、拍摄地点、“关于此刻”和高亮。</div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 关于此刻编辑弹窗 */}
      <AnimatePresence>
        {showStoryModal && editingStoryPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={closeStoryModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h3 className="text-xl font-bold text-[#5D4037]">编辑关于此刻</h3>
                <button
                  type="button"
                  onClick={closeStoryModal}
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭照片文案弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <textarea
                value={editingStoryText}
                onChange={(e) => setEditingStoryText(e.target.value)}
                maxLength={800}
                placeholder="写下这张照片的故事（可留空）"
                className="w-full min-h-[160px] px-4 py-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] bg-[#FFFBF0]/45 text-sm text-[#5D4037]"
              />

              <label className="mt-3 flex items-center justify-between rounded-xl border border-[#5D4037]/15 bg-[#FFFBF0] px-4 py-3 cursor-pointer">
                <span className="text-sm text-[#5D4037]">高亮该照片（可独立于文案）</span>
                <input
                  type="checkbox"
                  checked={editingHighlight}
                  onChange={(e) => setEditingHighlight(e.target.checked)}
                  className="w-4 h-4 accent-[#FFC857]"
                />
              </label>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={closeStoryModal}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={savePhotoStory}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {actionLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 拍摄日期编辑弹窗 */}
      <AnimatePresence>
        {showShotDateModal && editingShotDatePhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={closeShotDateModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <h3 className="text-xl font-bold text-[#5D4037]">修改拍摄信息</h3>
                <button
                  type="button"
                  onClick={closeShotDateModal}
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭拍摄信息弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  type="date"
                  value={editingShotDateValue}
                  onChange={(e) => setEditingShotDateValue(e.target.value)}
                  className="w-full px-4 py-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] bg-[#FFFBF0]/45 text-sm text-[#5D4037]"
                />

                <input
                  type="text"
                  value={editingShotLocationValue}
                  onChange={(e) => setEditingShotLocationValue(e.target.value)}
                  maxLength={255}
                  placeholder="拍摄地点（可留空）"
                  className="w-full px-4 py-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] bg-[#FFFBF0]/45 text-sm text-[#5D4037] placeholder:text-[#5D4037]/35"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setEditingShotLocationValue('')}
                    disabled={actionLoading || !editingShotLocationValue}
                    className="px-3 py-1.5 text-xs rounded-full border border-[#5D4037]/20 text-[#5D4037]/75 hover:bg-[#5D4037]/5 disabled:opacity-40"
                  >
                    清空地点
                  </button>
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  onClick={closeShotDateModal}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={savePhotoShotDate}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {actionLoading ? '保存中...' : '保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 便利贴风格预览弹窗 */}
      <AnimatePresence>
        {previewPhoto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPreviewPhoto(null)}
              className="fixed inset-0 bg-black/50 z-50"
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
                  className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
                >
                  <X className="action-icon-svg" />
                </button>

                {/* 图片容器 */}
                <div className="p-4 pb-3">
                  <div className="relative bg-white rounded-lg overflow-hidden shadow-inner">
                    {photoUrls[previewPhoto.id] && (
                      <img
                        src={photoUrls[previewPhoto.id]}
                        alt="预览"
                        className="w-full h-auto max-h-[70vh] object-contain"
                      />
                    )}
                  </div>
                </div>

                {/* 信息区域 */}
                <div className="px-4 pb-4 border-t-2 border-dashed border-[#5D4037]/10 pt-3 bg-white/50">
                  <div className="flex items-center justify-center gap-6 text-[#5D4037]">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-4 h-4" />
                      <span className="text-sm font-medium">照片预览</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default AlbumDetailPageContent;
