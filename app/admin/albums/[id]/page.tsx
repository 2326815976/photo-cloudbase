'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useParams } from 'next/navigation';
import { ArrowLeft, FolderPlus, Upload, Trash2, Image as ImageIcon, Folder, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Album {
  id: string;
  title: string;
  access_key: string;
}

interface AlbumFolder {
  id: string;
  name: string;
  created_at: string;
}

interface Photo {
  id: string;
  url: string;
  folder_id: string | null;
  width: number | null;
  height: number | null;
  created_at: string;
}

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

  useEffect(() => {
    loadAlbumData();
  }, [albumId, currentPage]);

  useEffect(() => {
    if (photos.length > 0) {
      loadPhotoUrls();
    }
  }, [photos]);

  const loadAlbumData = async () => {
    setLoading(true);
    const supabase = createClient();

    const [albumRes, foldersRes, photosRes] = await Promise.all([
      supabase.from('albums').select('*').eq('id', albumId).single(),
      supabase.from('album_folders').select('*').eq('album_id', albumId).order('created_at', { ascending: false }),
      supabase.from('album_photos').select('*', { count: 'exact' }).eq('album_id', albumId).order('created_at', { ascending: false }).range((currentPage - 1) * photosPerPage, currentPage * photosPerPage - 1),
    ]);

    if (albumRes.data) setAlbum(albumRes.data);
    if (foldersRes.data) setFolders(foldersRes.data);
    if (photosRes.data) {
      setPhotos(photosRes.data);
      setTotalCount(photosRes.count || 0);
    }

    setLoading(false);
  };

  const loadPhotoUrls = async () => {
    const supabase = createClient();
    const urls: Record<string, string> = {};

    for (const photo of photos) {
      const { data } = await supabase.storage.from('albums').createSignedUrl(photo.url, 3600);
      if (data?.signedUrl) {
        urls[photo.id] = data.signedUrl;
      }
    }

    setPhotoUrls(urls);
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      alert('请输入文件夹名称');
      return;
    }

    const supabase = createClient();
    const { error } = await supabase.from('album_folders').insert({
      album_id: albumId,
      name: newFolderName,
    });

    if (!error) {
      setNewFolderName('');
      setShowNewFolderModal(false);
      loadAlbumData();
    } else {
      alert('创建失败：' + error.message);
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('确定要删除这个文件夹吗？文件夹内的照片将移至根目录。')) return;

    const supabase = createClient();
    const { error } = await supabase.from('album_folders').delete().eq('id', folderId);

    if (!error) {
      loadAlbumData();
    } else {
      alert('删除失败：' + error.message);
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

  const handleBatchImageSelect = (files: FileList | null) => {
    if (!files || files.length === 0) {
      setBatchImages([]);
      return;
    }
    setBatchImages(Array.from(files));
  };

  const handleUploadPhotos = async () => {
    if (batchImages.length === 0) {
      alert('请选择图片');
      return;
    }

    setUploading(true);
    const supabase = createClient();
    let successCount = 0;
    let failCount = 0;

    setUploadProgress({ current: 0, total: batchImages.length });

    for (let i = 0; i < batchImages.length; i++) {
      const file = batchImages[i];
      setUploadProgress({ current: i + 1, total: batchImages.length });

      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${i}.${fileExt}`;

        const { error: uploadError } = await supabase.storage.from('albums').upload(fileName, file);

        if (uploadError) {
          failCount++;
          continue;
        }

        const dimensions = await getImageDimensions(file);

        const { error: insertError } = await supabase.from('album_photos').insert({
          album_id: albumId,
          folder_id: selectedFolder,
          url: fileName,
          width: dimensions.width,
          height: dimensions.height,
        });

        if (insertError) {
          failCount++;
        } else {
          successCount++;
        }
      } catch (error) {
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
      alert(`上传完成：成功 ${successCount} 张，失败 ${failCount} 张`);
    }
  };

  const handleDeletePhoto = async (photoId: string, photoUrl: string) => {
    if (!confirm('确定要删除这张照片吗？')) return;

    const supabase = createClient();
    const { error } = await supabase.from('album_photos').delete().eq('id', photoId);

    if (!error) {
      loadAlbumData();
    } else {
      alert('删除失败：' + error.message);
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

  const handleBatchDelete = async () => {
    if (selectedPhotoIds.length === 0) {
      alert('请先选择要删除的照片');
      return;
    }

    if (!confirm(`确定要删除选中的 ${selectedPhotoIds.length} 张照片吗？`)) return;

    const supabase = createClient();

    try {
      const { error: dbError } = await supabase
        .from('album_photos')
        .delete()
        .in('id', selectedPhotoIds);

      if (dbError) throw dbError;

      setSelectedPhotoIds([]);
      setIsSelectionMode(false);
      loadAlbumData();
    } catch (error: any) {
      alert('批量删除失败：' + error.message);
    }
  };

  const filteredPhotos = selectedFolder
    ? photos.filter((p) => p.folder_id === selectedFolder)
    : photos.filter((p) => !p.folder_id);

  if (loading) {
    return (
      <div className="text-center py-12">
        <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-sm text-[#5D4037]/60">加载中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => router.back()} className="text-[#5D4037] hover:text-[#FFC857] transition-colors">
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-[#5D4037]" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
              {album?.title || '未命名空间'}
            </h1>
            <p className="text-sm text-[#5D4037]/60">密钥: {album?.access_key}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {!isSelectionMode ? (
            <>
              <button
                onClick={() => setShowNewFolderModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-[#FFC857]/20 text-[#5D4037] rounded-full hover:bg-[#FFC857]/30 transition-colors"
              >
                <FolderPlus className="w-5 h-5" />
                新建文件夹
              </button>
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
                <Upload className="w-5 h-5" />
                上传照片
              </button>
            </>
          ) : (
            <>
              <button
                onClick={selectAllPhotos}
                className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
              >
                全选 ({selectedPhotoIds.length}/{filteredPhotos.length})
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
      </div>

      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setSelectedFolder(null)}
          className={`px-4 py-2 rounded-full text-sm transition-colors ${
            selectedFolder === null ? 'bg-[#FFC857] text-[#5D4037]' : 'bg-white text-[#5D4037] border border-[#5D4037]/20'
          }`}
        >
          根目录 ({photos.filter((p) => !p.folder_id).length})
        </button>
        {folders.map((folder) => (
          <div key={folder.id} className="relative group">
            <button
              onClick={() => setSelectedFolder(folder.id)}
              className={`px-4 py-2 rounded-full text-sm transition-colors ${
                selectedFolder === folder.id ? 'bg-[#FFC857] text-[#5D4037]' : 'bg-white text-[#5D4037] border border-[#5D4037]/20'
              }`}
            >
              <Folder className="w-4 h-4 inline mr-1" />
              {folder.name} ({photos.filter((p) => p.folder_id === folder.id).length})
            </button>
            <button
              onClick={() => handleDeleteFolder(folder.id)}
              className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-3 h-3 mx-auto" />
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
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <AnimatePresence>
            {filteredPhotos.map((photo) => (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-white rounded-2xl overflow-hidden shadow-sm border transition-all ${
                  isSelectionMode
                    ? selectedPhotoIds.includes(photo.id)
                      ? 'border-[#FFC857] bg-[#FFC857]/5 shadow-md'
                      : 'border-[#5D4037]/10 hover:border-[#FFC857]/50'
                    : 'border-[#5D4037]/10 hover:shadow-md'
                }`}
                onClick={() => isSelectionMode && togglePhotoSelection(photo.id)}
                style={{ cursor: isSelectionMode ? 'pointer' : 'default' }}
              >
                <div className="aspect-[3/4] relative">
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
                  {photoUrls[photo.id] ? (
                    <img
                      src={photoUrls[photo.id]}
                      alt=""
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <div className="w-8 h-8 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin"></div>
                    </div>
                  )}
                  {!isSelectionMode && (
                    <button
                      onClick={() => handleDeletePhoto(photo.id, photo.url)}
                      className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </motion.div>
            ))}
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowNewFolderModal(false)}>
          <div className="bg-white rounded-2xl p-6 w-96" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-[#5D4037] mb-4">新建文件夹</h3>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="输入文件夹名称"
              className="w-full px-4 py-2 border border-[#5D4037]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFC857] mb-4"
              autoFocus
              onKeyPress={(e) => e.key === 'Enter' && handleCreateFolder()}
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowNewFolderModal(false)}
                className="flex-1 px-4 py-2 border border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleCreateFolder}
                className="flex-1 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}

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
    </div>
  );
}
