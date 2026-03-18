'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { Camera, Plus, Trash2, Tag, Search, Edit2, X, Upload, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generatePoseImage } from '@/lib/utils/image-versions';
import { uploadToCloudBaseDirect } from '@/lib/storage/cloudbase-upload-client';
import { useBeforeUnloadGuard } from '@/lib/hooks/useBeforeUnloadGuard';

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
  created_at: string;
}

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
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const posesPerPage = 10;
  const [selectedPoseIds, setSelectedPoseIds] = useState<number[]>([]);
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
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [addingTag, setAddingTag] = useState(false);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [isTagSelectionMode, setIsTagSelectionMode] = useState(false);
  const [editingTag, setEditingTag] = useState<PoseTag | null>(null);
  const [editingTagName, setEditingTagName] = useState('');
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deletingPose, setDeletingPose] = useState<Pose | null>(null);
  const [deletingTag, setDeletingTag] = useState<PoseTag | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [showBatchDeleteTagsConfirm, setShowBatchDeleteTagsConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadPoses();
    loadTags();
  }, [selectedTags, currentPage]);

  // 摆姿管理函数
  const loadPoses = async () => {
    setPosesLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setPosesLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    let query = dbClient
      .from('poses')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((currentPage - 1) * posesPerPage, currentPage * posesPerPage - 1);

    if (selectedTags.length > 0) {
      query = query.overlaps('tags', selectedTags);
    }

    const { data, error, count } = await query;

    if (!error && data) {
      setPoses(data);
      setTotalCount(count || 0);
    }
    setPosesLoading(false);
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
      loadPoses();
      loadTags();
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
      loadPoses();
      loadTags();
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
      loadPoses();
      loadTags();
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
      loadPoses();
      loadTags();

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
    if (selectedPoseIds.length === poses.length) {
      setSelectedPoseIds([]);
    } else {
      setSelectedPoseIds(poses.map(p => p.id));
    }
  };

  const clearPoseSelection = () => {
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
  const loadTags = async () => {
    setTagsLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setTagsLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await dbClient
      .from('pose_tags')
      .select('*')
      .order('usage_count', { ascending: false });

    if (!error && data) {
      setTags(data);
    }
    setTagsLoading(false);
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

    if (normalizedTagName === normalizeTagName(editingTag.name)) {
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

      setActionLoading(false);
      setDeletingTag(null);
      loadTags();
      loadPoses();
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
        .select('id')
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
      loadTags();
      loadPoses();

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
    setCurrentPage(1); // 重置到第一页
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          摆姿管理 📸
        </h1>
        <p className="text-sm text-[#5D4037]/60">管理拍照姿势库和标签</p>
      </div>

      {/* Tab切换 */}
      <div className="flex gap-2 border-b border-[#5D4037]/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('poses')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'poses'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          摆姿列表
          {activeTab === 'poses' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('tags')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'tags'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          标签管理
          {activeTab === 'tags' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
      </div>

      {/* 摆姿列表内容 */}
      {activeTab === 'poses' && (
        <div className="space-y-6">
          {/* 操作栏 */}
          <div className="flex items-center justify-between gap-4">
            {/* 标签筛选 */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto pb-2">
              <Tag className="w-4 h-4 text-[#5D4037]/60 flex-shrink-0" />
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

            <div className="flex gap-2 flex-shrink-0">
              {!isSelectionMode ? (
                <>
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
                    {selectedPoseIds.length === poses.length ? '取消全选' : `全选 (${selectedPoseIds.length}/${poses.length})`}
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
          {posesLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : poses.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <Camera className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
              <p className="text-[#5D4037]/60">暂无摆姿数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
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
                        <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10 ${
                          selectedPoseIds.includes(pose.id)
                            ? 'bg-[#FFC857] border-[#FFC857]'
                            : 'bg-white border-[#5D4037]/30'
                        }`}>
                          {selectedPoseIds.includes(pose.id) && (
                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </div>
                      )}
                      <img
                        src={pose.image_url}
                        alt="摆姿"
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={(e) => {
                          if (!isSelectionMode) {
                            e.stopPropagation();
                            setPreviewImage(pose.image_url);
                          }
                        }}
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          target.style.display = 'none';
                          const parent = target.parentElement;
                          if (parent) {
                            const errorDiv = document.createElement('div');
                            errorDiv.className = 'absolute inset-0 flex items-center justify-center bg-gray-100';
                            errorDiv.innerHTML = '<div class="text-center"><svg class="w-12 h-12 text-gray-400 mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg><p class="text-xs text-gray-500">图片加载失败</p></div>';
                            parent.appendChild(errorDiv);
                          }
                        }}
                      />
                      {!isSelectionMode && (
                        <div className="absolute top-2 right-2 flex gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(pose);
                            }}
                            className="w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors shadow-md"
                          >
                            <Edit2 size={28} strokeWidth={2.5} className="text-white" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeletePose(pose.id, pose.storage_path);
                            }}
                            className="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                          >
                            <Trash2 size={28} strokeWidth={2.5} className="text-white" />
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
          {!posesLoading && totalCount > posesPerPage && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1}
                className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
              >
                上一页
              </button>
              <span className="px-4 py-2 bg-[#FFC857]/20 rounded-full text-[#5D4037] font-medium">
                第 {currentPage} 页 / 共 {Math.ceil(totalCount / posesPerPage)} 页
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage >= Math.ceil(totalCount / posesPerPage)}
                className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
              >
                下一页
              </button>
            </div>
          )}
        </div>
      )}

      {/* 标签管理内容 */}
      {activeTab === 'tags' && (
        <div className="space-y-6">
          {/* 操作按钮 */}
          <div className="flex justify-end gap-2">
            {!isTagSelectionMode ? (
              <>
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
          {tagsLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : tags.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <Tag className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
              <p className="text-[#5D4037]/60">暂无标签数据</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-6">
              <AnimatePresence>
                {tags.map((tag) => (
                  <motion.div
                    key={tag.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className={`bg-white rounded-2xl p-6 shadow-sm border transition-all ${
                      isTagSelectionMode
                        ? selectedTagIds.includes(tag.id)
                          ? 'border-[#FFC857] bg-[#FFC857]/5 shadow-md'
                          : 'border-[#5D4037]/10 hover:border-[#FFC857]/50'
                        : 'border-[#5D4037]/10 hover:shadow-md'
                    }`}
                    onClick={() => isTagSelectionMode && toggleTagSelection(tag.id)}
                    style={{ cursor: isTagSelectionMode ? 'pointer' : 'default' }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {isTagSelectionMode && (
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                            selectedTagIds.includes(tag.id)
                              ? 'bg-[#FFC857] border-[#FFC857]'
                              : 'border-[#5D4037]/30'
                          }`}>
                            {selectedTagIds.includes(tag.id) && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center">
                          <Tag className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#5D4037]">{tag.name}</h3>
                          <p className="text-xs text-[#5D4037]/60">使用 {tag.usage_count} 次</p>
                        </div>
                      </div>
                      {!isTagSelectionMode && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditTag(tag)}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTag(tag.id, tag.name)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
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
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">
                  {editingPose ? '编辑摆姿' : '新增摆姿'}
                </h2>
                <button
                  onClick={() => setShowPoseModal(false)}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
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
                            className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
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
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">新增标签</h2>
                <button
                  onClick={() => setShowTagModal(false)}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
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
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">修改标签</h2>
                <button
                  onClick={() => {
                    setEditingTag(null);
                    setEditingTagName('');
                  }}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
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
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6" />
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





