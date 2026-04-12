'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { Camera, Plus, Trash2, Tag, Search, Pencil, X, Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generatePoseImage } from '@/lib/utils/image-versions';
import { uploadToCloudBaseDirect } from '@/lib/storage/cloudbase-upload-client';
import { useBeforeUnloadGuard } from '@/lib/hooks/useBeforeUnloadGuard';
import AdminLoadingCard from '../components/AdminLoadingCard';
import { useAutoLoadMore } from '../hooks/useAutoLoadMore';

interface Pose {
  id: number;
  image_url: string;
  storage_path: string;
  tags: string[];
  view_count: number;
  created_at: string;
}

interface PoseTag {
  id: number;
  name: string;
  usage_count: number;
  sort_order?: number;
  created_at: string;
}

type RefreshLoadResult = 'success' | 'failed' | 'stale';
type RefreshScope = 'poses' | 'tags' | 'all';

function isDuplicateEntryError(error: any): boolean {
  const errorCode = String(error?.code ?? error?.errno ?? '').trim().toLowerCase();
  if (errorCode === '23505' || errorCode === '1062' || errorCode === 'er_dup_entry') {
    return true;
  }

  const text = [
    error?.message,
    error?.details,
    error?.hint,
    error?.detailMessage,
  ]
    .map((item) => String(item ?? '').toLowerCase())
    .join(' ');

  return (
    text.includes('duplicate entry') ||
    text.includes('er_dup_entry') ||
    text.includes('1062') ||
    text.includes('uk_pose_tags_name')
  );
}

function normalizeTagName(input: string): string {
  return String(input ?? '').trim().replace(/\s+/g, ' ');
}

function parseUniqueTagNames(rawInput: string): string[] {
  const normalizedNames = rawInput
    .split(/[,，]/)
    .map((name) => normalizeTagName(name))
    .filter((name) => name.length > 0);

  const seen = new Set<string>();
  const uniqueNames: string[] = [];

  normalizedNames.forEach((name) => {
    const key = name.toLocaleLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    uniqueNames.push(name);
  });

  return uniqueNames;
}

function dedupeTagNames(tagNames: string[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];

  tagNames.forEach((item) => {
    const name = normalizeTagName(item);
    const key = name.toLocaleLowerCase();
    if (!name || seen.has(key)) {
      return;
    }
    seen.add(key);
    names.push(name);
  });

  return names;
}

const IMAGE_INSERT_TIMEOUT_MS = 30 * 1000;

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== '') {
    return error.message;
  }
  if (error && typeof error === 'object') {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') {
      return maybeMessage;
    }
  }
  return '未知错误';
}

function isSortOrderColumnMissing(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').toLowerCase()
      : String(error ?? '').toLowerCase();

  return (
    message.includes('sort_order') &&
    (message.includes('unknown column') ||
      message.includes('does not exist') ||
      (message.includes('column') && message.includes('not found')))
  );
}

async function fetchOrderedPoseTags(
  dbClient: NonNullable<ReturnType<typeof createClient>>
): Promise<PoseTag[]> {
  const sortedResult = await dbClient
    .from('pose_tags')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (!sortedResult.error) {
    return Array.isArray(sortedResult.data) ? sortedResult.data : [];
  }

  if (!isSortOrderColumnMissing(sortedResult.error)) {
    throw sortedResult.error;
  }

  const fallbackResult = await dbClient
    .from('pose_tags')
    .select('*')
    .order('usage_count', { ascending: false })
    .order('name', { ascending: true });

  if (fallbackResult.error) {
    throw fallbackResult.error;
  }

  return Array.isArray(fallbackResult.data) ? fallbackResult.data : [];
}

function withTimeout<T>(
  promiseLike: PromiseLike<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return Promise.resolve(promiseLike);
  }

  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);

    Promise.resolve(promiseLike)
      .then((value) => resolve(value))
      .catch((error) => reject(error))
      .finally(() => clearTimeout(timeoutId));
  });
}

function toFileSizeMb(file: File): number {
  const sizeMb = file.size / (1024 * 1024);
  return Number.isFinite(sizeMb) && sizeMb > 0 ? sizeMb : 0;
}

function resolveImageExtension(file: File): string {
  const mime = String(file.type ?? '').trim().toLowerCase();
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';

  const lowerName = String(file.name ?? '').trim().toLowerCase();
  const matched = lowerName.match(/\.([a-z0-9]+)$/);
  const ext = matched?.[1];
  if (ext === 'jpeg') return 'jpg';
  if (ext && ['webp', 'png', 'jpg', 'gif'].includes(ext)) {
    return ext;
  }
  return 'webp';
}

function getCompressTimeoutMs(file: File): number {
  const sizeMb = toFileSizeMb(file);
  const isPng = String(file.type ?? '').toLowerCase() === 'image/png';
  // 大图（尤其 PNG）压缩耗时明显更长，按体积动态放宽超时，避免误判。
  const baseMs = 30 * 1000 + Math.ceil(sizeMb) * 12 * 1000;
  const dynamicMs = isPng ? baseMs + 25 * 1000 : baseMs;
  return Math.max(30 * 1000, Math.min(dynamicMs, 5 * 60 * 1000));
}

function getUploadTimeoutMs(file: File): number {
  const sizeMb = toFileSizeMb(file);
  const dynamicMs = 60 * 1000 + Math.ceil(sizeMb) * 8 * 1000;
  return Math.max(60 * 1000, Math.min(dynamicMs, 4 * 60 * 1000));
}

