'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Sparkles, Plus, Calendar } from 'lucide-react';

// 模拟数据 - 从 localStorage 读取登录状态和绑定相册
const getIsLoggedIn = () => {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('isLoggedIn') === 'true';
};

const getBoundAlbums = () => {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem('boundAlbums');
  return stored ? JSON.parse(stored) : [];
};

const saveBoundAlbum = (albumId: string, title: string) => {
  if (typeof window === 'undefined') return;
  const albums = getBoundAlbums();
  const exists = albums.find((a: any) => a.id === albumId);
  if (!exists) {
    const newAlbum = {
      id: albumId,
      title: title || '专属回忆',
      cover: 'https://picsum.photos/seed/album1/400/300',
      date: new Date().toISOString().split('T')[0],
      photoCount: 42
    };
    albums.push(newAlbum);
    localStorage.setItem('boundAlbums', JSON.stringify(albums));
  }
};

export default function AlbumLoginPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [boundAlbums, setBoundAlbums] = useState<any[]>([]);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);

  // 初始化时读取登录状态和绑定相册
  useEffect(() => {
    setIsLoggedIn(getIsLoggedIn());
    setBoundAlbums(getBoundAlbums());
  }, []);

  const handleAlbumClick = (albumId: string) => {
    router.push(`/album/${albumId}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!accessKey.trim()) {
      setError('请输入密钥');
      return;
    }

    setIsLoading(true);

    setTimeout(() => {
      if (accessKey === 'demo123') {
        // 如果已登录，自动绑定该相册
        if (isLoggedIn) {
          saveBoundAlbum(accessKey, '江边的夏日时光');
          setBoundAlbums(getBoundAlbums());
          setShowToast(true);
          setTimeout(() => setShowToast(false), 3000);
        }
        router.push(`/album/${accessKey}`);
      } else {
        setError('密钥错误，请重试');
        setIsLoading(false);
      }
    }, 800);
  };

  const hasBindings = isLoggedIn && boundAlbums.length > 0;

  return (
    <div className="flex flex-col h-full w-full">
      {/* Toast 提示 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-20 left-1/2 -translate-x-1/2 z-50 bg-[#FFC857] text-[#5D4037] px-6 py-3 rounded-full shadow-lg border-2 border-[#5D4037]"
          >
            🎉 已自动绑定该空间到您的账号！
          </motion.div>
        )}
      </AnimatePresence>

      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>专属返图空间</h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">🤫 嘘，这里藏着你的独家记忆 🤫</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20">
        {/* 场景一：已登录且有绑定相册 */}
        {hasBindings && !showKeyInput ? (
          <div className="space-y-4">
            {/* 我的相册列表 */}
            <div className="space-y-3">
              {boundAlbums.map((album, index) => (
                <motion.div
                  key={album.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handleAlbumClick(album.id)}
                  className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 overflow-hidden cursor-pointer transition-shadow duration-300"
                >
                  <div className="flex gap-4 p-4">
                    {/* 封面图 */}
                    <div className="flex-none w-24 h-24 rounded-2xl overflow-hidden bg-gray-100">
                      <img
                        src={album.cover}
                        alt={album.title}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    </div>

                    {/* 信息区 */}
                    <div className="flex-1 flex flex-col justify-center">
                      <h3 className="text-base font-bold text-[#5D4037] mb-1">
                        {album.title}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-[#5D4037]/50">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {album.date}
                        </span>
                        <span>{album.photoCount} 张照片</span>
                      </div>
                    </div>

                    {/* 箭头 */}
                    <div className="flex-none flex items-center">
                      <div className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center">
                        <span className="text-[#FFC857]">→</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* 添加新空间按钮 */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowKeyInput(true)}
              className="w-full bg-transparent border-2 border-dashed border-[#5D4037]/30 rounded-2xl p-6 flex items-center justify-center gap-2 text-[#5D4037]/60 hover:border-[#5D4037]/50 hover:text-[#5D4037] transition-all"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">绑定/访问其他空间</span>
            </motion.button>
          </div>
        ) : (
          /* 场景二：密钥输入框 */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            {/* 图标 */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="flex justify-center mb-6"
            >
              <div className="w-20 h-20 bg-[#FFC857]/20 rounded-full flex items-center justify-center">
                <Lock className="w-10 h-10 text-[#FFC857]" />
              </div>
            </motion.div>

            {/* 输入卡片 */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#5D4037]/10 p-6 relative overflow-hidden">
              {/* 装饰性背景 */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFC857]/10 rounded-full blur-3xl -z-10" />

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <input
                    type="text"
                    placeholder="输入神秘密钥..."
                    value={accessKey}
                    onChange={(e) => setAccessKey(e.target.value)}
                    disabled={isLoading}
                    className="w-full px-4 py-3 text-center text-lg tracking-wider bg-[#FFFBF0] border-2 border-[#5D4037]/20 rounded-2xl focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.15)] transition-all disabled:opacity-50"
                  />
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-500 mt-2 text-center"
                    >
                      {error}
                    </motion.p>
                  )}
                </div>

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full h-12 rounded-2xl bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px] text-[#5D4037] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Sparkles className="w-5 h-5" />
                      </motion.div>
                      <span>验证中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>开启回忆</span>
                    </>
                  )}
                </motion.button>
              </form>

              {/* 提示信息 */}
              <div className="mt-6 pt-6 border-t border-[#5D4037]/10">
                {!isLoggedIn && (
                  <p className="text-xs text-[#5D4037]/50 text-center mb-2">
                    💡 提示：
                    <a href="/profile" className="text-[#FFC857] hover:underline ml-1">
                      登录后
                    </a>
                    可绑定空间，下次无需输入密钥
                  </p>
                )}
                <p className="text-xs text-[#5D4037]/50 text-center">
                  密钥由摄影师提供，请妥善保管
                </p>
                <p className="text-xs text-[#5D4037]/50 text-center mt-1">
                  （演示密钥：demo123）
                </p>
              </div>
            </div>

            {/* 返回按钮 */}
            {hasBindings && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={() => setShowKeyInput(false)}
                className="w-full mt-4 text-sm text-[#5D4037]/60 hover:text-[#5D4037] transition-colors"
              >
                ← 返回我的相册
              </motion.button>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
