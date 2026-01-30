'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Heart, Star, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Modal from '@/components/ui/Modal';

// 模拟数据：相册信息
const mockAlbum = {
  id: 'demo123',
  title: '江边的夏日时光',
  welcomeLetter: `Hi，这是我们在江边相遇的证明...

那天阳光正好，微风轻拂，你的笑容比夏日的阳光还要温暖。

这些照片记录了那个美好的下午，希望它们能让你想起那些快乐的瞬间。

愿你每天都能像那天一样，笑得灿烂如花 🌸

—— 你的摄影师朋友`,
  photos: [
    {
      id: 1,
      url: 'https://picsum.photos/seed/album1/400/600',
      isPublic: false,
      rating: 0,
    },
    {
      id: 2,
      url: 'https://picsum.photos/seed/album2/600/400',
      isPublic: false,
      rating: 0,
    },
    {
      id: 3,
      url: 'https://picsum.photos/seed/album3/400/500',
      isPublic: false,
      rating: 0,
    },
    {
      id: 4,
      url: 'https://picsum.photos/seed/album4/500/600',
      isPublic: false,
      rating: 0,
    },
    {
      id: 5,
      url: 'https://picsum.photos/seed/album5/600/500',
      isPublic: false,
      rating: 0,
    },
    {
      id: 6,
      url: 'https://picsum.photos/seed/album6/400/600',
      isPublic: false,
      rating: 0,
    },
  ],
};

export default function AlbumDetailPage({ params }: { params: { id: string } }) {
  const [showWelcomeLetter, setShowWelcomeLetter] = useState(true);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    // 显示提示条
    const timer = setTimeout(() => {
      setShowToast(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {mockAlbum.title}
          </h1>
          <p className="text-sm text-foreground/60">
            专属返图空间 · {mockAlbum.photos.length} 张照片
          </p>
        </motion.div>

        {/* 照片网格 */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          {mockAlbum.photos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.1 }}
            >
              <Card hover className="overflow-hidden p-0">
                <div className="relative aspect-[3/4] bg-accent/10">
                  <img
                    src={photo.url}
                    alt={`照片 ${photo.id}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="accent"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <Heart className="w-4 h-4" />
                      <span className="text-xs">收藏</span>
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      className="flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className="w-4 h-4 text-primary cursor-pointer hover:fill-primary transition-all"
                      />
                    ))}
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* 手写信弹窗 */}
        <Modal isOpen={showWelcomeLetter} onClose={() => setShowWelcomeLetter(false)}>
          <div className="p-8 bg-[#FFF9E6]">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="text-center mb-6">
                <Sparkles className="w-8 h-8 text-primary mx-auto mb-2" />
                <h2 className="text-xl font-bold text-foreground">
                  来自摄影师的信
                </h2>
              </div>

              <div
                className="text-foreground/80 leading-relaxed whitespace-pre-line text-center"
                style={{ fontFamily: 'cursive' }}
              >
                {mockAlbum.welcomeLetter}
              </div>

              <div className="pt-6">
                <Button
                  onClick={() => setShowWelcomeLetter(false)}
                  variant="primary"
                  size="lg"
                  className="w-full"
                >
                  收下这份心意 💝
                </Button>
              </div>
            </motion.div>
          </div>
        </Modal>

        {/* 底部提示条 */}
        <AnimatePresence>
          {showToast && (
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-32 left-4 right-4 mx-auto max-w-md"
            >
              <Card className="bg-accent/90 backdrop-blur-sm border-accent">
                <div className="flex items-center gap-3">
                  <Sparkles className="w-5 h-5 text-accent-foreground flex-shrink-0" />
                  <p className="text-sm text-accent-foreground">
                    虽然照片 7 天后会像魔法一样消失，但如果你愿意把它挂在【照片墙】上展示，它就会被魔法定格，永远保留哦！✨
                  </p>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
