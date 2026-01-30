'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Sparkles, CheckSquare, Square, Trash2, ArrowLeft } from 'lucide-react';
import Card from '@/components/ui/Card';
import LetterOpeningModal from '@/components/LetterOpeningModal';

// 模拟数据：相册信息
const mockAlbum = {
  id: 'demo123',
  title: '江边的夏日时光',
  welcomeLetter: `Hi，这是我们在江边相遇的证明...

那天阳光正好，微风轻拂，你的笑容比夏日的阳光还要温暖。

这些照片记录了那个美好的下午，希望它们能让你想起那些快乐的瞬间。

愿你每天都能像那天一样，笑得灿烂如花 🌸

—— 你的摄影师朋友`,
  folders: [
    { id: 'all', name: '全部照片', count: 6 },
    { id: 'outdoor', name: '户外', count: 3 },
    { id: 'portrait', name: '人像', count: 2 },
    { id: 'landscape', name: '风景', count: 1 },
  ],
  photos: [
    {
      id: 1,
      url: 'https://picsum.photos/seed/album1/400/600',
      isPublic: false,
      folderId: 'outdoor',
    },
    {
      id: 2,
      url: 'https://picsum.photos/seed/album2/600/400',
      isPublic: false,
      folderId: 'outdoor',
    },
    {
      id: 3,
      url: 'https://picsum.photos/seed/album3/400/500',
      isPublic: true,
      folderId: 'portrait',
    },
    {
      id: 4,
      url: 'https://picsum.photos/seed/album4/500/600',
      isPublic: false,
      folderId: 'portrait',
    },
    {
      id: 5,
      url: 'https://picsum.photos/seed/album5/600/500',
      isPublic: false,
      folderId: 'outdoor',
    },
    {
      id: 6,
      url: 'https://picsum.photos/seed/album6/400/600',
      isPublic: true,
      folderId: 'landscape',
    },
  ],
};

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [showWelcomeLetter, setShowWelcomeLetter] = useState(true);
  const [showToast, setShowToast] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('all');
  const [selectedPhoto, setSelectedPhoto] = useState<number | null>(null);
  const [photos, setPhotos] = useState(mockAlbum.photos);
  const [selectedPhotos, setSelectedPhotos] = useState<Set<number>>(new Set());
  const [confirmPhotoId, setConfirmPhotoId] = useState<number | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowToast(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  const filteredPhotos = selectedFolder === 'all'
    ? photos
    : photos.filter(photo => photo.folderId === selectedFolder);

  const togglePublic = (photoId: number) => {
    setPhotos(prev =>
      prev.map(photo =>
        photo.id === photoId
          ? { ...photo, isPublic: !photo.isPublic }
          : photo
      )
    );
  };

  const togglePhotoSelection = (photoId: number) => {
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

  const handleBatchDownload = () => {
    const selectedUrls = photos.filter(p => selectedPhotos.has(p.id)).map(p => p.url);
    console.log('批量下载照片:', selectedUrls);
    // TODO: 实现实际的批量下载逻辑
  };

  const handleBatchDelete = () => {
    setPhotos(prev => prev.filter(p => !selectedPhotos.has(p.id)));
    setSelectedPhotos(new Set());
    // TODO: 实现实际的批量删除逻辑（调用 Supabase API）
  };

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
        className="flex-none bg-[#FFFBF0]/80 backdrop-blur-sm"
      >
        <div className="px-6 pt-6 pb-3 relative">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => router.push('/')}
            className="absolute left-6 top-6"
          >
            <ArrowLeft className="w-6 h-6 text-[#FFC857]" strokeWidth={2.5} />
          </motion.button>

          <div className="text-center">
            <h1 className="text-3xl font-bold text-[#5D4037] leading-none" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>专属回忆</h1>
            <div className="mt-2 inline-block px-3 py-1 bg-[#FFC857]/30 rounded-full transform -rotate-1">
              <p className="text-xs font-bold text-[#8D6E63] tracking-wide">✨ {filteredPhotos.length} 张照片 · 7天后消失 ✨</p>
            </div>
          </div>
        </div>
        <div className="border-b border-dashed border-[#5D4037]/20"></div>
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
              animate={{ x: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="text-[10px] text-[#5D4037]/60 flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3" />
              <span>定格后永久保留，可在照片墙展示</span>
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
          {mockAlbum.folders.map((folder) => (
            <motion.button
              key={folder.id}
              whileTap={{ scale: 0.95 }}
              onClick={() => setSelectedFolder(folder.id)}
              animate={selectedFolder === folder.id ? { rotate: 2 } : { rotate: 0 }}
              className={`
                flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all
                ${selectedFolder === folder.id
                  ? 'bg-[#FFC857] text-white shadow-sm'
                  : 'bg-transparent text-[#5D4037]/50 border border-[#5D4037]/15'
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
      <div className="flex-1 overflow-y-auto px-3 pb-32">
        <div className="columns-2 gap-3">
          {filteredPhotos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="break-inside-avoid mb-3"
            >
              {/* 瀑布流卡片 */}
              <div className="bg-white rounded-xl shadow-sm border border-[#5D4037]/10 overflow-hidden">
                {/* 图片区域 */}
                <div
                  className="relative cursor-pointer"
                  onClick={() => setSelectedPhoto(photo.id)}
                >
                  <img
                    src={photo.url}
                    alt={`照片 ${photo.id}`}
                    className="w-full h-auto object-cover"
                  />

                  {/* 选择框 */}
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      togglePhotoSelection(photo.id);
                    }}
                    className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-colors"
                  >
                    {selectedPhotos.has(photo.id) ? (
                      <CheckSquare className="w-5 h-5 text-[#FFC857]" />
                    ) : (
                      <Square className="w-5 h-5 text-[#5D4037]/40" />
                    )}
                  </motion.button>
                </div>

                {/* 操作栏 */}
                <div className="p-3 flex items-center justify-center">
                  <motion.button
                    whileTap={{ scale: 0.9 }}
                    onClick={() => photo.isPublic ? togglePublic(photo.id) : setConfirmPhotoId(photo.id)}
                    className={`
                      flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-all
                      ${photo.isPublic
                        ? 'bg-[#FFC857] text-[#5D4037]'
                        : 'bg-[#5D4037]/10 text-[#5D4037]/60'
                      }
                    `}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{photo.isPublic ? '已定格' : '定格'}</span>
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
        letterContent={mockAlbum.welcomeLetter}
      />

      {/* 大图预览 */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          >
            <motion.img
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              src={photos.find(p => p.id === selectedPhoto)?.url}
              alt="预览"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
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
                  魔法生效后，这张照片就会飞到 <span className="font-bold text-[#FFC857]">【作品墙】</span> 上，和更多人分享这份美好！📸 这样它就有了 <span className="font-bold text-[#FFC857]">[永恒]</span> 的魔法加持，打破 7 天消失的魔咒，永远在这里闪闪发光啦~ ✨
                </p>
                <p className="text-xs text-[#5D4037]/50 leading-relaxed">
                  💡 Tips：如果改变主意了，随时可以再次点击让魔法失效，照片会回到专属空间继续 7 天倒计时哦~
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
    </div>
  );
}
