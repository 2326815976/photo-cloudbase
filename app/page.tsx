'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, X } from 'lucide-react';

// 模拟数据：拍照姿势
const mockPoses = [
  {
    id: 1,
    imageUrl: 'https://picsum.photos/seed/pose1/400/600',
    tags: ['#可爱', '#对镜拍', '#少女感'],
    styles: ['可爱'],
    rotation: -1.2,
  },
  {
    id: 2,
    imageUrl: 'https://picsum.photos/seed/pose2/400/600',
    tags: ['#文艺', '#侧脸', '#氛围感'],
    styles: ['文艺'],
    rotation: 0.8,
  },
  {
    id: 3,
    imageUrl: 'https://picsum.photos/seed/pose3/400/600',
    tags: ['#清新', '#回眸', '#自然'],
    styles: ['清新'],
    rotation: -0.5,
  },
  {
    id: 4,
    imageUrl: 'https://picsum.photos/seed/pose4/400/600',
    tags: ['#俏皮', '#跳跃', '#活力'],
    styles: ['俏皮'],
    rotation: 1.5,
  },
  {
    id: 5,
    imageUrl: 'https://picsum.photos/seed/pose5/400/600',
    tags: ['#温柔', '#低头', '#治愈'],
    styles: ['温柔'],
    rotation: -0.9,
  },
  {
    id: 6,
    imageUrl: 'https://picsum.photos/seed/pose6/400/600',
    tags: ['#酷飒', '#正面', '#自信'],
    styles: ['酷飒'],
    rotation: 1.1,
  },
];

// 风格选项（带emoji装饰）
const styleOptions = [
  { label: '可爱', emoji: '🌸' },
  { label: '文艺', emoji: '📖' },
  { label: '清新', emoji: '🍃' },
  { label: '俏皮', emoji: '✨' },
  { label: '温柔', emoji: '🌙' },
  { label: '酷飒', emoji: '⚡' },
];

// 手账风格色系（温暖复古色调）
const journalColors = [
  'bg-[#FFE5E5] text-[#8B4545] border-[#D4A5A5]',
  'bg-[#FFF4E0] text-[#8B6F47] border-[#D4B896]',
  'bg-[#F0E6FF] text-[#6B4B8B] border-[#B89FD4]',
  'bg-[#E8F5E9] text-[#4B7C4F] border-[#9FC5A1]',
  'bg-[#FFF0F5] text-[#8B5A6B] border-[#D4A5B5]',
];

export default function HomePage() {
  const [currentPose, setCurrentPose] = useState(mockPoses[0]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [selectedStyles, setSelectedStyles] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  const toggleStyle = (styleLabel: string) => {
    setSelectedStyles(prev =>
      prev.includes(styleLabel)
        ? prev.filter(s => s !== styleLabel)
        : [...prev, styleLabel]
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
    <div className="flex flex-col h-[100dvh] w-full">
      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>拾光谣</h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">✨ 记录此刻的不期而遇 ✨</p>
          </div>
        </div>
      </motion.div>

      {/* 主内容区 */}
      <div
        className="flex-1 flex flex-col px-5 pt-3 pb-3 min-h-0"
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
        <div className="flex gap-2 overflow-x-auto scrollbar-hidden relative">
          {/* 滚动渐变提示 */}
          <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-[#FFFBF0] to-transparent pointer-events-none z-10" />
          {styleOptions.map((style) => (
            <motion.button
              key={style.label}
              whileTap={{ scale: 0.95 }}
              onClick={() => toggleStyle(style.label)}
              animate={selectedStyles.includes(style.label) ? { rotate: 1.5 } : { rotate: 0 }}
              className={`
                flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1
                ${selectedStyles.includes(style.label)
                  ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                  : 'bg-white/60 text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
                }
              `}
              style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}
            >
              <span className="text-sm">{style.emoji}</span>
              <span>{style.label}</span>
            </motion.button>
          ))}
        </div>
        </motion.div>

        {/* 拍立得卡片 */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentPose.id}
          initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
          animate={{ opacity: 1, scale: 1, rotate: currentPose.rotation }}
          exit={{ opacity: 0, scale: 0.9, rotate: 5 }}
          transition={{ type: 'spring', damping: 20, stiffness: 300 }}
          className="flex-1 min-h-0 relative w-full mb-4"
        >
          {/* 和纸胶带装饰 */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-[#FFC857]/40 backdrop-blur-sm rounded-sm shadow-sm rotate-[-2deg] z-10" />

          <div className="bg-white p-3 pb-5 rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.12)] hover:shadow-[0_12px_40px_rgba(93,64,55,0.16)] transition-shadow duration-300 h-full flex flex-col relative">
            {/* 手账贴纸装饰 */}
            <div className="absolute top-1 right-1 text-xl opacity-20 rotate-12">📷</div>

            <div
              className="relative flex-1 bg-white overflow-hidden cursor-pointer rounded-sm"
              onClick={() => setShowPreview(true)}
            >
              <img
                src={currentPose.imageUrl}
                alt="拍照姿势"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="mt-3 flex-none">
              <div className="flex flex-wrap gap-2 justify-center">
                {currentPose.tags.map((tag, index) => (
                  <motion.span
                    key={index}
                    initial={{ opacity: 0, scale: 0.8, rotate: -5 }}
                    animate={{ opacity: 1, scale: 1, rotate: index % 2 === 0 ? -1.5 : 1.5 }}
                    transition={{ delay: index * 0.1 }}
                    className={`px-2.5 py-1 text-xs rounded-2xl font-bold shadow-[2px_2px_0px_rgba(93,64,55,0.1)] border-2 ${
                      journalColors[index % journalColors.length]
                    }`}
                    style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}
                  >
                    {tag}
                  </motion.span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
        </AnimatePresence>

        {/* 底部固定区域：按钮 + 文字 */}
        <div className="flex-none pb-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="flex items-center justify-center mb-3"
          >
            <motion.button
              onClick={getRandomPose}
              disabled={isAnimating}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95, boxShadow: '2px 2px 0px #5D4037' }}
              className="w-14 h-14 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] flex items-center justify-center disabled:opacity-50 transition-all"
            >
              {isAnimating ? (
                <RefreshCw className="w-5 h-5 text-[#5D4037] animate-spin" />
              ) : (
                <Sparkles className="w-5 h-5 text-[#5D4037]" />
              )}
            </motion.button>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center text-sm text-[#5D4037]/70 font-medium"
            style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}
          >
            {isAnimating ? '正在切换...' : '点击换个姿势'}
          </motion.p>
        </div>
      </div>

      {/* 图片预览弹窗 */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowPreview(false)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          >
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={() => setShowPreview(false)}
              className="absolute top-6 right-6 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors"
            >
              <X className="w-6 h-6 text-white" />
            </motion.button>
            <motion.img
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              src={currentPose.imageUrl}
              alt="预览"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
