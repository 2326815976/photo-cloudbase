'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, ArrowRightLeft, FolderPlus, Upload, Trash2, Image as ImageIcon, Folder, X, CheckCircle, XCircle, AlertCircle, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateAlbumImageVersions } from '@/lib/utils/image-versions';
import { generateBlurHash } from '@/lib/utils/blurhash';
import { uploadToCloudBaseDirect } from '@/lib/storage/cloudbase-upload-client';

interface Album {
  id: string;
  title: string;
  access_key: string;
  root_folder_name?: string | null;
}

interface AlbumFolder {
  id: string;
  name: string;
  created_at: string;
}

interface Photo {
  id: string;
  url: string | null;  // 兼容字段
  thumbnail_url?: string | null;  // 新字段
  preview_url?: string | null;    // 新字段
  original_url?: string | null;   // 新字段
  folder_id: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

const ROOT_FOLDER_SENTINEL = '__ROOT__';

export default function AlbumDetailPage() {
  const router = useRouter();
  const params = useParams();
  const albumId = params.id as string;

  const [album, setAlbum] = useState<Album | null>(null);
  const [folders, setFolders] = useState<AlbumFolder[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('batch');
  const [batchImages, setBatchImages] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const photosPerPage = 20;
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deletingFolder, setDeletingFolder] = useState<AlbumFolder | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<Photo | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [movingPhotoIds, setMovingPhotoIds] = useState<string[]>([]);
  const [moveTargetFolder, setMoveTargetFolder] = useState<string>(ROOT_FOLDER_SENTINEL);
  const [actionLoading, setActionLoading] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [showEditRootModal, setShowEditRootModal] = useState(false);
  const [newRootFolderName, setNewRootFolderName] = useState('');

  useEffect(() => {
    loadAlbumData();
  }, [albumId, currentPage]);

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

  const loadAlbumData = async () => {
    setLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const [albumRes, foldersRes, photosRes] = await Promise.all([
      dbClient.from('albums').select('*').eq('id', albumId).single(),
      dbClient.from('album_folders').select('*').eq('album_id', albumId).order('created_at', { ascending: false }),
      dbClient.from('album_photos').select('*', { count: 'exact' }).eq('album_id', albumId).order('created_at', { ascending: false }).range((currentPage - 1) * photosPerPage, currentPage * photosPerPage - 1),
    ]);

    if (albumRes.data) setAlbum(albumRes.data);
    if (foldersRes.data) setFolders(foldersRes.data);
    if (photosRes.data) {
      setPhotos(photosRes.data);
      setTotalCount(photosRes.count || 0);
    }

    setLoading(false);
  };

  const loadPhotoUrls = async (photosToLoad: Photo[]) => {
    const dbClient = createClient();
    if (!dbClient) {
      return;
    }

    // 过滤掉所有URL字段都为空的照片，优先使用新字段
    const validPhotos = photosToLoad.filter((photo): photo is Photo & { thumbnail_url: string } => {
      const url = photo.thumbnail_url || photo.preview_url || photo.url;
      return url !== null && url !== undefined;
    });

    if (validPhotos.length === 0) {
      return;
    }

    // 并行生成所有URL，优先使用 thumbnail_url
    const urlPromises = validPhotos.map(photo => {
      const storageUrl = photo.thumbnail_url || photo.preview_url || photo.url;
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
    setShowToast({ message: '根目录名称已更新', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const handleDeleteFolder = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      setDeletingFolder(folder);
    }
  };

  const confirmDeleteFolder = async () => {
    if (!deletingFolder) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingFolder(null);
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
      const currentRootName = String(album?.root_folder_name ?? '').trim() || '根目录';
      setShowToast({ message: `文件夹已删除，照片已移至${currentRootName}`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
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
      url: string;
      thumbnail_url: string;
      preview_url: string;
      original_url: string;
      width: number;
      height: number;
      blurhash: string;
    }
  ): Promise<{ message: string } | null> => {
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
      const variants: Array<Record<string, unknown>> = [
        withOptionalFolderId(
          {
            album_id: attemptPayload.album_id,
            url: attemptPayload.url,
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
            url: attemptPayload.url,
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
            url: attemptPayload.url,
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
            url: attemptPayload.url,
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

      const uniqueVariants: Array<Record<string, unknown>> = [];
      const seenSignatures = new Set<string>();
      for (const variant of variants) {
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

    for (let i = 0; i < batchImages.length; i++) {
      const file = batchImages[i];
      setUploadProgress({ current: i + 1, total: batchImages.length });

      try {
        // 1. 生成多版本图片（thumbnail + preview + original，智能压缩）
        const versions = await generateAlbumImageVersions(file);
        const thumbnailVersion = versions.find(v => v.type === 'thumbnail')!;

        // 2. 生成 BlurHash（基于 thumbnail）
        const blurhash = await generateBlurHash(thumbnailVersion.file);

        const timestamp = Date.now();
        let thumbnail_url = '';
        let preview_url = '';
        let original_url = '';
        const uploadedKeys: string[] = [];
        let uploadFailed = false;

        // 3. 客户端上传三个版本到 CloudBase 云存储（albums 目录）
        for (const version of versions) {
          // thumbnail 和 preview 使用 webp，original 保持原格式
          const ext = version.type === 'original' ? file.name.split('.').pop() : 'webp';
          const fileName = `${timestamp}_${i}_${version.type}.${ext}`;

          try {
            const publicUrl = await uploadToCloudBaseDirect(version.file, fileName, 'albums');
            uploadedKeys.push(`albums/${fileName}`);

            if (version.type === 'thumbnail') thumbnail_url = publicUrl;
            else if (version.type === 'preview') preview_url = publicUrl;
            else if (version.type === 'original') original_url = publicUrl;
          } catch (uploadError) {
            console.error(`上传 ${version.type} 失败:`, uploadError);
            uploadFailed = true;
            break;
          }
        }

        if (uploadFailed) {
          failCount++;
          await cleanupUploadedFiles(uploadedKeys);
          continue;
        }

        // 4. 插入数据库
        if (thumbnail_url && preview_url && original_url) {
          const insertError = await insertAlbumPhotoWithCompat(dbClient, {
            album_id: albumId,
            folder_id: uploadFolderId,
            url: preview_url || original_url || thumbnail_url,
            thumbnail_url,
            preview_url,
            original_url,
            width: thumbnailVersion.width,
            height: thumbnailVersion.height,
            blurhash,
          });

          if (insertError) {
            if (!firstFailureReason) {
              firstFailureReason = insertError.message;
            }
            console.error('插入 album_photos 失败:', insertError.message);
            failCount++;
            await cleanupUploadedFiles(uploadedKeys);
          } else {
            successCount++;
          }
        } else {
          if (!firstFailureReason) {
            firstFailureReason = '上传后未获取完整图片地址';
          }
          failCount++;
          await cleanupUploadedFiles(uploadedKeys);
        }
      } catch (error) {
        if (!firstFailureReason) {
          firstFailureReason = error instanceof Error ? error.message : '上传流程异常';
        }
        failCount++;
      }
    }

    setUploading(false);
    setShowUploadModal(false);
    setBatchImages([]);
    setUploadProgress({ current: 0, total: 0 });

    if (successCount > 0) {
      loadAlbumData();
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

  const handleDeletePhoto = async (photoId: string, photoUrl: string | null) => {
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
        .select('id, thumbnail_url, preview_url, original_url')
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

      const filesToDelete = [
        String(targetPhoto.thumbnail_url ?? '').trim(),
        String(targetPhoto.preview_url ?? '').trim(),
        String(targetPhoto.original_url ?? '').trim(),
      ].filter(Boolean);

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

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllPhotos = () => {
    setSelectedPhotoIds(filteredPhotos.map(p => p.id));
  };

  const clearPhotoSelection = () => {
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
        .select('id, thumbnail_url, preview_url, original_url')
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
        String(photo.thumbnail_url ?? '').trim() || null,
        String(photo.preview_url ?? '').trim() || null,
        String(photo.original_url ?? '').trim() || null,
      ]).filter(Boolean) as string[];

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
          console.error('删除云存储文件失败:', error);
          storageCleanupFailed = true;
        }
      }

      setActionLoading(false);
      setSelectedPhotoIds([]);
      setIsSelectionMode(false);
      loadAlbumData();

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

  const filteredPhotos = selectedFolder
    ? photos.filter((p) => p.folder_id === selectedFolder)
    : photos.filter((p) => !p.folder_id);
  const rootFolderName = String(album?.root_folder_name ?? '').trim() || '根目录';

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-sm text-[#5D4037]/60">加载中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
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
                onClick={() => setShowUploadModal(true)}
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
                onClick={selectAllPhotos}
                className="px-3 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 active:scale-95 transition-all whitespace-nowrap"
              >
                全选 ({selectedPhotoIds.length}/{filteredPhotos.length})
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
            onClick={() => setSelectedFolder(null)}
            className={`px-3 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
              selectedFolder === null ? 'bg-[#FFC857] text-[#5D4037] shadow-sm' : 'bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5'
            }`}
          >
            {rootFolderName} ({photos.filter((p) => !p.folder_id).length})
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEditRootModal();
            }}
            className="absolute -top-2 -right-2 w-6 h-6 bg-[#5D4037] text-white rounded-full opacity-0 group-hover:opacity-100 md:opacity-100 md:scale-75 md:group-hover:scale-100 transition-all flex items-center justify-center active:scale-95"
            aria-label="修改根目录名称"
            title="修改根目录名称"
          >
            <Pencil className="w-3 h-3" />
          </button>
        </div>
        {folders.map((folder) => (
          <div key={folder.id} className="relative group">
            <button
              onClick={() => setSelectedFolder(folder.id)}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-all active:scale-95 ${
                selectedFolder === folder.id ? 'bg-[#FFC857] text-[#5D4037] shadow-sm' : 'bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5'
              }`}
            >
              <Folder className="w-4 h-4 inline mr-1" />
              {folder.name} ({photos.filter((p) => p.folder_id === folder.id).length})
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFolder(folder.id);
              }}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 md:opacity-100 md:scale-75 md:group-hover:scale-100 transition-all flex items-center justify-center active:scale-95"
              aria-label="删除文件夹"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      {filteredPhotos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <ImageIcon className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无照片</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          <AnimatePresence>
            {filteredPhotos.map((photo) => {
              const folderName = photo.folder_id
                ? folders.find((folder) => String(folder.id) === String(photo.folder_id))?.name || '未知文件夹'
                : rootFolderName;
              const dateText = photo.created_at ? String(photo.created_at).slice(5, 10).replace('-', '/') : '--/--';
              return (
                <motion.div
                  key={photo.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className={`relative bg-white rounded-[28px] overflow-hidden transition-all ${
                    isSelectionMode
                      ? selectedPhotoIds.includes(photo.id)
                        ? 'ring-4 ring-[#FFC857]/75 shadow-[0_10px_28px_rgba(93,64,55,0.22)]'
                        : 'ring-1 ring-[#5D4037]/10 shadow-[0_8px_24px_rgba(93,64,55,0.14)] hover:ring-[#FFC857]/45'
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
                  <div className="relative aspect-[4/5] bg-[#f5f5f5]">
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
                          className="w-full h-full object-cover"
                          onError={(e) => console.error(`❌ 照片 ${photo.id} 加载失败:`, e)}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-[#f5f5f5]">
                          <div className="w-8 h-8 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      );
                    })()}

                    {!isSelectionMode && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openMoveModal([photo.id]);
                          }}
                          className="absolute top-3 right-14 w-10 h-10 bg-[#FFC857] text-[#5D4037] rounded-full hover:bg-[#f2b93f] transition-colors flex items-center justify-center shadow-md"
                          aria-label="迁移照片"
                          title="迁移到其他文件夹"
                        >
                          <ArrowRightLeft className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeletePhoto(photo.id, photo.url);
                          }}
                          className="absolute top-3 right-3 w-10 h-10 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors flex items-center justify-center shadow-md"
                          aria-label="删除照片"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </>
                    )}
                  </div>

                  <div className="px-3 py-2 bg-[#FFFBF0] border-t border-[#5D4037]/10 flex items-center justify-between text-xs">
                    <span className="inline-flex items-center gap-1 text-[#5D4037]/75 truncate max-w-[70%]">
                      <Folder className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{folderName}</span>
                    </span>
                    <span className="text-[#5D4037]/55">{dateText}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* 分页 */}
      {!loading && totalCount > photosPerPage && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            上一页
          </button>
          <span className="px-4 py-2 bg-[#FFC857]/20 rounded-full text-[#5D4037] font-medium">
            第 {currentPage} 页 / 共 {Math.ceil(totalCount / photosPerPage)} 页
          </span>
          <button
            onClick={() => setCurrentPage(currentPage + 1)}
            disabled={currentPage >= Math.ceil(totalCount / photosPerPage)}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            下一页
          </button>
        </div>
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

      {/* 删除文件夹确认对话框 */}
      <AnimatePresence>
        {deletingFolder && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingFolder(null)}
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
                <div className="bg-orange-50 rounded-xl p-4 text-left">
                  <p className="text-sm text-orange-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    文件夹内的照片将移至根目录
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingFolder(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteFolder}
                  disabled={actionLoading}
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
                    <span className="truncate">{rootFolderName}</span>
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
            onClick={() => setShowUploadModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">批量上传照片</h2>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>
              </div>

              <div className="space-y-4">
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
                    : `批量上传 (${batchImages.length} 张)`
                  }
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
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors z-20"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
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





