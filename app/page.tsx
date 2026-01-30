'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, X, ChevronDown, ChevronUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

// 手账风格色系（温暖复古色调）
const journalColors = [
  'bg-[#FFE5E5] text-[#8B4545] border-[#D4A5A5]',
  'bg-[#FFF4E0] text-[#8B6F47] border-[#D4B896]',
  'bg-[#F0E6FF] text-[#6B4B8B] border-[#B89FD4]',
  'bg-[#E8F5E9] text-[#4B7C4F] border-[#9FC5A1]',
  'bg-[#FFF0F5] text-[#8B5A6B] border-[#D4A5B5]',
];

interface PoseTag {
  id: number;
  name: string;
  usage_count: number;
}

interface Pose {
  id: number;
  image_url: string;
  tags: string[];
  storage_path: string;
  view_count: number;
  created_at: string;
}

export default function HomePage() {
  const [tags, setTags] = useState<PoseTag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPose, setCurrentPose] = useState<Pose | null>(null);
  const [lastPoseId, setLastPoseId] = useState<number | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cachedPoses, setCachedPoses] = useState<Pose[]>([]);
  const [cacheKey, setCacheKey] = useState<string>('');

  // 加载标签
  useEffect(() => {
    loadTags();
  }, []);

  const loadTags = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('pose_tags')
      .select('*')
      .order('usage_count', { ascending: false });

    if (!error && data) {
      setTags(data);
    }
    setLoading(false);
  };

  const toggleTag = (tagName: string) => {
    setSelectedTags(prev =>
      prev.includes(tagName)
        ? prev.filter(t => t !== tagName)
        : [...prev, tagName]
    );
  };

  const getRandomPose = async () => {
    if (isAnimating) return;

    setIsAnimating(true);
    const supabase = createClient();

    try {
      // 生成缓存键（基于选中的标签）
      const currentCacheKey = selectedTags.sort().join(',');
      let poses: Pose[] = [];

      // 检查缓存：如果标签选择未改变且有缓存数据，直接使用缓存
      if (cacheKey === currentCacheKey && cachedPoses.length > 0) {
        poses = cachedPoses;
      } else {
        // 标签改变或无缓存，重新查询数据库
        if (selectedTags.length === 0) {
          const { data } = await supabase.from('poses').select('*');
          if (data) poses = data;
        } else {
          // 先尝试精确匹配
          const { data: exactMatches } = await supabase
            .from('poses')
            .select('*')
            .contains('tags', selectedTags);

          if (exactMatches && exactMatches.length > 0) {
            poses = exactMatches;
          } else {
            // 模糊匹配
            const { data: fuzzyMatches } = await supabase
              .from('poses')
              .select('*')
              .overlaps('tags', selectedTags);

            if (fuzzyMatches) poses = fuzzyMatches;
          }
        }

        // 更新缓存
        setCachedPoses(poses);
        setCacheKey(currentCacheKey);
      }

      if (poses.length > 0) {
        // 排除上一次的摆姿
        let availablePoses = poses;
        if (poses.length > 1 && lastPoseId !== null) {
          const filtered = poses.filter(p => p.id !== lastPoseId);
          if (filtered.length > 0) availablePoses = filtered;
        }

        // 前端随机选择
        const randomIndex = Math.floor(Math.random() * availablePoses.length);
        const selectedPose = availablePoses[randomIndex];

        // 立即更新UI
        setCurrentPose({ ...selectedPose, view_count: selectedPose.view_count + 1 });
        setLastPoseId(selectedPose.id);

        // 异步更新浏览次数
        supabase
          .from('poses')
          .update({ view_count: selectedPose.view_count + 1 })
          .eq('id', selectedPose.id)
          .then(() => {})
          .catch((err: any) => console.error('更新浏览次数失败:', err));
      }
    } catch (error) {
      console.error('抽取摆姿失败:', error);
    } finally {
      setIsAnimating(false);
    }
  };

  // 初始加载一个随机摆姿
  useEffect(() => {
    if (!loading && !currentPose) {
      getRandomPose();
    }
  }, [loading]);

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

        {/* 标签选择器 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-none mb-4"
        >
          <div className="flex items-center gap-2">
            {/* 横向滚动标签区域 */}
            <div className="flex-1 overflow-x-auto scrollbar-hidden">
              <div className="flex gap-2 pb-1">
                {tags.slice(0, 8).map((tag) => (
                  <motion.button
                    key={tag.id}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => toggleTag(tag.name)}
                    animate={selectedTags.includes(tag.name) ? { rotate: 1.5 } : { rotate: 0 }}
                    className={`
                      flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all
                      ${selectedTags.includes(tag.name)
                        ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                        : 'bg-white/60 text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
                      }
                    `}
                  >
                    {tag.name}
                  </motion.button>
                ))}
              </div>
            </div>

            {/* 全部标签按钮 */}
            {tags.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowTagSelector(true)}
                className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-all bg-[#5D4037] text-white border-2 border-[#5D4037] flex items-center gap-1"
              >
                全部
              </motion.button>
            )}
          </div>
        </motion.div>

        {/* 拍立得卡片 */}
        {currentPose && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPose.id}
              initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: (currentPose.id % 3 - 1) * 1.2 }}
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
                    src={currentPose.image_url}
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
                      >
                        {tag}
                      </motion.span>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        )}

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
          >
            {isAnimating ? '正在切换...' : '点击换个姿势'}
          </motion.p>
        </div>
      </div>

      {/* 图片预览弹窗 */}
      <AnimatePresence>
        {showPreview && currentPose && (
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
              src={currentPose.image_url}
              alt="预览"
              className="max-w-full max-h-full object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 底部抽屉式标签选择器 */}
      <AnimatePresence>
        {showTagSelector && (
          <>
            {/* 遮罩层 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTagSelector(false)}
              className="fixed inset-0 bg-black/30 z-40"
            />

            {/* 向下展开的标签面板 */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-5"
            >
              <div className="bg-[#FFFBF0] rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.2)] border-2 border-[#5D4037]/10 max-h-[60vh] overflow-hidden flex flex-col">
                {/* 标题栏 */}
                <div className="flex items-center justify-between p-4 border-b-2 border-dashed border-[#5D4037]/15">
                  <h3 className="text-lg font-bold text-[#5D4037]">选择标签</h3>
                  <button
                    onClick={() => setShowTagSelector(false)}
                    className="w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors"
                  >
                    <X className="w-5 h-5 text-[#5D4037]" />
                  </button>
                </div>

                {/* 标签网格 */}
                <div className="flex-1 overflow-y-auto p-4">
                  <div className="grid grid-cols-3 gap-3">
                    {tags.map((tag) => (
                      <motion.button
                        key={tag.id}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => toggleTag(tag.name)}
                        className={`
                          px-4 py-3 rounded-2xl text-sm font-bold transition-all
                          ${selectedTags.includes(tag.name)
                            ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                            : 'bg-white text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
                          }
                        `}
                      >
                        {tag.name}
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* 底部操作栏 */}
                <div className="p-4 border-t-2 border-dashed border-[#5D4037]/15 bg-white/50">
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setSelectedTags([]);
                        setShowTagSelector(false);
                      }}
                      className="flex-1 py-3 rounded-full bg-white text-[#5D4037] border-2 border-[#5D4037]/20 font-bold hover:bg-[#5D4037]/5 transition-colors"
                    >
                      清空选择
                    </button>
                    <button
                      onClick={() => setShowTagSelector(false)}
                      className="flex-1 py-3 rounded-full bg-[#FFC857] text-[#5D4037] border-2 border-[#5D4037]/20 font-bold hover:shadow-md transition-shadow"
                    >
                      确定 {selectedTags.length > 0 && `(${selectedTags.length})`}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
