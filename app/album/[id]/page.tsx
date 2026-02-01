'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Download, Sparkles, CheckSquare, Square, Trash2, ArrowLeft, X } from 'lucide-react';
import LetterOpeningModal from '@/components/LetterOpeningModal';
import { createClient } from '@/lib/supabase/client';
import { downloadPhoto } from '@/lib/android';

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
    recipient_name?: string;
  };
  folders: Folder[];
  photos: Photo[];
}

export default function AlbumDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accessKey = params.id as string;
  const shouldReduceMotion = useReducedMotion();

  const [loading, setLoading] = useState(true);
  const [albumData, setAlbumData] = useState<AlbumData | null>(null);
  const [showWelcomeLetter, setShowWelcomeLetter] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set());
  const [confirmPhotoId, setConfirmPhotoId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [previewMode, setPreviewMode] = useState<'preview' | 'original'>('preview'); // 预览模式
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null); // 全屏查看的照片ID
  const [scale, setScale] = useState(1); // 缩放比例
  const [position, setPosition] = useState({ x: 0, y: 0 }); // 图片位置
  const [isDragging, setIsDragging] = useState(false); // 是否正在拖拽
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // 拖拽起始位置

  // 加载相册数据
  useEffect(() => {
    loadAlbumData();
  }, [accessKey]);

  // Toast提示
  useEffect(() => {
    if (!loading && albumData) {
      const timer = setTimeout(() => {
        setShowToast(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [loading, albumData]);

  const loadAlbumData = async () => {
    setLoading(true);
    const supabase = createClient();

    // 调用RPC获取相册内容（已包含三个URL字段）
    const { data, error } = await supabase.rpc('get_album_content', {
      input_key: accessKey
    });

    console.log('相册数据加载结果:', { data, error, accessKey });

    if (error || !data) {
      console.error('相册数据加载失败:', error);
      setToast({ message: `加载失败：${error?.message || '相册不存在'}`, type: 'error' });
      setTimeout(() => router.push('/album'), 2000);
      return;
    }

    setAlbumData(data);
    setPhotos(data.photos);
    setLoading(false);

    // 预加载前10张照片的preview图片
    if (data.photos && data.photos.length > 0) {
      data.photos.slice(0, 10).forEach((photo: Photo) => {
        const img = new Image();
        img.src = photo.preview_url;
      });
    }
  };

  const filteredPhotos = useMemo(() => {
    if (selectedFolder === 'all') return photos;
    return photos.filter(photo => photo.folder_id === selectedFolder);
  }, [photos, selectedFolder]);

  const togglePublic = async (photoId: string) => {
    const photo = photos.find(p => p.id === photoId);
    if (!photo) return;

    const supabase = createClient();

    // 使用RPC函数确保安全性
    const { error } = await supabase.rpc('pin_photo_to_wall', {
      p_access_key: accessKey,
      p_photo_id: photoId
    });

    if (!error) {
      const newIsPublic = !photo.is_public;
      setPhotos(prev =>
        prev.map(p =>
          p.id === photoId ? { ...p, is_public: newIsPublic } : p
        )
      );

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
    const selectedPhotosList = photos.filter(p => selectedPhotos.has(p.id));

    for (const photo of selectedPhotosList) {
      try {
        // 使用Android原生下载（自动降级到Web下载）
        downloadPhoto(photo.original_url, `photo_${photo.id}.jpg`);

        // 添加延迟避免浏览器阻止多个下载
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error('下载失败:', error);
      }
    }

    setToast({ message: `已开始下载 ${selectedPhotosList.length} 张原图`, type: 'success' });
    setTimeout(() => setToast(null), 3000);
  };

  const handleBatchDelete = async () => {
    setShowDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    const supabase = createClient();
    let successCount = 0;
    let failCount = 0;

    for (const photoId of Array.from(selectedPhotos)) {
      const photo = photos.find(p => p.id === photoId);
      if (!photo) continue;

      // 从URL中提取文件路径的辅助函数
      const extractPath = (url: string) => {
        try {
          const urlObj = new URL(url);
          const pathParts = urlObj.pathname.split('/albums/');
          return pathParts[1] || null;
        } catch {
          return null;
        }
      };

      // 收集需要删除的文件路径
      const filesToDelete = [
        extractPath(photo.thumbnail_url),
        extractPath(photo.preview_url),
        extractPath(photo.original_url)
      ].filter(Boolean) as string[];

      // 删除Storage中的所有版本文件
      if (filesToDelete.length > 0) {
        await supabase.storage
          .from('albums')
          .remove(filesToDelete);
      }

      // 删除数据库记录
      const { error: dbError } = await supabase.rpc('delete_album_photo', {
        p_access_key: accessKey,
        p_photo_id: photoId
      });

      if (dbError) {
        failCount++;
      } else {
        successCount++;
      }
    }

    setShowDeleteConfirm(false);

    if (successCount > 0) {
      setPhotos(prev => prev.filter(p => !selectedPhotos.has(p.id)));
      setSelectedPhotos(new Set());
      setToast({ message: `成功删除 ${successCount} 张照片`, type: 'success' });
      setTimeout(() => setToast(null), 3000);
    }

    if (failCount > 0) {
      setToast({ message: `删除完成：成功 ${successCount} 张，失败 ${failCount} 张`, type: 'error' });
      setTimeout(() => setToast(null), 3000);
    }
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
            <p className="text-lg font-medium text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
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
    { id: 'all', name: '全部照片' },
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

      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2 relative">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => router.push('/')}
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5 text-[#FFC857]" strokeWidth={2.5} />
          </motion.button>

          <div className="flex-1 text-center">
            <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
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
        {showToast && (
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
              <span className="inline-block">✨ 这里的照片只有 7 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......</span>
              <span className="inline-block ml-8">✨ 这里的照片只有 7 天的魔法时效，不被【定格】的瞬间会像泡沫一样悄悄飞走哦......</span>
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
              onClick={() => setSelectedFolder(folder.id)}
              animate={selectedFolder === folder.id && !shouldReduceMotion ? { rotate: 1.5 } : { rotate: 0 }}
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
            whileTap={{ scale: 0.9 }}
            onClick={toggleSelectAll}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#5D4037]/5 rounded-full"
          >
            {selectedPhotos.size === filteredPhotos.length ? (
              <>
                <CheckSquare className="w-4 h-4 text-[#FFC857]" />
                <span className="text-xs font-medium text-[#5D4037]">全选</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4 text-[#5D4037]/40" />
                <span className="text-xs font-medium text-[#5D4037]/60">全选</span>
              </>
            )}
          </motion.button>

          {selectedPhotos.size > 0 && (
            <>
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleBatchDelete}
                className="w-8 h-8 rounded-full bg-red-500/10 shadow-sm flex items-center justify-center"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </motion.button>

              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleBatchDownload}
                className="w-8 h-8 rounded-full bg-[#FFC857] shadow-sm flex items-center justify-center relative"
              >
                <Download className="w-4 h-4 text-[#5D4037]" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-[#5D4037] text-white text-[8px] rounded-full flex items-center justify-center">
                  {selectedPhotos.size}
                </span>
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* 照片瀑布流 - 可滚动 */}
      <div className="flex-1 overflow-y-auto px-2 pt-3 pb-32">
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
              <div className="bg-white rounded-xl shadow-sm hover:shadow-md overflow-hidden transition-shadow duration-300">
                {/* 图片区域 */}
                <div
                  className="relative cursor-pointer"
                  onClick={() => setSelectedPhoto(photo.id)}
                >
                  <img
                    src={photo.thumbnail_url}
                    alt={`照片 ${photo.id}`}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-auto object-cover"
                  />

                  {/* 选择框 */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-2xl bg-transparent flex items-center justify-center hover:bg-white/20 transition-colors"
                  >
                    {selectedPhotos.has(photo.id) ? (
                      <CheckSquare className="w-5 h-5 text-[#FFC857]" />
                    ) : (
                      <Square className="w-5 h-5 text-white/80" />
                    )}
                  </motion.button>
                </div>

                {/* 操作栏 */}
                <div className="p-2 flex items-center justify-center">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => photo.is_public ? togglePublic(photo.id) : setConfirmPhotoId(photo.id)}
                    className={`
                      flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all
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
      </div>

      {/* 拆信交互 */}
      <LetterOpeningModal
        isOpen={showWelcomeLetter}
        onClose={() => setShowWelcomeLetter(false)}
        letterContent={albumData.album.welcome_letter || '欢迎来到专属空间 ✨'}
        recipientName={albumData.album.recipient_name}
      />

      {/* 便利贴风格预览弹窗 */}
      <AnimatePresence>
        {selectedPhoto && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedPhoto(null)}
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

                {/* 关闭按钮 */}
                <button
                  onClick={() => setSelectedPhoto(null)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors z-20"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>

                {/* 图片容器 */}
                <div className="p-4 pb-3">
                  <div className="relative bg-white rounded-lg overflow-hidden shadow-inner">
                    <img
                      src={
                        previewMode === 'original'
                          ? photos.find(p => p.id === selectedPhoto)?.original_url
                          : photos.find(p => p.id === selectedPhoto)?.preview_url
                      }
                      alt="预览"
                      className="w-full h-auto max-h-[70vh] object-contain"
                      loading="eager"
                      decoding="async"
                    />
                  </div>
                </div>

                {/* 信息区域 */}
                <div className="px-4 pb-4 border-t-2 border-dashed border-[#5D4037]/10 pt-3 bg-white/50">
                  <div className="flex items-center justify-center gap-6 text-[#5D4037]">
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setFullscreenPhoto(selectedPhoto);
                        setScale(1);
                        setPosition({ x: 0, y: 0 });
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-[#FFC857] text-[#5D4037] transition-colors"
                    >
                      查看原图
                    </motion.button>

                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        const photo = photos.find(p => p.id === selectedPhoto);
                        if (!photo) return;

                        try {
                          // 使用Android原生下载（自动降级到Web下载）
                          downloadPhoto(photo.original_url, `photo_${photo.id}.jpg`);
                          setToast({ message: '原图下载已开始', type: 'success' });
                          setTimeout(() => setToast(null), 3000);
                        } catch (error) {
                          setToast({ message: '下载失败', type: 'error' });
                          setTimeout(() => setToast(null), 3000);
                        }
                      }}
                      className="px-3 py-1.5 rounded-full text-xs font-medium bg-white text-[#5D4037] border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors flex items-center gap-1"
                    >
                      <Download className="w-3 h-3" />
                      下载原图
                    </motion.button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
                  魔法生效后，这张照片就会飞到 <span className="font-bold text-[#FFC857]">【照片墙】</span> 上，和更多人分享这份美好！📸 这样它就有了 <span className="font-bold text-[#FFC857]">[永恒]</span> 的魔法加持，打破 7 天消失的魔咒，永远在这里闪闪发光啦~ ✨
                </p>
                <p className="text-xs text-[#5D4037]/50 leading-relaxed">
                  💡 Tips：如果改变主意，可以随时再次点击让魔法失效，照片会回到专属空间继续 7 天倒计时哦~
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

      {/* 全屏原图查看器 */}
      <AnimatePresence>
        {fullscreenPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[100] flex items-center justify-center"
            onWheel={(e) => {
              e.preventDefault();
              const delta = e.deltaY > 0 ? -0.1 : 0.1;
              setScale(prev => Math.max(0.5, Math.min(5, prev + delta)));
            }}
            onMouseDown={(e) => {
              if (e.target === e.currentTarget || (e.target as HTMLElement).tagName === 'IMG') {
                setIsDragging(true);
                setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
              }
            }}
            onMouseMove={(e) => {
              if (isDragging) {
                setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
              }
            }}
            onMouseUp={() => setIsDragging(false)}
            onMouseLeave={() => setIsDragging(false)}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                setIsDragging(true);
                setDragStart({
                  x: e.touches[0].clientX - position.x,
                  y: e.touches[0].clientY - position.y
                });
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1 && isDragging) {
                setPosition({
                  x: e.touches[0].clientX - dragStart.x,
                  y: e.touches[0].clientY - dragStart.y
                });
              }
            }}
            onTouchEnd={() => setIsDragging(false)}
          >
            {/* 关闭按钮 */}
            <button
              onClick={() => {
                setFullscreenPhoto(null);
                setScale(1);
                setPosition({ x: 0, y: 0 });
              }}
              className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors z-10"
            >
              <X className="w-6 h-6 text-white" />
            </button>

            {/* 缩放控制 */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
              <button
                onClick={() => setScale(prev => Math.max(0.5, prev - 0.2))}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors"
              >
                −
              </button>
              <span className="text-white text-sm font-medium min-w-[60px] text-center">
                {Math.round(scale * 100)}%
              </span>
              <button
                onClick={() => setScale(prev => Math.min(5, prev + 0.2))}
                className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold transition-colors"
              >
                +
              </button>
              <button
                onClick={() => {
                  setScale(1);
                  setPosition({ x: 0, y: 0 });
                }}
                className="ml-2 px-3 py-1 rounded-full bg-white/20 hover:bg-white/30 text-white text-xs font-medium transition-colors"
              >
                重置
              </button>
            </div>

            {/* 图片 */}
            <img
              src={photos.find(p => p.id === fullscreenPhoto)?.original_url}
              alt="原图"
              className="max-w-none select-none"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                cursor: isDragging ? 'grabbing' : 'grab',
                transition: isDragging ? 'none' : 'transform 0.1s ease-out'
              }}
              draggable={false}
            />
          </motion.div>
        )}
      </AnimatePresence>

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
