'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw } from 'lucide-react';

// 模拟数据：拍照姿势
const mockPoses = [
  {
    id: 1,
    imageUrl: 'https://picsum.photos/seed/pose1/400/600',
    tags: ['#可爱', '#对镜拍', '#少女感'],
    styles: ['可爱'],
  },
  {
    id: 2,
    imageUrl: 'https://picsum.photos/seed/pose2/400/600',
    tags: ['#文艺', '#侧脸', '#氛围感'],
    styles: ['文艺'],
  },
  {
    id: 3,
    imageUrl: 'https://picsum.photos/seed/pose3/400/600',
    tags: ['#清新', '#回眸', '#自然'],
    styles: ['清新'],
  },
  {
    id: 4,
    imageUrl: 'https://picsum.photos/seed/pose4/400/600',
    tags: ['#俏皮', '#跳跃', '#活力'],
    styles: ['俏皮'],
  },
  {
    id: 5,
    imageUrl: 'https://picsum.photos/seed/pose5/400/600',
    tags: ['#温柔', '#低头', '#治愈'],
    styles: ['温柔'],
  },
  {
    id: 6,
    imageUrl: 'https://picsum.photos/seed/pose6/400/600',
    tags: ['#酷飒', '#正面', '#自信'],
    styles: ['酷飒'],
  },
];

// 风格选项
const styleOptions = ['可爱', '文艺', '清新', '俏皮', '温柔', '酷飒'];

// 马卡龙色系
const macaronColors = [
  'bg-pink-100 text-pink-800',
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-yellow-100 text-yellow-800',
  'bg-green-100 text-green-800',
];

export default function HomePage() {
  const [currentPose, setCurrentPose] = useState(mockPoses[0]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);

  const toggleStyle = (style: string) => {
    setSelectedStyles(prev =>
      prev.includes(style)
        ? prev.filter(s => s !== style)
        : [...prev, style]
    );
  };

  const filteredPoses = selectedStyles.length === 0
    ? mockPoses
    : mockPoses.filter(pose =>
        pose.styles.some(style => selectedStyles.includes(style))
      );

  const getRandomPose = () => {
    if (filteredPoses.length === 0) return;
    setIsAnimating(true);
    setTimeout(() => {
      const randomIndex = Math.floor(Math.random() * filteredPoses.length);
      setCurrentPose(filteredPoses[randomIndex]);
      setIsAnimating(false);
    }, 300);
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/80 backdrop-blur-sm"
      >
        <div className="px-6 pt-6 pb-3">
          <h1 className="text-xl font-bold text-[#5D4037] mb-1">拾光谣</h1>
          <p className="text-xs text-[#5D4037]/50">记录此刻的不期而遇 ✨</p>
        </div>
        <div className="border-b border-dashed border-[#5D4037]/20"></div>
      </motion.div>

      {/* 主内容区 */}
      <div
        className="flex-1 flex flex-col px-6 pt-4 pb-[100px]"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E")`,
        }}
      >

        {/* 风格选择器 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-none mb-4"
        >
        <div className="flex gap-2 overflow-x-auto scrollbar-hidden">
          {styleOptions.map((style) => (
            <motion.button
              key={style}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleStyle(style)}
              animate={selectedStyles.includes(style) ? { rotate: 2 } : { rotate: 0 }}
              className={`
                flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all
                ${selectedStyles.includes(style)
                  ? 'bg-[#FFC857] text-white shadow-sm'
                  : 'bg-transparent text-[#5D4037]/50 border border-[#5D4037]/15'
                }
              `}
            >
              {style}
            </motion.button>
          ))}
        </div>
        </motion.div>

        {/* 拍立得卡片 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPose.id}
          initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: Math.random() > 0.5 ? 1 : -1 }}
          exit={{ opacity: 0, scale: 0.9, rotate: 5 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="flex-1 min-h-0 relative w-full"
        >
          <div className="bg-white p-4 pb-8 rounded-lg shadow-lg h-full flex flex-col">
            <div className="relative flex-1 bg-gray-100 overflow-hidden">
              <img
                src={currentPose.imageUrl}
                alt="拍照姿势"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="mt-4 flex-none">
              <div className="flex flex-wrap gap-2 justify-center">
                {currentPose.tags.map((tag, index) => (
                  <span
                    key={index}
                    className={`px-3 py-1 text-sm rounded-full font-medium ${
                      macaronColors[index % macaronColors.length]
                    }`}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
        </AnimatePresence>

        {/* 贴纸按钮 */}
        <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="flex-none h-20 flex items-center justify-center mt-4 z-10"
      >
        <motion.button
          onClick={getRandomPose}
          disabled={isAnimating}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95, boxShadow: '2px 2px 0px #5D4037' }}
          className="w-16 h-16 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] flex items-center justify-center disabled:opacity-50 transition-all"
        >
          {isAnimating ? (
            <RefreshCw className="w-6 h-6 text-[#5D4037] animate-spin" />
          ) : (
            <Sparkles className="w-6 h-6 text-[#5D4037]" />
          )}
        </motion.button>
        </motion.div>

        <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="flex-none text-center mt-2 text-sm text-[#5D4037]/60"
      >
        {isAnimating ? '正在切换...' : '点击换个姿势'}
        </motion.p>
      </div>
    </div>
  );
}