async function compressPoseImageWithTimeout(
  file: File,
  timeoutMs: number,
  timeoutMessage: string
): Promise<File> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return generatePoseImage(file);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await generatePoseImage(file, { signal: controller.signal });
  } catch (error: any) {
    if (error?.name === 'AbortError') {
      throw new Error(timeoutMessage);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export default function PosesPage() {
  const [activeTab, setActiveTab] = useState<'poses' | 'tags'>('poses');

  // 摆姿管理状态
  const [poses, setPoses] = useState<Pose[]>([]);
  const [posesLoading, setPosesLoading] = useState(true);
  const [posesRefreshing, setPosesRefreshing] = useState(false);
  const [posesError, setPosesError] = useState('');
  const [posesReady, setPosesReady] = useState(false);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const posesPerPage = 10;
  const [poseVisibleCount, setPoseVisibleCount] = useState(posesPerPage);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedPoseIds, setSelectedPoseIds] = useState<number[]>([]);
  const [pendingSelectAllPoses, setPendingSelectAllPoses] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showPoseModal, setShowPoseModal] = useState(false);
  const [editingPose, setEditingPose] = useState<Pose | null>(null);
  const [poseFormData, setPoseFormData] = useState({ image: null as File | null, tags: [] as string[] });
  const [uploading, setUploading] = useState(false);
  useBeforeUnloadGuard(uploading);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [batchImages, setBatchImages] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadMode, setUploadMode] = useState<'single' | 'batch'>('single');

  // 标签管理状态
  const [tags, setTags] = useState<PoseTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsRefreshing, setTagsRefreshing] = useState(false);
  const [tagsError, setTagsError] = useState('');
  const [tagsReady, setTagsReady] = useState(false);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isTagSelectionMode, setIsTagSelectionMode] = useState(false);
  const [editingTag, setEditingTag] = useState<PoseTag | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [tagSortingId, setTagSortingId] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deletingPose, setDeletingPose] = useState<Pose | null>(null);
  const [deletingTag, setDeletingTag] = useState<PoseTag | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchDeleteTagsConfirm, setShowBatchDeleteTagsConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [brokenPoseImageIds, setBrokenPoseImageIds] = useState<number[]>([]);
  const posesLoadTokenRef = useRef(0);
  const tagsLoadTokenRef = useRef(0);

  useEffect(() => {
    void loadPoses();

    return () => {
      posesLoadTokenRef.current += 1;
    };
  }, [selectedTags, poseVisibleCount]);

  useEffect(() => {
    void loadTags();

    return () => {
      tagsLoadTokenRef.current += 1;
    };
  }, []);

  const poseHasMoreVisible = poses.length < totalCount;

  const handleAutoLoadPoses = useCallback(() => {
    setPoseVisibleCount((prev) => prev + posesPerPage);
  }, []);

  useAutoLoadMore({
    enabled: poseHasMoreVisible,
    isLoading: posesLoading || posesRefreshing,
    onLoadMore: handleAutoLoadPoses,
  });

  useEffect(() => {
    if (!pendingSelectAllPoses || posesLoading || posesRefreshing || poses.length < totalCount) {
      return;
    }

    setSelectedPoseIds(
      poses
        .map((pose) => Number(pose.id))
        .filter((id) => Number.isFinite(id) && id > 0)
    );
    setPendingSelectAllPoses(false);
  }, [pendingSelectAllPoses, poses, posesLoading, posesRefreshing, totalCount]);

  // 摆姿管理函数
  const loadPoses = async (): Promise<RefreshLoadResult> => {
    const loadToken = posesLoadTokenRef.current + 1;
    posesLoadTokenRef.current = loadToken;
    const hasReadyPoses = posesReady;
    const isFirstLoad = !hasReadyPoses;

    setPosesLoading(isFirstLoad);
    setPosesRefreshing(!isFirstLoad);
    setPosesError('');

    const dbClient = createClient();
    if (!dbClient) {
      if (loadToken === posesLoadTokenRef.current) {
        setPosesLoading(false);
        setPosesRefreshing(false);
        setPosesError('服务初始化失败，请刷新后重试');
        setPosesReady(hasReadyPoses);
        if (!hasReadyPoses) {
          setPoses([]);
          setTotalCount(0);
        }
      }
      return 'failed';
    }

    try {
      let query = dbClient
        .from('poses')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(0, Math.max(0, poseVisibleCount - 1));

      if (selectedTags.length > 0) {
        query = query.overlaps('tags', selectedTags);
      }

      const { data, error, count } = await query;

      if (loadToken !== posesLoadTokenRef.current) {
        return 'stale';
      }

      if (error) {
        throw error;
      }

      const nextPoses = Array.isArray(data) ? data : [];
      const nextTotalCount = count || 0;

      setPoses(nextPoses);
      setTotalCount(nextTotalCount);
      setBrokenPoseImageIds((prev) => prev.filter((id) => nextPoses.some((pose) => pose.id === id)));
      setPosesLoading(false);
      setPosesRefreshing(false);
      setPosesError('');
      setPosesReady(true);
      return 'success';
    } catch (error) {
      if (loadToken === posesLoadTokenRef.current) {
        setPosesLoading(false);
        setPosesRefreshing(false);
        setPosesError(`加载摆姿失败：${formatErrorMessage(error)}`);
        setPosesReady(hasReadyPoses);
        if (!hasReadyPoses) {
          setPoses([]);
          setTotalCount(0);
        }
      }
      return 'failed';
    }
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

  const handleAddPose = async () => {
    if (!poseFormData.image && batchImages.length === 0) {
      setShowToast({ message: '请选择图片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (poseFormData.tags.length > 3) {
      setShowToast({ message: '每张摆姿最多只能绑定 3 个标签', type: 'warning' });
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

    try {
      // 批量上传模式
      if (batchImages.length > 0) {
        setUploadProgress({ current: 0, total: batchImages.length });
        let successCount = 0;
        const failedFileNames: string[] = [];

        for (let i = 0; i < batchImages.length; i++) {
          const file = batchImages[i];
          const fileLabel = file.name || `第 ${i + 1} 张图片`;
          const compressTimeoutMs = getCompressTimeoutMs(file);
          setUploadProgress({ current: i + 1, total: batchImages.length });

          let fileForUpload = file;
          try {
            fileForUpload = await compressPoseImageWithTimeout(
              file,
              compressTimeoutMs,
              `第 ${i + 1} 张图片压缩超时`
            );
          } catch (compressError) {
            // 压缩失败时回退到原图继续上传，避免整批卡住。
            console.warn(`第 ${i + 1} 张图片压缩失败，回退原图继续上传:`, compressError);
            fileForUpload = file;
          }

          // 客户端上传图片到 CloudBase 云存储（poses 目录）
          const fileExt = resolveImageExtension(fileForUpload);
          const fileName = `${Date.now()}_${i}.${fileExt}`;
          const storagePath = `poses/${fileName}`;

          try {
            const uploadTimeoutMs = getUploadTimeoutMs(fileForUpload);
            const publicUrl = await uploadToCloudBaseDirect(fileForUpload, fileName, 'poses', {
              timeoutMs: uploadTimeoutMs,
            });

            // 插入数据库
            const { error: insertError } = await withTimeout(
              dbClient
                .from('poses')
                .insert({
                  image_url: publicUrl,
                  storage_path: storagePath,
                  tags: poseFormData.tags,
                }),
              IMAGE_INSERT_TIMEOUT_MS,
              `第 ${i + 1} 张图片写入数据库超时`
            );

            if (insertError) {
              console.error(`保存第 ${i + 1} 张图片记录失败:`, insertError);
              await cleanupUploadedFiles([storagePath]);
              failedFileNames.push(fileLabel);
            } else {
              successCount++;
            }
          } catch (uploadError) {
            console.error(`上传第 ${i + 1} 张图片失败（${fileLabel}）:`, uploadError);
            failedFileNames.push(fileLabel);
            continue; // 继续上传其他图片
          }
        }

        if (failedFileNames.length === 0) {
          setShowToast({ message: `批量上传完成！成功上传 ${successCount} 张图片`, type: 'success' });
        } else {
          const sampleFiles = failedFileNames.slice(0, 2).join('、');
          const sampleSuffix = sampleFiles ? `（例如：${sampleFiles}）` : '';
          if (successCount > 0) {
            setShowToast({
              message: `批量上传完成：成功 ${successCount} 张，失败 ${failedFileNames.length} 张${sampleSuffix}`,
              type: 'warning',
            });
          } else {
            setShowToast({
              message: `批量上传失败：${failedFileNames.length} 张都未上传成功${sampleSuffix}`,
              type: 'error',
            });
          }
        }
        setTimeout(() => setShowToast(null), 3000);
      } else {
        // 单张上传模式
        const sourceFile = poseFormData.image!;
        let fileForUpload = sourceFile;
        try {
          const compressTimeoutMs = getCompressTimeoutMs(sourceFile);
          fileForUpload = await compressPoseImageWithTimeout(
            sourceFile,
            compressTimeoutMs,
            '图片压缩超时'
          );
        } catch (compressError) {
          console.warn('单图压缩失败，回退原图继续上传:', compressError);
          fileForUpload = sourceFile;
        }

        const fileExt = resolveImageExtension(fileForUpload);
        const fileName = `${Date.now()}.${fileExt}`;
        const storagePath = `poses/${fileName}`;
        const uploadTimeoutMs = getUploadTimeoutMs(fileForUpload);

        const publicUrl = await uploadToCloudBaseDirect(fileForUpload, fileName, 'poses', {
          timeoutMs: uploadTimeoutMs,
        });

        const { error: insertError } = await withTimeout(
          dbClient
            .from('poses')
            .insert({
              image_url: publicUrl,
              storage_path: storagePath,
              tags: poseFormData.tags,
            }),
          IMAGE_INSERT_TIMEOUT_MS,
          '保存摆姿记录超时'
        );

        if (insertError) {
          await cleanupUploadedFiles([storagePath]);
          throw insertError;
        }
      }

      setShowPoseModal(false);
      setPoseFormData({ image: null, tags: [] });
      setBatchImages([]);
      setImagePreview(null);
      setUploadProgress({ current: 0, total: 0 });
      void refreshPoseAdminData({ silent: true });
    } catch (error: any) {
      setShowToast({ message: `添加失败：${formatErrorMessage(error)}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleEditPose = async () => {
    if (!editingPose) return;
    if (poseFormData.tags.length > 3) {
      setShowToast({ message: '每张摆姿最多只能绑定 3 个标签', type: 'warning' });
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

    try {
      const { data: updatedPose, error } = await dbClient
        .from('poses')
        .update({ tags: poseFormData.tags })
        .eq('id', editingPose.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!updatedPose) {
        throw new Error('摆姿不存在或已删除，请刷新后重试');
      }

      setShowPoseModal(false);
      setEditingPose(null);
      setPoseFormData({ image: null, tags: [] });
      void refreshPoseAdminData({ silent: true });
      setShowToast({ message: '摆姿标签已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setShowToast({ message: `更新失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setUploading(false);
    }
  };

  const handleDeletePose = async (id: number, storagePath: string) => {
    const pose = poses.find(p => p.id === id);
    if (pose) {
      setDeletingPose(pose);
    }
  };

  const confirmDeletePose = async () => {
    if (!deletingPose) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingPose(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: targetPose, error: snapshotError } = await dbClient
        .from('poses')
        .select('id, storage_path, image_url')
        .eq('id', deletingPose.id)
        .maybeSingle();
      if (snapshotError) {
        throw snapshotError;
      }
      if (!targetPose) {
        setActionLoading(false);
        setDeletingPose(null);
        setShowToast({ message: '摆姿不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error: dbError } = await dbClient
        .from('poses')
        .delete()
        .eq('id', targetPose.id);
      if (dbError) {
        throw dbError;
      }

      const { data: remainingPose, error: verifyError } = await dbClient
        .from('poses')
        .select('id')
        .eq('id', targetPose.id)
        .maybeSingle();
      if (verifyError) {
        throw verifyError;
      }
      if (remainingPose) {
        throw new Error('数据库记录删除失败，请稍后重试');
      }

      const storagePath = String(targetPose.storage_path ?? '').trim();
      const imageUrl = String(targetPose.image_url ?? '').trim();

      let storageCleanupFailed = false;
      if (storagePath || imageUrl) {
        try {
          const response = await fetch('/api/batch-delete', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              keys: storagePath ? [storagePath] : [],
              urls: imageUrl ? [imageUrl] : [],
            }),
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
      setDeletingPose(null);
      void refreshPoseAdminData({ silent: true });
      if (storageCleanupFailed) {
        setShowToast({ message: '摆姿记录已删除，但云存储清理失败，请稍后重试', type: 'warning' });
      } else {
        setShowToast({ message: '摆姿已删除', type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setDeletingPose(null);
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPoseIds.length === 0) {
      setShowToast({ message: '请先选择要删除的摆姿', type: 'warning' });
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
        .from('poses')
        .select('id, storage_path, image_url')
        .in('id', selectedPoseIds);
      if (snapshotError) {
        throw snapshotError;
      }

      const rows = Array.isArray(selectedRows) ? selectedRows : [];
      const missingCount = Math.max(0, selectedPoseIds.length - rows.length);
      if (rows.length === 0) {
        setActionLoading(false);
        setShowToast({ message: '未找到可删除摆姿，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error: dbError } = await dbClient
        .from('poses')
        .delete()
        .in('id', rows.map((row: any) => Number(row.id)));
      if (dbError) {
        throw dbError;
      }

      const targetIds = rows.map((row: any) => Number(row.id));
      const { data: remainingRows, error: verifyError } = await dbClient
        .from('poses')
        .select('id')
        .in('id', targetIds);
      if (verifyError) {
        throw verifyError;
      }

      const remainingIdSet = new Set((remainingRows || []).map((row: any) => Number(row.id)));
      const deletedRows = rows.filter((row: any) => !remainingIdSet.has(Number(row.id)));
      if (deletedRows.length === 0) {
        throw new Error('摆姿删除失败，请刷新后重试');
      }

      const storagePaths = deletedRows
        .map((row: any) => String(row.storage_path ?? '').trim())
        .filter(Boolean);
      const imageUrls = deletedRows
        .map((row: any) => String(row.image_url ?? '').trim())
        .filter(Boolean);

      let storageCleanupFailed = false;
      if (storagePaths.length > 0 || imageUrls.length > 0) {
        try {
          const response = await fetch('/api/batch-delete', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keys: storagePaths, urls: imageUrls }),
          });

          if (!response.ok) {
            storageCleanupFailed = true;
          }
        } catch (error) {
          console.error('批量删除云存储文件失败:', error);
          storageCleanupFailed = true;
        }
      }

      setActionLoading(false);
      setSelectedPoseIds([]);
      setIsSelectionMode(false);
      void refreshPoseAdminData({ silent: true });

      const warningParts: string[] = [];
      if (remainingIdSet.size > 0) {
        warningParts.push(`有 ${remainingIdSet.size} 个摆姿删除失败`);
      }
      if (missingCount > 0) {
        warningParts.push(`${missingCount} 个摆姿已不存在`);
      }
      if (storageCleanupFailed) {
        warningParts.push('云存储清理失败');
      }

      if (warningParts.length > 0) {
        setShowToast({
          message: `成功删除 ${deletedRows.length} 个摆姿，${warningParts.join('，')}`,
          type: 'warning',
        });
      } else {
        setShowToast({ message: `成功删除 ${deletedRows.length} 个摆姿`, type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `批量删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const togglePoseSelection = (id: number) => {
    setSelectedPoseIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllPoses = () => {
    const poseAllSelected = totalCount > 0 && selectedPoseIds.length === totalCount;
    if (poseAllSelected) {
      setPendingSelectAllPoses(false);
      setSelectedPoseIds([]);
      return;
    }

    setPendingSelectAllPoses(true);
    setPoseVisibleCount(Math.max(totalCount, posesPerPage));
  };

  const clearPoseSelection = () => {
    setPendingSelectAllPoses(false);
    setSelectedPoseIds([]);
    setIsSelectionMode(false);
  };

  const openEditModal = (pose: Pose) => {
    setEditingPose(pose);
    setPoseFormData({ image: null, tags: pose.tags });
    setShowPoseModal(true);
  };

  const openAddModal = () => {
    setEditingPose(null);
    setPoseFormData({ image: null, tags: [] });
    setImagePreview(null);
    setBatchImages([]);
    setUploadMode('single');
    setShowPoseModal(true);
  };

  const handleImageSelect = (file: File | null) => {
    setPoseFormData({ ...poseFormData, image: file });

    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleBatchImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setBatchImages([]);
      return;
    }

    const fileArray = Array.from(files);
    setBatchImages(fileArray);
  };

  const togglePoseTag = (tagName: string) => {
    setPoseFormData(prev => ({
      ...prev,
      tags: prev.tags.includes(tagName)
        ? prev.tags.filter(t => t !== tagName)
        : (() => {
          if (prev.tags.length >= 3) {
            setShowToast({ message: '最多只能选择 3 个标签', type: 'warning' });
            setTimeout(() => setShowToast(null), 3000);
            return prev.tags;
          }
          return [...prev.tags, tagName];
        })()
    }));
  };

  // 标签管理函数
  const loadTags = async (): Promise<RefreshLoadResult> => {
    const loadToken = tagsLoadTokenRef.current + 1;
    tagsLoadTokenRef.current = loadToken;
    const hasReadyTags = tagsReady;
    const isFirstLoad = !hasReadyTags;

    setTagsLoading(isFirstLoad);
    setTagsRefreshing(!isFirstLoad);
    setTagsError('');

    const dbClient = createClient();
    if (!dbClient) {
      if (loadToken === tagsLoadTokenRef.current) {
        setTagsLoading(false);
        setTagsRefreshing(false);
        setTagsError('服务初始化失败，请刷新后重试');
        setTagsReady(hasReadyTags);
        if (!hasReadyTags) {
          setTags([]);
          setSelectedTagIds([]);
        }
      }
      return 'failed';
    }

    try {
      const data = await fetchOrderedPoseTags(dbClient);

      if (loadToken !== tagsLoadTokenRef.current) {
        return 'stale';
      }

      const nextTags = Array.isArray(data) ? data : [];
      const tagIdSet = new Set(nextTags.map((tag) => Number(tag.id)).filter((id) => Number.isFinite(id)));
      const tagNameSet = new Set(nextTags.map((tag) => normalizeTagName(tag.name)).filter(Boolean));

      setTags(nextTags);
      setSelectedTagIds((prev) => prev.filter((id) => tagIdSet.has(id)));
      setSelectedTags((prev) => prev.filter((name) => tagNameSet.has(normalizeTagName(name))));
      setTagsLoading(false);
      setTagsRefreshing(false);
      setTagsError('');
      setTagsReady(true);
      return 'success';
    } catch (error) {
      if (loadToken === tagsLoadTokenRef.current) {
        setTagsLoading(false);
        setTagsRefreshing(false);
        setTagsError(`加载标签失败：${formatErrorMessage(error)}`);
        setTagsReady(hasReadyTags);
        if (!hasReadyTags) {
          setTags([]);
          setSelectedTagIds([]);
        }
      }
      return 'failed';
    }
  };

  const refreshPoseAdminData = async (options: { silent?: boolean; scope?: RefreshScope } = {}) => {
    const scope = options.scope ?? (options.silent ? 'all' : activeTab === 'tags' ? 'tags' : 'all');
    const loadTasks =
      scope === 'poses'
        ? [loadPoses()]
        : scope === 'tags'
          ? [loadTags()]
          : [loadPoses(), loadTags()];

    const loadResults = await Promise.all(loadTasks);
    const failedCount = loadResults.filter((result) => result === 'failed').length;
    const successCount = loadResults.filter((result) => result === 'success').length;

    if (options.silent) {
      return failedCount === 0;
    }

    if (failedCount === 0 && successCount === 0) {
      return true;
    }

    const successMessage =
      scope === 'tags'
        ? '标签已刷新'
        : scope === 'poses'
          ? '摆姿列表已刷新'
          : '摆姿管理已刷新';
    const partialMessage =
      scope === 'tags'
        ? '标签刷新失败，请稍后重试'
        : scope === 'poses'
          ? '摆姿列表已更新，但列表刷新失败'
          : '摆姿管理已更新，但部分列表刷新失败';
    const failedMessage =
      scope === 'tags'
        ? '标签刷新失败，请稍后重试'
        : scope === 'poses'
          ? '摆姿列表刷新失败，请稍后重试'
          : '摆姿管理刷新失败，请稍后重试';

    if (failedCount === 0 && successCount > 0) {
      setShowToast({ message: successMessage, type: 'success' });
    } else if (successCount > 0) {
      setShowToast({ message: partialMessage, type: 'warning' });
    } else {
      setShowToast({ message: failedMessage, type: 'error' });
    }
    setTimeout(() => setShowToast(null), 3000);
    return failedCount === 0;
  };

  const handleAddTag = async () => {
    if (!newTagName.trim()) {
      setShowToast({ message: '请输入标签名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setAddingTag(true);
    const dbClient = createClient();
    if (!dbClient) {
      setAddingTag(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const uniqueTagNames = parseUniqueTagNames(newTagName);
      if (uniqueTagNames.length === 0) {
        setShowToast({ message: '请输入有效的标签名称', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { data: existingRows, error: existingError } = await dbClient
        .from('pose_tags')
        .select('name')
        .in('name', uniqueTagNames);
      if (existingError) throw existingError;

      const existingNameSet = new Set(
        (existingRows || []).map((row: any) => normalizeTagName(String(row.name ?? '')).toLocaleLowerCase())
      );
      const namesToInsert = uniqueTagNames.filter((name) => !existingNameSet.has(name.toLocaleLowerCase()));

      let insertedCount = 0;
      let skippedByInsertCount = 0;
      if (namesToInsert.length > 0) {
        const { error } = await dbClient
          .from('pose_tags')
          .insert(namesToInsert.map((name) => ({ name })));

        if (!error) {
          insertedCount = namesToInsert.length;
        } else if (isDuplicateEntryError(error)) {
          for (const name of namesToInsert) {
            const { error: singleInsertError } = await dbClient
              .from('pose_tags')
              .insert({ name });

            if (!singleInsertError) {
              insertedCount += 1;
              continue;
            }

            if (isDuplicateEntryError(singleInsertError)) {
              skippedByInsertCount += 1;
              continue;
            }

            throw singleInsertError;
          }
        } else {
          throw error;
        }
      }

      const skippedCount = uniqueTagNames.length - namesToInsert.length + skippedByInsertCount;

      setShowTagModal(false);
      setNewTagName('');
      loadTags();
      if (insertedCount === 0) {
        setShowToast({ message: '标签已存在，未新增', type: 'warning' });
      } else if (skippedCount > 0) {
        setShowToast({ message: `成功添加 ${insertedCount} 个标签，跳过 ${skippedCount} 个已存在标签`, type: 'success' });
      } else {
        setShowToast({ message: `成功添加 ${insertedCount} 个标签！`, type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setShowToast({ message: `添加失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setAddingTag(false);
    }
  };

  const handleDeleteTag = async (id: number, name: string) => {
    const tag = tags.find(t => t.id === id);
    if (tag) {
      setDeletingTag(tag);
    }
  };

  const handleEditTag = (tag: PoseTag) => {
    setEditingTag(tag);
    setEditingTagName(tag.name);
  };

  const handleUpdateTag = async () => {
    if (!editingTag || !editingTagName.trim()) {
      setShowToast({ message: '请输入标签名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const normalizedTagName = normalizeTagName(editingTagName);
    if (!normalizedTagName) {
      setShowToast({ message: '请输入标签名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const previousTagName = normalizeTagName(editingTag.name);
    if (normalizedTagName === previousTagName) {
      setEditingTag(null);
      setEditingTagName('');
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

    try {
      const { data: existingTag, error: checkError } = await dbClient
        .from('pose_tags')
        .select('id')
        .eq('name', normalizedTagName)
        .neq('id', editingTag.id)
        .maybeSingle();
      if (checkError) throw checkError;
      if (existingTag) {
        setShowToast({ message: '标签名称已存在，请使用其他名称', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { data: updatedTag, error } = await dbClient
        .from('pose_tags')
        .update({ name: normalizedTagName })
        .eq('id', editingTag.id)
        .select('id')
        .maybeSingle();

      if (error) {
        if (isDuplicateEntryError(error)) {
          setShowToast({ message: '标签名称已存在，请使用其他名称', type: 'warning' });
          setTimeout(() => setShowToast(null), 3000);
          return;
        }
        throw error;
      }
      if (!updatedTag) {
        throw new Error('标签不存在或已删除，请刷新后重试');
      }

      setEditingTag(null);
      setEditingTagName('');
      setSelectedTags((prev) =>
        dedupeTagNames(prev.map((name) => (normalizeTagName(name) === previousTagName ? normalizedTagName : name)))
      );
      loadTags();
      setShowToast({ message: '标签已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setShowToast({ message: `更新失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setActionLoading(false);
    }
  };

  const moveTagByDirection = async (tagId: number, direction: 'top' | 'up' | 'down') => {
    if (isTagSelectionMode || actionLoading || tagSortingId !== 0) {
      return;
    }

    const currentIndex = tags.findIndex((tag) => tag.id === tagId);
    if (currentIndex < 0) {
      setShowToast({ message: '标签不存在或已删除，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const targetIndex =
      direction === 'top'
        ? 0
        : direction === 'up'
          ? currentIndex - 1
          : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= tags.length || targetIndex === currentIndex) {
      setShowToast({
        message: direction === 'down' ? '当前标签已在最底部' : '当前标签已在最顶部',
        type: 'warning',
      });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setTagSortingId(tagId);
    try {
      const orderedTags = await fetchOrderedPoseTags(dbClient);
      const orderedIndex = orderedTags.findIndex((item) => Number(item.id) === tagId);
      if (orderedIndex < 0) {
        throw new Error('标签不存在或已删除，请刷新后重试');
      }

      const nextIndex =
        direction === 'top'
          ? 0
          : direction === 'up'
            ? orderedIndex - 1
            : orderedIndex + 1;

      if (nextIndex < 0 || nextIndex >= orderedTags.length || nextIndex === orderedIndex) {
        setShowToast({
          message: direction === 'down' ? '当前标签已在最底部' : '当前标签已在最顶部',
          type: 'warning',
        });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const reordered = orderedTags.slice();
      const [currentTag] = reordered.splice(orderedIndex, 1);
      reordered.splice(nextIndex, 0, currentTag);

      const currentOrderMap = new Map<number, number>();
      orderedTags.forEach((item, index) => {
        const sortOrder = Number(item.sort_order);
        currentOrderMap.set(
          Number(item.id),
          Number.isFinite(sortOrder) && sortOrder > 0 ? Math.round(sortOrder) : (index + 1) * 10
        );
      });

      const changedRows = reordered
        .map((item, index) => ({
          id: Number(item.id),
          sort_order: (index + 1) * 10,
        }))
        .filter((item) => currentOrderMap.get(item.id) !== item.sort_order);

      for (const row of changedRows) {
        const { error } = await dbClient
          .from('pose_tags')
          .update({ sort_order: row.sort_order })
          .eq('id', row.id);

        if (error) {
          if (isSortOrderColumnMissing(error)) {
            throw new Error('数据库缺少 sort_order 字段，请先执行迁移：photo/sql/migrations/04_pose_tag_sort_order.sql');
          }
          throw error;
        }
      }

      await loadTags();
      setShowToast({
        message: direction === 'top' ? '标签已置顶' : direction === 'up' ? '标签已上移' : '标签已下移',
        type: 'success',
      });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error) {
      setShowToast({ message: `标签排序失败：${formatErrorMessage(error)}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setTagSortingId(0);
    }
  };

  const confirmDeleteTag = async () => {
    if (!deletingTag) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingTag(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: deletedTag, error } = await dbClient
        .from('pose_tags')
        .delete()
        .eq('id', deletingTag.id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!deletedTag) {
        setActionLoading(false);
        setDeletingTag(null);
        setShowToast({ message: '标签不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        loadTags();
        return;
      }

      setSelectedTags((prev) => prev.filter((name) => normalizeTagName(name) !== normalizeTagName(deletingTag.name)));
      setActionLoading(false);
      setDeletingTag(null);
      void refreshPoseAdminData({ silent: true });
      setShowToast({ message: '标签已删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setDeletingTag(null);
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleBatchDeleteTags = async () => {
    if (selectedTagIds.length === 0) {
      setShowToast({ message: '请先选择要删除的标签', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setShowBatchDeleteTagsConfirm(true);
  };

  const confirmBatchDeleteTags = async () => {
    setShowBatchDeleteTagsConfirm(false);
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
        .from('pose_tags')
        .select('id,name')
        .in('id', selectedTagIds);

      if (snapshotError) throw snapshotError;

      const rows = Array.isArray(selectedRows) ? selectedRows : [];
      const missingCount = Math.max(0, selectedTagIds.length - rows.length);
      if (rows.length === 0) {
        setActionLoading(false);
        setShowToast({ message: '未找到可删除标签，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        loadTags();
        return;
      }

      const targetIds = rows.map((row: any) => Number(row.id)).filter((id) => Number.isFinite(id));
      const deletedTagNameSet = new Set(
        rows.map((row: any) => normalizeTagName(String(row?.name ?? ''))).filter(Boolean)
      );
      const { error } = await dbClient
        .from('pose_tags')
        .delete()
        .in('id', targetIds);

      if (error) throw error;

      const { data: remainingRows, error: verifyError } = await dbClient
        .from('pose_tags')
        .select('id')
        .in('id', targetIds);

      if (verifyError) throw verifyError;

      const remainingIdSet = new Set((remainingRows || []).map((row: any) => Number(row.id)));
      const deletedCount = targetIds.filter((id) => !remainingIdSet.has(id)).length;
      if (deletedCount === 0) {
        throw new Error('批量删除失败，请稍后重试');
      }

      setActionLoading(false);
      setSelectedTagIds([]);
      setIsTagSelectionMode(false);
      setSelectedTags((prev) => prev.filter((name) => !deletedTagNameSet.has(normalizeTagName(name))));
      void refreshPoseAdminData({ silent: true });

      if (remainingIdSet.size > 0) {
        setShowToast({
          message: missingCount > 0
            ? `成功删除 ${deletedCount} 个标签，${remainingIdSet.size} 个删除失败，${missingCount} 个已不存在`
            : `成功删除 ${deletedCount} 个标签，${remainingIdSet.size} 个删除失败`,
          type: 'warning',
        });
      } else if (missingCount > 0) {
        setShowToast({ message: `成功删除 ${deletedCount} 个标签（${missingCount} 个已不存在）`, type: 'success' });
      } else {
        setShowToast({ message: `成功删除 ${deletedCount} 个标签`, type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `批量删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const toggleTagSelection = (id: number) => {
    setSelectedTagIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllTags = () => {
    if (selectedTagIds.length === tags.length) {
      setSelectedTagIds([]);
    } else {
      setSelectedTagIds(tags.map(t => t.id));
    }
  };

  const clearTagSelection = () => {
    setSelectedTagIds([]);
    setIsTagSelectionMode(false);
  };

  const toggleTagFilter = (tagName: string) => {
    setPendingSelectAllPoses(false);
    setPoseVisibleCount(posesPerPage);
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const orderedTagCards = tags.map((tag, index) => ({
    ...tag,
    sortIndex: index + 1,
    canMoveTop: index > 0,
    canMoveUp: index > 0,
    canMoveDown: index < tags.length - 1,
  }));
  const tagOrderButtonClass =
    'flex h-10 items-center justify-center rounded-[16px] px-2 text-[12px] font-semibold tracking-[0.02em] text-[#D18A2A] transition-all hover:bg-white/80 hover:text-[#B56B1B] disabled:cursor-not-allowed disabled:text-[#D6BF9B] disabled:hover:bg-transparent';
  return (
    <div className="admin-mobile-page pose-page space-y-6 pt-6">
      {/* 页面标题 */}
      <div className="pose-header">
        <h1 className="pose-header__title text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          摆姿管理 📸
        </h1>
        <p className="pose-header__desc text-sm text-[#5D4037]/60">管理拍照姿势库和标签</p>
      </div>

      {/* Tab切换 */}
      <div className="pose-tabs flex gap-2 border-b border-[#5D4037]/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('poses')}
          className={`pose-tab-item px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'poses'
              ? 'pose-tab-item--active text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          摆姿列表
          {activeTab === 'poses' && (
            <motion.div
              layoutId="activeTab"
              className="pose-tab-item__line absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('tags')}
          className={`pose-tab-item px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'tags'
              ? 'pose-tab-item--active text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          标签管理
          {activeTab === 'tags' && (
            <motion.div
              layoutId="activeTab"
              className="pose-tab-item__line absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
      </div>

      {/* 摆姿列表内容 */}
      {activeTab === 'poses' && (
        <div className="space-y-6">
          {/* 操作栏 */}
          <div className="pose-toolbar flex items-center justify-between gap-4">
            {/* 标签筛选 */}
            <div className="pose-filter-scroll flex-1 flex items-center gap-2 overflow-x-auto pb-2">
              <Tag className="pose-filter-row__icon w-4 h-4 text-[#5D4037]/60 flex-shrink-0" />
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() => toggleTagFilter(tag.name)}
                  className={`px-2.5 py-1 rounded-full text-xs whitespace-nowrap transition-all flex-shrink-0 ${
                    selectedTags.includes(tag.name)
                      ? 'bg-[#FFC857] text-[#5D4037] shadow-md'
                      : 'bg-white text-[#5D4037]/60 border border-[#5D4037]/10 hover:bg-[#5D4037]/5'
                  }`}
                >
                  {tag.name} ({tag.usage_count})
                </button>
              ))}
            </div>

            <div className={`pose-toolbar-actions ${!isSelectionMode ? 'pose-toolbar-actions--triplet' : ''} flex gap-2 flex-shrink-0`}>
              {!isSelectionMode ? (
                <>
                  <button
                    onClick={() => void refreshPoseAdminData()}
                    disabled={posesLoading || posesRefreshing || tagsLoading || tagsRefreshing}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                  >
                    {posesLoading || posesRefreshing || tagsLoading || tagsRefreshing ? '刷新中' : '刷新'}
                  </button>
                  <button
                    onClick={() => setIsSelectionMode(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                  >
                    批量删除
                  </button>
                  <button
                    onClick={openAddModal}
                    className="flex items-center gap-1.5 px-4 py-2 text-sm bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    新增摆姿
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={selectAllPoses}
                    className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                  >
                    {totalCount > 0 && selectedPoseIds.length === totalCount ? '取消全选' : `全选 (${selectedPoseIds.length}/${totalCount || poses.length})`}
                  </button>
                  <button
                    onClick={handleBatchDelete}
                    disabled={selectedPoseIds.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                  >
                    <Trash2 className="w-4 h-4" />
                    删除选中 ({selectedPoseIds.length})
                  </button>
                  <button
                    onClick={clearPoseSelection}
                    className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                  >
                    取消
                  </button>
                </>
              )}
            </div>
          </div>

          {/* 摆姿列表 */}
          {posesError && posesReady && (
            <div className="pose-inline-error">
              <p className="pose-inline-error__text">{posesError}</p>
            </div>
          )}

          {posesLoading && !posesReady ? (
            <AdminLoadingCard description="正在同步最新的摆姿图片与标签数据，请稍候。" variant="inline" />
          ) : !posesReady ? (
            <div className={`pose-state-card ${posesError ? 'pose-state-card--error' : 'pose-state-card--empty'}`}>
              <div className={`pose-state-card__badge ${posesError ? 'pose-state-card__badge--error' : 'pose-state-card__badge--empty'}`}>
                {posesError ? <AlertCircle className="pose-state-card__icon" /> : <Camera className="pose-state-card__icon" />}
              </div>
              <p className="pose-state-card__title">{posesError ? '摆姿数据暂时不可用' : '暂无摆姿数据'}</p>
              <p className="pose-state-card__desc">{posesError || '上传摆姿后会展示在这里。'}</p>
              <button
                onClick={() => void refreshPoseAdminData()}
                disabled={posesLoading || posesRefreshing}
                className="pose-state-card__action"
              >
                {posesLoading || posesRefreshing ? '刷新中' : '重新加载'}
              </button>
            </div>
          ) : poses.length === 0 ? (
            <div className={`pose-state-card ${selectedTags.length > 0 ? 'pose-state-card--search' : 'pose-state-card--empty'}`}>
              <div className={`pose-state-card__badge ${selectedTags.length > 0 ? 'pose-state-card__badge--search' : 'pose-state-card__badge--empty'}`}>
                {selectedTags.length > 0 ? <Search className="pose-state-card__icon" /> : <Camera className="pose-state-card__icon" />}
              </div>
              <p className="pose-state-card__title">{selectedTags.length > 0 ? '当前筛选下暂无摆姿' : '暂无摆姿数据'}</p>
              <p className="pose-state-card__desc">{selectedTags.length > 0 ? '可以切换标签筛选或手动刷新列表。' : '上传摆姿后会展示在这里。'}</p>
              {selectedTags.length > 0 ? (
                <button
                  onClick={() => setSelectedTags([])}
                  disabled={posesLoading || posesRefreshing}
                  className="pose-state-card__action"
                >
                  清空筛选
                </button>
              ) : null}
            </div>
          ) : (
            <div className="pose-grid grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              <AnimatePresence>
                {poses.map((pose) => (
                  <motion.div
                    key={pose.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition-all ${
                      isSelectionMode
                        ? selectedPoseIds.includes(pose.id)
                          ? 'border-[#FFC857] bg-[#FFC857]/5 shadow-md'
                          : 'border-[#5D4037]/10 hover:border-[#FFC857]/50'
                        : 'border-[#5D4037]/10 hover:shadow-md'
                    }`}
                    onClick={() => isSelectionMode && togglePoseSelection(pose.id)}
                    style={{ cursor: isSelectionMode ? 'pointer' : 'default' }}
                  >
                    <div className="aspect-[3/4] relative group">
                      {isSelectionMode && (
                        <div className={`absolute left-3 top-3 z-10 flex h-6 w-6 items-center justify-center rounded-[8px] border-2 shadow-sm transition-colors ${
                          selectedPoseIds.includes(pose.id)
                            ? 'border-[#FFC857] bg-[#FFC857]'
                            : 'border-[#5D4037]/30 bg-white/95'
                        }`}>
                          {selectedPoseIds.includes(pose.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      {brokenPoseImageIds.includes(pose.id) ? (
                        <div className="pose-image-fallback">
                          <AlertCircle className="pose-image-fallback__icon" />
                          <span>图片加载失败</span>
                        </div>
                      ) : (
                        <img
                          src={pose.image_url}
                          alt="pose-image"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={(e) => {
                            if (!isSelectionMode) {
                              e.stopPropagation();
                              setPreviewImage(pose.image_url);
                            }
                          }}
                          onError={() => {
                            setBrokenPoseImageIds((prev) => (prev.includes(pose.id) ? prev : [...prev, pose.id]));
                          }}
                        />
                      )}
                      {!isSelectionMode && (
                        <div className="absolute top-2 right-2 flex gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(pose);
                            }}
                            className="icon-button action-icon-btn action-icon-btn--edit"
                          >
                            <Pencil className="action-icon-svg action-icon-svg--edit" strokeWidth={2.2} />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePose(pose.id, pose.storage_path);
                            }}
                            className="icon-button action-icon-btn action-icon-btn--delete"
                          >
                            <Trash2 className="action-icon-svg action-icon-svg--delete" strokeWidth={2.2} />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-1 text-xs text-[#5D4037]/60 mb-2">
                        <Camera className="w-3 h-3" />
                        <span>浏览 {pose.view_count}</span>
                      </div>
                      {pose.tags && pose.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {pose.tags.map((tag, idx) => (
                            <span
                              key={idx}
                              className="px-2 py-1 bg-[#FFC857]/20 text-[#5D4037] text-xs rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {/* 分页 */}
          {!posesLoading && totalCount > 0 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="inline-flex min-h-8 items-center rounded-full bg-[#FFC857]/20 px-4 py-2 text-sm font-medium text-[#5D4037]">
                {poses.length < totalCount
                  ? `已加载 ${poses.length} / ${totalCount} 个，继续下滑自动加载`
                  : `已全部加载，共 ${totalCount} 个`}
              </span>
            </div>
          )}
        </div>
      )}

      {/* 标签管理内容 */}
      {activeTab === 'tags' && (
        <div className="space-y-6">
          {/* 操作按钮 */}
          <div className={`pose-toolbar-actions ${!isTagSelectionMode ? 'pose-toolbar-actions--triplet' : ''} flex justify-end gap-2`}>
            {!isTagSelectionMode ? (
              <>
                <button
                  onClick={() => void refreshPoseAdminData({ scope: 'tags' })}
                  disabled={tagsLoading || tagsRefreshing || tagSortingId !== 0}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                >
                  {tagsLoading || tagsRefreshing ? '刷新中' : '刷新'}
                </button>
                <button
                  onClick={() => setIsTagSelectionMode(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                >
                  批量删除
                </button>
                <button
                  onClick={() => setShowTagModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
                >
                  <Plus className="w-5 h-5" />
                  新增标签
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={selectAllTags}
                  className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                >
                  {selectedTagIds.length === tags.length ? '取消全选' : `全选 (${selectedTagIds.length}/${tags.length})`}
                </button>
                <button
                  onClick={handleBatchDeleteTags}
                  disabled={selectedTagIds.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  删除选中 ({selectedTagIds.length})
                </button>
                <button
                  onClick={clearTagSelection}
                  className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                >
                  取消
                </button>
              </>
            )}
          </div>

          {/* 标签列表 */}
          {tagsError && tagsReady && (
            <div className="pose-inline-error">
              <p className="pose-inline-error__text">{tagsError}</p>
            </div>
          )}

          {tagsLoading && !tagsReady ? (
            <AdminLoadingCard description="正在同步标签排序与使用情况，请稍候。" variant="compact" />
          ) : !tagsReady ? (
            <div className={`pose-state-card ${tagsError ? 'pose-state-card--error' : 'pose-state-card--empty'}`}>
              <div className={`pose-state-card__badge ${tagsError ? 'pose-state-card__badge--error' : 'pose-state-card__badge--empty'}`}>
                {tagsError ? <AlertCircle className="pose-state-card__icon" /> : <Tag className="pose-state-card__icon" />}
              </div>
              <p className="pose-state-card__title">{tagsError ? '标签数据暂时不可用' : '暂无标签数据'}</p>
              <p className="pose-state-card__desc">{tagsError || '创建标签后可用于摆姿筛选与管理。'}</p>
              <button
                onClick={() => void refreshPoseAdminData({ scope: 'tags' })}
                disabled={tagsLoading || tagsRefreshing || tagSortingId !== 0}
                className="pose-state-card__action"
              >
                {tagsLoading || tagsRefreshing ? '刷新中' : '重新加载'}
              </button>
            </div>
          ) : tags.length === 0 ? (
            <div className="pose-state-card pose-state-card--empty">
              <div className="pose-state-card__badge pose-state-card__badge--empty">
                <Tag className="pose-state-card__icon" />
              </div>
              <p className="pose-state-card__title">暂无标签数据</p>
              <p className="pose-state-card__desc">创建标签后可用于摆姿筛选与管理。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-4">
              <AnimatePresence>
                {orderedTagCards.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  const isSortingCurrentTag = tagSortingId === tag.id;

                  return (
                    <motion.div
                      key={tag.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className={`relative min-w-0 w-full overflow-hidden rounded-[26px] border bg-[linear-gradient(180deg,#FFFFFF_0%,#FFFDF7_100%)] px-3.5 py-3.5 shadow-[0_10px_24px_rgba(93,64,55,0.07)] transition-all sm:px-4 sm:py-4 ${
                        isTagSelectionMode
                          ? isSelected
                            ? 'border-[#FFC857] bg-[#FFF8E6] shadow-[0_12px_30px_rgba(255,200,87,0.16)]'
                            : 'border-[#5D4037]/10 hover:border-[#FFC857]/50'
                          : 'border-[#5D4037]/10 hover:-translate-y-[1px] hover:shadow-[0_14px_34px_rgba(93,64,55,0.12)]'
                      } ${isSortingCurrentTag ? 'ring-2 ring-[#FFC857]/50' : ''}`}
                      onClick={() => isTagSelectionMode && toggleTagSelection(tag.id)}
                      style={{ cursor: isTagSelectionMode ? 'pointer' : 'default' }}
                    >
                      <div className="flex flex-col gap-3">
                        {isTagSelectionMode && (
                          <div className={`absolute left-3 top-1/2 z-10 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors ${
                            isSelected
                              ? 'border-[#FFC857] bg-[#FFC857] text-white shadow-sm'
                              : 'border-[#5D4037]/20 bg-white text-transparent'
                          }`}>
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}

                        <div className={`flex items-start justify-between gap-2.5 ${isTagSelectionMode ? 'pl-7' : ''}`}>
                          <div className="flex min-w-0 flex-1 items-start gap-2.5">
                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#FFBE55] to-[#FFA63D] shadow-[0_7px_18px_rgba(255,184,85,0.24)] sm:h-12 sm:w-12">
                              <Tag className="h-[18px] w-[18px] text-white sm:h-5 sm:w-5" />
                            </div>
                            <div className="min-w-0 flex-1 pt-0.5">
                              <div className="flex flex-col gap-1">
                                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
                                  <h3 className="max-w-full break-all text-[20px] font-bold leading-[1.05] text-[#5D4037] sm:text-[22px]">
                                    {tag.name}
                                  </h3>
                                  <span className="inline-flex items-center rounded-full bg-[#FFF1C7] px-1.5 py-0.5 text-[10px] font-bold leading-none text-[#A46A1D]">
                                    #{tag.sortIndex}
                                  </span>
                                </div>
                                <span className="text-[12px] leading-none text-[#8D6E63] sm:text-[13px]">
                                  使用 {tag.usage_count} 次
                                </span>
                              </div>
                            </div>
                          </div>

                          {!isTagSelectionMode && (
                            <div className="flex shrink-0 items-center gap-1.5 pt-0.5">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleEditTag(tag);
                                }}
                                disabled={actionLoading || tagSortingId !== 0}
                                title="编辑标签"
                                className="icon-button action-icon-btn action-icon-btn--edit disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Pencil className="action-icon-svg action-icon-svg--edit" strokeWidth={2.2} />
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteTag(tag.id, tag.name);
                                }}
                                disabled={actionLoading || tagSortingId !== 0}
                                title="删除标签"
                                className="icon-button action-icon-btn action-icon-btn--delete disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Trash2 className="action-icon-svg action-icon-svg--delete" strokeWidth={2.2} />
                              </button>
                            </div>
                          )}
                        </div>

                        {!isTagSelectionMode && (
                          <div className="rounded-[22px] border border-[#F3D08A] bg-[linear-gradient(180deg,rgba(255,247,226,0.82)_0%,rgba(255,251,240,0.96)_100%)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]">
                            <div className="grid grid-cols-3 gap-1">
                              <button
                                type="button"
                                onClick={() => moveTagByDirection(tag.id, 'top')}
                                disabled={actionLoading || tagSortingId !== 0 || !tag.canMoveTop}
                                className={tagOrderButtonClass}
                              >
                                置顶
                              </button>
                              <button
                                type="button"
                                onClick={() => moveTagByDirection(tag.id, 'up')}
                                disabled={actionLoading || tagSortingId !== 0 || !tag.canMoveUp}
                                className={tagOrderButtonClass}
                              >
                                上移
                              </button>
                              <button
                                type="button"
                                onClick={() => moveTagByDirection(tag.id, 'down')}
                                disabled={actionLoading || tagSortingId !== 0 || !tag.canMoveDown}
                                className={tagOrderButtonClass}
                              >
                                下移
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* 添加/编辑摆姿弹窗 */}
      <AnimatePresence>
        {showPoseModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowPoseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <h2 className="min-w-0 flex-1 text-xl font-bold text-[#5D4037]">
                  {editingPose ? '编辑摆姿' : '新增摆姿'}
                </h2>
                <button
                  onClick={() => setShowPoseModal(false)}
                  type="button"
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭摆姿弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                {!editingPose && (
                  <div>
                    <label className="block text-sm font-medium text-[#5D4037] mb-2">
                      图片 <span className="text-red-500">*</span>
                    </label>

                    {/* 单张/批量切换 */}
                    <div className="flex gap-2 mb-3">
                      <button
                        onClick={() => {
                          setUploadMode('single');
                          setBatchImages([]);
                          setImagePreview(null);
                          setPoseFormData({ ...poseFormData, image: null });
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                          uploadMode === 'single'
                            ? 'bg-[#FFC857] text-[#5D4037] shadow-sm'
                            : 'bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5'
                        }`}
                      >
                        单张上传
                      </button>
                      <button
                        onClick={() => {
                          setUploadMode('batch');
                          setImagePreview(null);
                          setPoseFormData({ ...poseFormData, image: null });
                        }}
                        className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                          uploadMode === 'batch'
                            ? 'bg-[#FFC857] text-[#5D4037] shadow-sm'
                            : 'bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5'
                        }`}
                      >
                        批量上传
                      </button>
                    </div>

                    {uploadMode === 'single' ? (
                      /* 单张上传模式 */
                      imagePreview ? (
                        <div className="relative bg-gray-100 rounded-xl">
                          <img
                            src={imagePreview}
                            alt="预览"
                            className="w-full h-64 object-contain rounded-xl"
                          />
                          <button
                            onClick={() => handleImageSelect(null)}
                            className="icon-button absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleImageSelect(e.target.files?.[0] || null)}
                            className="hidden"
                            id="pose-image-upload"
                          />
                          <label htmlFor="pose-image-upload" className="cursor-pointer">
                            <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                            <p className="text-sm text-[#5D4037]/60">点击上传图片</p>
                          </label>
                        </div>
                      )
                    ) : (
                      /* 批量上传模式 */
                      <div className="space-y-3">
                        <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer">
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(e) => handleBatchImageSelect(e.target.files)}
                            className="hidden"
                            id="pose-batch-upload"
                          />
                          <label htmlFor="pose-batch-upload" className="cursor-pointer">
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
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    标签
                  </label>
                  <div className="flex flex-wrap gap-2 p-3 bg-[#FFFBF0] rounded-xl min-h-[60px]">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => togglePoseTag(tag.name)}
                        className={`px-3 py-1 rounded-full text-sm transition-all ${
                          poseFormData.tags.includes(tag.name)
                            ? 'bg-[#FFC857] text-[#5D4037] shadow-md'
                            : 'bg-white text-[#5D4037]/60 border border-[#5D4037]/10 hover:bg-[#5D4037]/5'
                        }`}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 上传进度显示 */}
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
                  onClick={editingPose ? handleEditPose : handleAddPose}
                  disabled={uploading || (!editingPose && !poseFormData.image && batchImages.length === 0)}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {uploading
                    ? uploadProgress.total > 0
                      ? `上传中 (${uploadProgress.current}/${uploadProgress.total})...`
                      : '处理中...'
                    : editingPose
                      ? '保存修改'
                      : batchImages.length > 0
                        ? `批量添加 (${batchImages.length} 张)`
                        : '确认添加'
                  }
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 添加标签弹窗 */}
      <AnimatePresence>
        {showTagModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowTagModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="relative bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="mb-6 flex items-start justify-between gap-3">
                <h2 className="min-w-0 flex-1 text-xl font-bold text-[#5D4037]">新增标签</h2>
                <button
                  onClick={() => setShowTagModal(false)}
                  type="button"
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭新增标签弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    标签名称 <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="输入标签名称，多个标签用逗号分隔&#10;例如：户外,室内,情侣,全身照,半身照"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none resize-none"
                  />
                  <p className="mt-2 text-xs text-[#5D4037]/60">
                    💡 提示：可以一次添加多个标签，用逗号（中文或英文）分隔
                  </p>
                </div>

                <button
                  onClick={handleAddTag}
                  disabled={addingTag || !newTagName.trim()}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {addingTag ? '添加中...' : '确认添加'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 编辑标签弹窗 */}
      <AnimatePresence>
        {editingTag && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => {
              setEditingTag(null);
              setEditingTagName('');
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
                <h2 className="min-w-0 flex-1 text-xl font-bold text-[#5D4037]">修改标签</h2>
                <button
                  onClick={() => {
                    setEditingTag(null);
                    setEditingTagName('');
                  }}
                  type="button"
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭编辑标签弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    标签名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={editingTagName}
                    onChange={(e) => setEditingTagName(e.target.value)}
                    placeholder="输入新的标签名称"
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                    autoFocus
                  />
                  <p className="mt-2 text-xs text-[#5D4037]/60">
                    💡 修改标签名称不会影响已绑定的图片
                  </p>
                </div>

                <button
                  onClick={handleUpdateTag}
                  disabled={actionLoading || !editingTagName.trim()}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {actionLoading ? '保存中...' : '保存修改'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 图片预览弹窗 */}
      <AnimatePresence>
        {previewImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
            onClick={() => setPreviewImage(null)}
          >
            <button
              onClick={() => setPreviewImage(null)}
              className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
            >
              <X className="action-icon-svg" />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewImage}
              alt="预览"
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除摆姿确认对话框 */}
      <AnimatePresence>
        {deletingPose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingPose(null)}
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
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除摆姿</h3>
                <p className="text-sm text-[#5D4037]/80">
                  确定要删除这个摆姿吗？此操作不可撤销。
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingPose(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeletePose}
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

      {/* 批量删除摆姿确认对话框 */}
      <AnimatePresence>
        {showBatchDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setShowBatchDeleteConfirm(false)}
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
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">批量删除摆姿</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除选中的 <span className="font-bold text-red-600">{selectedPoseIds.length}</span> 个摆姿吗？
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
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmBatchDelete}
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

      {/* 删除标签确认对话框 */}
      <AnimatePresence>
        {deletingTag && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingTag(null)}
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
                  <Tag className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除标签</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除标签 <span className="font-bold">"{deletingTag.name}"</span> 吗？
                </p>
                <div className="bg-orange-50 rounded-xl p-4 text-left">
                  <p className="text-sm text-orange-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    所有摆姿中的该标签也会被移除
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingTag(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteTag}
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

      {/* 批量删除标签确认对话框 */}
      <AnimatePresence>
        {showBatchDeleteTagsConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setShowBatchDeleteTagsConfirm(false)}
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
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">批量删除标签</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除选中的 <span className="font-bold text-red-600">{selectedTagIds.length}</span> 个标签吗？
                </p>
                <div className="bg-red-50 rounded-xl p-4 text-left">
                  <p className="text-sm text-red-800 mb-2">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    标签列表：
                  </p>
                  <p className="text-sm text-red-700">
                    {tags.filter(t => selectedTagIds.includes(t.id)).map(t => t.name).join('、')}
                  </p>
                  <p className="text-sm text-red-800 mt-2">
                    所有摆姿中的这些标签也会被移除
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchDeleteTagsConfirm(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmBatchDeleteTags}
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
    </div>
  );
}
