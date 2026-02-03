'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import SimpleImage from '@/components/ui/SimpleImage';

const journalColors = [
  'bg-[#FFE5E5] text-[#8B4545] border-[#D4A5A5]',
  'bg-[#FFF4E0] text-[#8B6F47] border-[#D4B896]',
  'bg-[#F0E6FF] text-[#6B4B8B] border-[#B89FD4]',
  'bg-[#E8F5E9] text-[#4B7C4F] border-[#9FC5A1]',
  'bg-[#FFF0F5] text-[#8B5A6B] border-[#D4A5B5]',
];

const MAX_PRELOADED_IMAGES = 5;

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

interface PoseViewerProps {
  initialTags: PoseTag[];
  initialPose: Pose | null;
  initialPoses: Pose[];
}

export default function PoseViewer({ initialTags, initialPose, initialPoses }: PoseViewerProps) {
  const [tags, setTags] = useState<PoseTag[]>(initialTags);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [currentPose, setCurrentPose] = useState<Pose | null>(initialPose);
  const [lastPoseId, setLastPoseId] = useState<number | null>(initialPose?.id || null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [cachedPoses, setCachedPoses] = useState<Pose[]>(initialPoses);
  const [cacheKey, setCacheKey] = useState<string>('');
  const [nextPose, setNextPose] = useState<Pose | null>(null);
  const preloadedImagesRef = useRef<Set<string>>(new Set());
  const selectedTagsKey = useMemo(() => [...selectedTags].sort().join(','), [selectedTags]);

  const preloadImage = useCallback((url: string) => {
    // 禁用预加载，只加载当前显示的图片
    return;
  }, []);

  // 客户端加载tags
  useEffect(() => {
    if (initialTags.length === 0) {
      const loadTags = async () => {
        const supabase = createClient();
        const { data } = await supabase.from('pose_tags').select('*').order('usage_count', { ascending: false });
        if (data) setTags(data);
      };
      loadTags();
    }
  }, [initialTags.length]);

  const selectNextPose = useCallback((poses: Pose[], excludeIds: number[]) => {
    if (poses.length === 0) return null;

    const availablePoses = poses.filter(p => !excludeIds.includes(p.id));
    if (availablePoses.length === 0) return poses[0];

    const randomIndex = Math.floor(Math.random() * availablePoses.length);
    return availablePoses[randomIndex];
  }, []);

  const toggleTag = useCallback((tagName: string) => {
    setSelectedTags(prev => {
      if (prev.includes(tagName)) {
        return prev.filter(t => t !== tagName);
      } else {
        if (prev.length >= 3) {
          return prev;
        }
        return [...prev, tagName];
      }
    });
  }, []);

  const getRandomPose = useCallback(async () => {
    if (isAnimating) return;

    setIsAnimating(true);

    try {
      const supabase = createClient();
      if (!supabase) return;

      const currentCacheKey = selectedTagsKey;
      let poses: Pose[] = [];

      if (nextPose && cacheKey === currentCacheKey) {
        setCurrentPose({ ...nextPose, view_count: nextPose.view_count + 1 });
        setLastPoseId(nextPose.id);

        supabase
          .from('poses')
          .update({ view_count: nextPose.view_count + 1 })
          .eq('id', nextPose.id)
          .then(() => {})
          .catch((err: any) => console.error('更新浏览次数失败:', err));

        const next = selectNextPose(cachedPoses, [nextPose.id, lastPoseId].filter(Boolean) as number[]);
        if (next) {
          setNextPose(next);
          preloadImage(next.image_url);
        }

        return;
      }

      if (cacheKey === currentCacheKey && cachedPoses.length > 0) {
        poses = cachedPoses;
      } else {
        if (selectedTags.length === 0) {
          const { data } = await supabase.from('poses').select('*');
          if (data) poses = data;
        } else {
          const { data: exactMatches } = await supabase
            .from('poses')
            .select('*')
            .contains('tags', selectedTags);

          if (exactMatches && exactMatches.length > 0) {
            poses = exactMatches;
          } else {
            const { data: fuzzyMatches } = await supabase
              .from('poses')
              .select('*')
              .overlaps('tags', selectedTags);

            if (fuzzyMatches) poses = fuzzyMatches;
          }
        }

        setCachedPoses(poses);
        setCacheKey(currentCacheKey);
      }

      if (poses.length > 0) {
        let availablePoses = poses;
        if (poses.length > 1 && lastPoseId !== null) {
          const filtered = poses.filter(p => p.id !== lastPoseId);
          if (filtered.length > 0) availablePoses = filtered;
        }

        const randomIndex = Math.floor(Math.random() * availablePoses.length);
        const selectedPose = availablePoses[randomIndex];

        setCurrentPose({ ...selectedPose, view_count: selectedPose.view_count + 1 });
        setLastPoseId(selectedPose.id);

        supabase
          .from('poses')
          .update({ view_count: selectedPose.view_count + 1 })
          .eq('id', selectedPose.id)
          .then(() => {})
          .catch((err: any) => console.error('更新浏览次数失败:', err));

        const next = selectNextPose(poses, [selectedPose.id]);
        if (next) {
          setNextPose(next);
          preloadImage(next.image_url);
        }
      }
    } catch (error) {
      console.error('抽取摆姿失败:', error);
    } finally {
      setIsAnimating(false);
    }
  }, [isAnimating, selectedTags, selectedTagsKey, cacheKey, cachedPoses, nextPose, lastPoseId, selectNextPose, preloadImage]);

  const displayTags = useMemo(() => tags.slice(0, 8), [tags]);

  return (
    <div className="flex flex-col h-[100dvh] w-full">
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

      <div
        className="flex-1 flex flex-col px-5 pt-3 pb-3 min-h-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 400 400' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='0.03'/%3E%3C/svg%3E")`,
        }}
      >
        <div className="flex-none mb-4" style={{ contain: 'layout style' }}>
          <div className="flex items-center gap-2">
            <div className="flex-1 overflow-x-auto scrollbar-hidden" style={{ willChange: 'scroll-position' }}>
              <div className="flex gap-2 pb-1">
                {displayTags.map((tag) => (
                  <button
                    key={tag.id}
                    onClick={() => toggleTag(tag.name)}
                    className={`
                      tag-button flex-shrink-0 px-2 py-0.5 md:px-3 md:py-1.5 rounded-full text-xs font-bold transition-colors
                      ${selectedTags.includes(tag.name)
                        ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                        : 'bg-white/60 text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
                      }
                    `}
                    style={{ transform: 'translateZ(0)' }}
                  >
                    {tag.name}
                  </button>
                ))}
              </div>
            </div>

            {tags.length > 0 && (
              <button
                onClick={() => setShowTagSelector(true)}
                className="tag-button flex-shrink-0 px-2 py-0.5 md:px-3 md:py-1.5 rounded-full text-xs font-bold transition-colors bg-[#5D4037] text-white border-2 border-[#5D4037] flex items-center gap-1"
              >
                全部
              </button>
            )}
          </div>
        </div>

        {currentPose && (
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPose.id}
              initial={{ opacity: 0, scale: 0.9, rotate: -5 }}
              animate={{ opacity: 1, scale: 1, rotate: (currentPose.id % 3 - 1) * 1.2 }}
              exit={{ opacity: 0, scale: 0.9, rotate: 5 }}
              transition={{ type: 'spring', damping: 20, stiffness: 300 }}
              className="flex-1 min-h-0 relative w-full mb-4"
              style={{ willChange: 'transform, opacity' }}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-20 h-6 bg-[#FFC857]/40 backdrop-blur-sm rounded-sm shadow-sm rotate-[-2deg] z-10" style={{ transform: 'translateZ(0)' }} />

              <div className="bg-white p-3 pb-5 rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.12)] hover:shadow-[0_12px_40px_rgba(93,64,55,0.16)] transition-shadow duration-300 h-full flex flex-col relative" style={{ transform: 'translateZ(0)' }}>
                <div className="absolute top-1 right-1 text-xl opacity-20 rotate-12">📷</div>

                <div
                  className="relative flex-1 bg-white overflow-hidden cursor-pointer rounded-sm"
                  onClick={() => setShowPreview(true)}
                  style={{ contain: 'layout style paint' }}
                >
                  <SimpleImage
                    src={currentPose.image_url}
                    alt="拍照姿势"
                    priority={true}
                    className="w-full h-full"
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
              style={{ willChange: 'transform', transform: 'translateZ(0)' }}
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

      <AnimatePresence>
        {showPreview && currentPose && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPreview(false)}
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
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#FFC857]/40 backdrop-blur-sm rounded-sm shadow-sm rotate-[-1deg] z-10" />

                <button
                  onClick={() => setShowPreview(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors z-20"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>

                <div className="p-4 pb-3">
                  <div className="relative bg-white rounded-lg overflow-hidden shadow-inner">
                    <SimpleImage
                      src={currentPose.image_url}
                      alt="预览"
                      priority={true}
                      className="w-full h-auto max-h-[70vh]"
                    />
                  </div>
                </div>

                <div className="px-4 pb-4 border-t-2 border-dashed border-[#5D4037]/10 pt-3 bg-white/50">
                  <div className="flex items-center justify-center gap-6 text-[#5D4037]">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4" />
                      <span className="text-sm font-medium">摆姿参考</span>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showTagSelector && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowTagSelector(false)}
              className="fixed inset-0 bg-black/30 z-40"
            />

            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed top-[72px] left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-5"
              style={{ willChange: 'transform, opacity' }}
            >
              <div className="bg-[#FFFBF0] rounded-2xl shadow-[0_8px_30px_rgba(93,64,55,0.2)] border-2 border-[#5D4037]/10 max-h-[60vh] overflow-hidden flex flex-col" style={{ transform: 'translateZ(0)' }}>
                <div className="flex items-center justify-between p-4 border-b-2 border-dashed border-[#5D4037]/15">
                  <h3 className="text-lg font-bold text-[#5D4037]">选择标签</h3>
                  <button
                    onClick={() => setShowTagSelector(false)}
                    className="w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors"
                    style={{ transform: 'translateZ(0)' }}
                  >
                    <X className="w-5 h-5 text-[#5D4037]" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4" style={{ contain: 'layout style paint', willChange: 'scroll-position' }}>
                  <div className="grid grid-cols-3 gap-3">
                    {tags.map((tag) => (
                      <button
                        key={tag.id}
                        onClick={() => toggleTag(tag.name)}
                        className={`
                          px-4 py-3 rounded-2xl text-sm font-bold transition-colors
                          ${selectedTags.includes(tag.name)
                            ? 'bg-[#FFC857] text-[#5D4037] shadow-[2px_2px_0px_rgba(93,64,55,0.15)] border-2 border-[#5D4037]/20'
                            : 'bg-white text-[#5D4037]/60 border-2 border-dashed border-[#5D4037]/15'
                          }
                        `}
                        style={{ transform: 'translateZ(0)' }}
                      >
                        {tag.name}
                      </button>
                    ))}
                  </div>
                </div>

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
