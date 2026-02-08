'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Image, Trash2, Upload, Heart, Eye, CheckCircle, XCircle, AlertCircle, Plus, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateBlurHash } from '@/lib/utils/blurhash';
import { generateAlbumImageVersions } from '@/lib/utils/image-versions';
import { uploadToCosDirect } from '@/lib/storage/cos-upload-client';

interface Photo {
  id: string;
  url?: string;
  thumbnail_url?: string;
  preview_url?: string;
  original_url?: string;
  width: number;
  height: number;
  is_public: boolean;
  like_count: number;
  view_count: number;
  created_at: string;
}

const PHOTO_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';

export default function AdminGalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deletingPhoto, setDeletingPhoto] = useState<Photo | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadImages, setUploadImages] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [previewPhoto, setPreviewPhoto] = useState<Photo | null>(null);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);

  useEffect(() => {
    loadPhotos();
  }, [page]);

  const loadPhotos = async () => {
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await supabase
      .from('album_photos')
      .select('*')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (!error && data) {
      setPhotos(data);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string) => {
    const photo = photos.find(p => p.id === id);
    if (photo) {
      setDeletingPhoto(photo);
    }
  };

  const confirmDelete = async () => {
    if (!deletingPhoto) return;

    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setDeletingPhoto(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    // 从URL中提取COS存储路径
    const { extractKeyFromURL } = await import('@/lib/storage/cos-utils');

    // 收集需要删除的文件路径
    const filesToDelete = [
      deletingPhoto.thumbnail_url ? extractKeyFromURL(deletingPhoto.thumbnail_url) : null,
      deletingPhoto.preview_url ? extractKeyFromURL(deletingPhoto.preview_url) : null,
      deletingPhoto.original_url ? extractKeyFromURL(deletingPhoto.original_url) : null,
      deletingPhoto.url ? extractKeyFromURL(deletingPhoto.url) : null
    ].filter(Boolean) as string[];

    // 删除COS中的所有版本文件
    let cosDeleteSuccess = true;
    if (filesToDelete.length > 0) {
      try {
        const response = await fetch('/api/batch-delete', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ keys: filesToDelete }),
        });

        if (!response.ok) {
          throw new Error('删除COS文件失败');
        }
      } catch (error) {
        console.error('删除COS文件失败:', error);
        cosDeleteSuccess = false;
      }
    }

    if (!cosDeleteSuccess) {
      setActionLoading(false);
      setShowToast({ message: '删除失败：COS文件删除异常，已中止数据库删除', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    // 删除数据库记录
    const { error: dbError } = await supabase
      .from('album_photos')
      .delete()
      .eq('id', deletingPhoto.id);

    setActionLoading(false);

    if (!dbError) {
      setDeletingPhoto(null);
      loadPhotos();
      setShowToast({ message: '照片已删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setDeletingPhoto(null);
      setShowToast({ message: `删除失败：${dbError.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedPhotoIds.length === 0) {
      setShowToast({ message: '请先选择要删除的照片', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    setShowBatchDeleteConfirm(false);
    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const photosToDelete = photos.filter(p => selectedPhotoIds.includes(p.id));

      // 从URL中提取COS存储路径
      const { extractKeyFromURL } = await import('@/lib/storage/cos-utils');

      // 收集所有需要删除的文件路径（包括所有版本）
      const filePaths = photosToDelete.flatMap(p => [
        p.thumbnail_url ? extractKeyFromURL(p.thumbnail_url) : null,
        p.preview_url ? extractKeyFromURL(p.preview_url) : null,
        p.original_url ? extractKeyFromURL(p.original_url) : null,
        p.url ? extractKeyFromURL(p.url) : null
      ]).filter(Boolean) as string[];

      // 批量删除COS文件
      let cosDeleteSuccess = true;
      if (filePaths.length > 0) {
        try {
          const response = await fetch('/api/batch-delete', {
            method: 'DELETE',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ keys: filePaths }),
          });

          if (!response.ok) {
            throw new Error('批量删除COS文件失败');
          }
        } catch (error) {
          console.error('批量删除COS文件失败:', error);
          cosDeleteSuccess = false;
        }
      }

      if (!cosDeleteSuccess) {
        throw new Error('批量删除COS文件失败，已中止数据库删除');
      }

      // 批量删除数据库记录
      const { error: dbError } = await supabase
        .from('album_photos')
        .delete()
        .in('id', selectedPhotoIds);

      if (dbError) throw dbError;

      setActionLoading(false);
      setSelectedPhotoIds([]);
      setIsSelectionMode(false);
      loadPhotos();
      setShowToast({ message: `成功删除 ${selectedPhotoIds.length} 张照片`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `批量删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const togglePhotoSelection = (id: string) => {
    setSelectedPhotoIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllPhotos = () => {
    if (selectedPhotoIds.length === photos.length) {
      setSelectedPhotoIds([]);
    } else {
      setSelectedPhotoIds(photos.map(p => p.id));
    }
  };

  const clearPhotoSelection = () => {
    setSelectedPhotoIds([]);
    setIsSelectionMode(false);
  };

  const getImageDimensions = (file: File): Promise<{ width: number; height: number }> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.onload = () => {
        resolve({ width: img.width, height: img.height });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  };

  const handleUpload = async () => {
    if (uploadImages.length === 0) {
      setShowToast({ message: '请选择图片', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setUploading(true);
    const supabase = createClient();
    if (!supabase) {
      setUploading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    let successCount = 0;
    let failCount = 0;

    setUploadProgress({ current: 0, total: uploadImages.length });

    for (let i = 0; i < uploadImages.length; i++) {
      const file = uploadImages[i];
      setUploadProgress({ current: i + 1, total: uploadImages.length });

      try {
        // 1. 生成多版本图片（thumbnail + preview + original，智能压缩）
        const versions = await generateAlbumImageVersions(file);
        const thumbnailVersion = versions.find(v => v.type === 'thumbnail')!;
        const previewVersion = versions.find(v => v.type === 'preview')!;
        const originalVersion = versions.find(v => v.type === 'original')!;

        // 2. 生成 BlurHash（基于 thumbnail）
        const blurhash = await generateBlurHash(thumbnailVersion.file);

        const timestamp = Date.now();
        let thumbnail_url = '';
        let preview_url = '';
        let original_url = '';

        // 3. 客户端直传三个版本到腾讯云COS（gallery文件夹）
        for (const version of versions) {
          const ext = version.type === 'original' ? file.name.split('.').pop() : 'webp';
          const fileName = `${timestamp}_${i}_${version.type}.${ext}`;

          try {
            const publicUrl = await uploadToCosDirect(version.file, fileName, 'gallery');

            if (version.type === 'thumbnail') thumbnail_url = publicUrl;
            else if (version.type === 'preview') preview_url = publicUrl;
            else if (version.type === 'original') original_url = publicUrl;
          } catch (uploadError) {
            console.error(`上传 ${version.type} 失败:`, uploadError);
            failCount++;
            break;
          }
        }

        // 4. 插入数据库
        if (thumbnail_url && preview_url && original_url) {
          const { error: insertError } = await supabase.from('album_photos').insert({
            album_id: PHOTO_WALL_ALBUM_ID,
            thumbnail_url,
            preview_url,
            original_url,
            width: thumbnailVersion.width,
            height: thumbnailVersion.height,
            blurhash,
            is_public: true
          });

          if (insertError) {
            failCount++;
          } else {
            successCount++;
          }
        } else {
          failCount++;
        }
      } catch (error) {
        failCount++;
      }
    }

    setUploading(false);
    setShowUploadModal(false);
    setUploadImages([]);
    setUploadProgress({ current: 0, total: 0 });

    if (successCount > 0) {
      loadPhotos();
    }

    if (failCount > 0) {
      setShowToast({ message: `上传完成：成功 ${successCount} 张，失败 ${failCount} 张`, type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `成功上传 ${successCount} 张照片`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          照片墙管理 🖼️
        </h1>
        <p className="text-sm text-[#5D4037]/60">管理公开展示的照片</p>
      </div>

      {/* 移动端操作按钮 - 放在标题下方 */}
      <div className="flex gap-2 md:hidden">
        {!isSelectionMode ? (
          <>
            <button
              onClick={() => setIsSelectionMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              批量删除
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
            >
              <Plus className="w-5 h-5" />
              上传照片
            </button>
          </>
        ) : (
          <>
            <button
              onClick={selectAllPhotos}
              className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              {selectedPhotoIds.length === photos.length ? '取消全选' : `全选 (${selectedPhotoIds.length}/${photos.length})`}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedPhotoIds.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              删除 ({selectedPhotoIds.length})
            </button>
            <button
              onClick={clearPhotoSelection}
              className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              取消
            </button>
          </>
        )}
      </div>

      {/* 桌面端操作按钮 - 保持原位置 */}
      <div className="hidden md:flex items-center justify-end gap-2">
        {!isSelectionMode ? (
          <>
            <button
              onClick={() => setIsSelectionMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              批量删除
            </button>
            <button
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
            >
              <Plus className="w-5 h-5" />
              上传照片
            </button>
          </>
        ) : (
          <>
            <button
              onClick={selectAllPhotos}
              className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              {selectedPhotoIds.length === photos.length ? '取消全选' : `全选 (${selectedPhotoIds.length}/${photos.length})`}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedPhotoIds.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              删除选中 ({selectedPhotoIds.length})
            </button>
            <button
              onClick={clearPhotoSelection}
              className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              取消
            </button>
          </>
        )}
      </div>

      {/* 照片列表 */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      ) : photos.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <Image className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无公开照片</p>
        </div>
      ) : (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-4">
          <AnimatePresence>
            {photos.map((photo) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition-all mb-4 break-inside-avoid ${
                  isSelectionMode
                    ? selectedPhotoIds.includes(photo.id)
                      ? 'border-[#FFC857] bg-[#FFC857]/5 shadow-md'
                      : 'border-[#5D4037]/10 hover:border-[#FFC857]/50'
                    : 'border-[#5D4037]/10 hover:shadow-md'
                }`}
                onClick={() => isSelectionMode && togglePhotoSelection(photo.id)}
                style={{ cursor: isSelectionMode ? 'pointer' : 'default' }}
              >
                <div className="relative group">
                  {isSelectionMode && (
                    <div className={`absolute top-2 left-2 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors z-10 ${
                      selectedPhotoIds.includes(photo.id)
                        ? 'bg-[#FFC857] border-[#FFC857]'
                        : 'bg-white border-[#5D4037]/30'
                    }`}>
                      {selectedPhotoIds.includes(photo.id) && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  )}
                  <img
                    src={photo.thumbnail_url || photo.preview_url || photo.url}
                    alt="照片"
                    className="w-full h-auto object-cover cursor-pointer"
                    onClick={(e) => {
                      if (!isSelectionMode) {
                        e.stopPropagation();
                        setPreviewPhoto(photo);
                      }
                    }}
                  />
                  {!isSelectionMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(photo.id);
                      }}
                      className="absolute top-2 right-2 w-12 h-12 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-md"
                    >
                      <Trash2 size={28} strokeWidth={2.5} className="text-white" />
                    </button>
                  )}
                </div>
                <div className="p-3">
                  <div className="flex items-center justify-between text-xs text-[#5D4037]/60">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        <Heart className="w-3 h-3" />
                        <span>{photo.like_count}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        <span>{photo.view_count}</span>
                      </div>
                    </div>
                    <span className="text-[#5D4037]/40">
                      {new Date(photo.created_at).toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                    </span>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 分页 */}
      {!loading && photos.length > 0 && (
        <div className="flex justify-center gap-2">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            上一页
          </button>
          <span className="px-4 py-2 bg-[#FFC857]/20 rounded-full text-[#5D4037] font-medium">
            第 {page} 页
          </span>
          <button
            onClick={() => setPage(page + 1)}
            disabled={photos.length < pageSize}
            className="px-4 py-2 bg-white rounded-full border border-[#5D4037]/10 disabled:opacity-50 hover:bg-[#5D4037]/5 transition-colors"
          >
            下一页
          </button>
        </div>
      )}

      {/* 上传照片弹窗 */}
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
                    onChange={(e) => setUploadImages(Array.from(e.target.files || []))}
                    className="hidden"
                    id="batch-upload"
                  />
                  <label htmlFor="batch-upload" className="cursor-pointer">
                    <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                    <p className="text-sm text-[#5D4037]/60">
                      {uploadImages.length > 0
                        ? `已选择 ${uploadImages.length} 张图片`
                        : '点击选择多张图片'}
                    </p>
                  </label>
                </div>

                {uploadImages.length > 0 && (
                  <div className="bg-[#FFFBF0] rounded-xl p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-[#5D4037]">
                        已选择 {uploadImages.length} 张图片
                      </span>
                      <button
                        onClick={() => setUploadImages([])}
                        className="text-xs text-red-600 hover:text-red-700"
                      >
                        清空
                      </button>
                    </div>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {uploadImages.map((file, index) => (
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
                  onClick={handleUpload}
                  disabled={uploading || uploadImages.length === 0}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {uploading
                    ? `上传中 (${uploadProgress.current}/${uploadProgress.total})...`
                    : `批量上传 (${uploadImages.length} 张)`
                  }
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
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除这张照片吗？
                </p>
                <div className="bg-orange-50 rounded-xl p-4 text-left">
                  <p className="text-sm text-orange-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    删除后将从照片墙移除
                  </p>
                </div>
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
                  onClick={confirmDelete}
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

      {/* 图片预览模态框 */}
      <AnimatePresence>
        {previewPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/90 flex items-center justify-center z-50"
            onClick={() => setPreviewPhoto(null)}
          >
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 text-white rounded-full flex items-center justify-center transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={previewPhoto.preview_url || previewPhoto.url}
              alt="预览"
              className="max-w-[90vw] max-h-[90vh] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
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
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
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
