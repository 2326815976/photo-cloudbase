'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';

// 模拟数据：拍照姿势
const mockPoses = [
  {
    id: 1,
    imageUrl: 'https://picsum.photos/seed/pose1/400/600',
    tags: ['#可爱', '#对镜拍', '#少女感'],
  },
  {
    id: 2,
    imageUrl: 'https://picsum.photos/seed/pose2/400/600',
    tags: ['#文艺', '#侧脸', '#氛围感'],
  },
  {
    id: 3,
    imageUrl: 'https://picsum.photos/seed/pose3/400/600',
    tags: ['#清新', '#回眸', '#自然'],
  },
  {
    id: 4,
    imageUrl: 'https://picsum.photos/seed/pose4/400/600',
    tags: ['#俏皮', '#跳跃', '#活力'],
  },
  {
    id: 5,
    imageUrl: 'https://picsum.photos/seed/pose5/400/600',
    tags: ['#温柔', '#低头', '#治愈'],
  },
  {
    id: 6,
    imageUrl: 'https://picsum.photos/seed/pose6/400/600',
    tags: ['#酷飒', '#正面', '#自信'],
  },
];

export default function HomePage() {
  const [currentPose, setCurrentPose] = useState(mockPoses[0]);
  const [isAnimating, setIsAnimating] = useState(false);

  const getRandomPose = () => {
    setIsAnimating(true);
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * mockPoses.length);
      setCurrentPose(mockPoses[randomIndex]);
      setIsAnimating(false);
    }, 300);
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* Hero 区域 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-3xl font-bold mb-2 text-foreground">
            拾光谣
          </h1>
          <p className="text-foreground/70 text-sm">
            记录此刻的不期而遇 ✨
          </p>
        </motion.div>

        {/* 姿势卡片 */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPose.id}
            initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.9, rotate: 5 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          >
            <Card className="overflow-hidden">
              <div className="relative aspect-[2/3] bg-accent/10">
                <img
                  src={currentPose.imageUrl}
                  alt="拍照姿势"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="mt-4">
                <div className="flex flex-wrap gap-2">
                  {currentPose.tags.map((tag, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-accent/20 text-foreground text-sm rounded-full border border-accent"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>
        </AnimatePresence>

        {/* 换姿势按钮 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6"
        >
          <Button
            onClick={getRandomPose}
            disabled={isAnimating}
            variant="primary"
            size="lg"
            className="w-full flex items-center justify-center gap-2"
          >
            {isAnimating ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <Sparkles className="w-5 h-5" />
            )}
            <span>{isAnimating ? '正在切换...' : '✨ 换个姿势'}</span>
          </Button>
        </motion.div>

        {/* 专属空间入口 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-8 text-center"
        >
          <a
            href="/album"
            className="inline-flex items-center gap-2 text-secondary hover:text-secondary/80 transition-colors"
          >
            <span className="text-sm">🔐 进入专属返图空间</span>
          </a>
        </motion.div>
      </div>
    </div>
  );
}
