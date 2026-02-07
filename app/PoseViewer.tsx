'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, RefreshCw, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import SimpleImage from '@/components/ui/SimpleImage';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { SplashScreen } from '@capacitor/splash-screen';

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
  created_at?: string;
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
  const [recentPoseIds, setRecentPoseIds] = useState<number[]>(initialPose?.id ? [initialPose.id] : []);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [cachedPoses, setCachedPoses] = useState<Pose[]>(initialPoses);
  const [cacheKey, setCacheKey] = useState<string>('__initial__');
  const [shakeEnabled, setShakeEnabled] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);
  const selectedTagsKey = useMemo(() => [...selectedTags].sort().join(','), [selectedTags]);
  const lastShakeTimeRef = useRef(0);

  const HISTORY_SIZE = 5;
  const SHAKE_THRESHOLD = 15;
  const SHAKE_COOLDOWN = 2000; // 2秒冷却时间

  // 隐藏启动画面
  useEffect(() => {
    const hideSplash = async () => {
      try {
        await SplashScreen.hide();
      } catch (error) {
        // 非Capacitor环境下会报错，忽略即可
      }
    };

    // 延迟确保首屏内容已渲染
    const timer = setTimeout(hideSplash, 500);
    return () => clearTimeout(timer);
  }, []);

  // 客户端加载tags（延迟加载完整标签列表）
  useEffect(() => {
    if (initialTags.length === 0) {
      const loadTags = async () => {
        const supabase = createClient();
        const { data } = await supabase.from('pose_tags').select('*').order('usage_count', { ascending: false });
        if (data) setTags(data);
      };
      loadTags();
    } else if (initialTags.length >= 20) {
      // 首屏已加载 20 个热门标签，延迟加载完整列表
      const loadAllTags = async () => {
        const supabase = createClient();
        const { data } = await supabase.from('pose_tags').select('*').order('usage_count', { ascending: false });
        if (data && data.length > initialTags.length) {
          setTags(data); // 更新为完整列表
        }
      };

      // 首屏渲染后 1 秒再加载完整标签
      setTimeout(loadAllTags, 1000);
    }
  }, [initialTags.length]);

  // 标签变化时清空历史记录，避免新标签的摆姿被错误过滤
  useEffect(() => {
    setRecentPoseIds([]);
  }, [selectedTagsKey]);

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

    const supabase = createClient();
    if (!supabase) return;

    setIsAnimating(true);

    try {
      // 性能测量：开始计时
      const queryStartTime = performance.now();

      const currentCacheKey = selectedTagsKey;
      let poses: Pose[] = [];

      if (cacheKey === currentCacheKey && cachedPoses.length > 0) {
        poses = cachedPoses;
      } else {
        if (selectedTags.length === 0) {
          // 无标签随机：使用随机键索引法
          const r = Math.random();
          let { data } = await supabase
            .from('poses')
            .select('id, image_url, tags, view_count, rand_key')
            .gte('rand_key', r)
            .order('rand_key')
            .limit(1);

          // 兜底：如果没有结果，从头开始查
          if (!data || data.length === 0) {
            const { data: fallback } = await supabase
              .from('poses')
              .select('id, image_url, tags, view_count, rand_key')
              .order('rand_key')
              .limit(1);
            data = fallback;
          }

          if (data) poses = data;
        } else {
          // 有标签随机：两段式策略
          // 第一段：先用标签过滤拿候选集（100 条）
          const { data: candidates } = await supabase
            .from('poses')
            .select('id, image_url, tags, view_count, rand_key')
            .overlaps('tags', selectedTags)
            .limit(100);

          if (candidates && candidates.length > 0) {
            // 第二段：在候选集中用随机键随机
            const r = Math.random();
            const filtered = candidates.filter((p: any) => p.rand_key >= r);

            let allMatches = candidates;
            if (filtered.length > 0) {
              // 按 rand_key 排序取第一个
              filtered.sort((a: any, b: any) => a.rand_key - b.rand_key);
              allMatches = [filtered[0], ...candidates.filter((p: any) => p.id !== filtered[0].id)];
            } else {
              // 兜底：从候选集中随机选一个
              const randomIndex = Math.floor(Math.random() * candidates.length);
              allMatches = [candidates[randomIndex], ...candidates.filter((p: any, i: number) => i !== randomIndex)];
            }

            // 保留原有的精确匹配逻辑
            if (allMatches && allMatches.length > 0) {
            // 精确匹配逻辑
            if (selectedTags.length === 1) {
              let filtered = allMatches.filter((p: any) => p.tags.length === 1 && p.tags.includes(selectedTags[0]));
              if (filtered.length === 0) {
                filtered = allMatches.filter((p: any) => (p.tags.length === 2 || p.tags.length === 3) && p.tags.includes(selectedTags[0]));
              }
              poses = filtered.length > 0 ? filtered : allMatches;
            } else if (selectedTags.length === 2 || selectedTags.length === 3) {
              let filtered = allMatches.filter((p: any) =>
                (p.tags.length === 2 || p.tags.length === 3) &&
                selectedTags.every(tag => p.tags.includes(tag))
              );
              if (filtered.length === 0) {
                filtered = allMatches.filter((p: any) =>
                  (p.tags.length === 1 || p.tags.length === 2) &&
                  selectedTags.some(tag => p.tags.includes(tag))
                );
              }
              poses = filtered.length > 0 ? filtered : allMatches;
            } else {
              poses = allMatches;
            }

            // 兜底策略：如果精确匹配结果太少（< 5 条），放宽到所有匹配
            if (poses.length < 5 && poses.length < allMatches.length) {
              console.log('[兜底] 精确匹配结果不足，使用所有匹配结果');
              poses = allMatches;
            }
            }
          } else {
            // 兜底策略：如果 100 条都没有匹配，再查询更多（最多 200 条）
            console.log('[兜底] 前 100 条无匹配，扩大查询范围');
            const { data: moreMatches } = await supabase
              .from('poses')
              .select('id, image_url, tags, view_count, rand_key')
              .overlaps('tags', selectedTags)
              .limit(200);

            if (moreMatches && moreMatches.length > 0) {
              const randomIndex = Math.floor(Math.random() * moreMatches.length);
              poses = [moreMatches[randomIndex]];
            }
          }
        }

        setCachedPoses(poses);
        setCacheKey(currentCacheKey);
      }

      if (poses.length > 0) {
        let availablePoses = poses.filter(p => !recentPoseIds.includes(p.id));
        if (availablePoses.length === 0) availablePoses = poses;

        const randomIndex = Math.floor(Math.random() * availablePoses.length);
        const selectedPose = availablePoses[randomIndex];

        setCurrentPose({ ...selectedPose, view_count: selectedPose.view_count + 1 });
        setRecentPoseIds(prev => [selectedPose.id, ...prev].slice(0, HISTORY_SIZE));

        supabase
          .from('poses')
          .update({ view_count: selectedPose.view_count + 1 })
          .eq('id', selectedPose.id)
          .then(() => {})
          .catch((err: any) => console.error('更新浏览次数失败:', err));

        // 性能测量：输出查询耗时
        const queryEndTime = performance.now();
        const queryDuration = queryEndTime - queryStartTime;
        console.log(`[性能测量] 随机查询耗时: ${queryDuration.toFixed(2)}ms`);
        console.log(`[性能测量] 标签: ${selectedTags.length > 0 ? selectedTags.join(', ') : '无'}`);
        console.log(`[性能测量] 结果数量: ${poses.length}`);
      }
    } catch (error) {
      console.error('抽取摆姿失败:', error);
    } finally {
      setIsAnimating(false);
    }
  }, [isAnimating, selectedTags, selectedTagsKey, cacheKey, cachedPoses, recentPoseIds, HISTORY_SIZE]);

  // 摇一摇检测 - 必须在getRandomPose定义之后
  useEffect(() => {
    if (!shakeEnabled) return;

    let lastX = 0, lastY = 0, lastZ = 0;
    let lastTime = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const acceleration = event.accelerationIncludingGravity;
      if (!acceleration) return;

      const currentTime = Date.now();

      // 基础防抖：100ms内不重复检测
      if (currentTime - lastTime < 100) return;

      const deltaX = Math.abs((acceleration.x || 0) - lastX);
      const deltaY = Math.abs((acceleration.y || 0) - lastY);
      const deltaZ = Math.abs((acceleration.z || 0) - lastZ);

      // 检测到摇动
      if (deltaX + deltaY + deltaZ > SHAKE_THRESHOLD) {
        // 冷却时间检查：3秒内不重复触发
        if (currentTime - lastShakeTimeRef.current < SHAKE_COOLDOWN) {
          return;
        }

        // 触发震动反馈
        if (navigator.vibrate) {
          navigator.vibrate(200); // 震动200ms
        }

        // 设置摇动状态
        setIsShaking(true);
        lastShakeTimeRef.current = currentTime;

        // 触发切换
        getRandomPose();

        // 500ms后重置摇动状态
        setTimeout(() => setIsShaking(false), 500);
      }

      lastX = acceleration.x || 0;
      lastY = acceleration.y || 0;
      lastZ = acceleration.z || 0;
      lastTime = currentTime;
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [shakeEnabled, getRandomPose, SHAKE_THRESHOLD, SHAKE_COOLDOWN]);

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
                  onClick={() => setShowFullscreen(true)}
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
                  <div
                    className="relative bg-white rounded-lg overflow-hidden shadow-inner cursor-pointer"
                    onClick={() => setShowFullscreen(true)}
                  >
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

      {/* 全屏高清预览弹窗 */}
      <AnimatePresence>
        {showFullscreen && currentPose && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={(e) => {
              // 延迟单击处理，避免与双击冲突
              if (clickTimer) {
                // 检测到双击，清除单击定时器
                clearTimeout(clickTimer);
                setClickTimer(null);
              } else {
                // 单击，设置300ms延迟
                const timer = setTimeout(() => {
                  setShowFullscreen(false);
                  setScale(1);
                  setPosition({ x: 0, y: 0 });
                  setClickTimer(null);
                }, 300);
                setClickTimer(timer);
              }
            }}
            className="fixed inset-0 bg-black z-[60] flex items-center justify-center"
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                setIsDragging(true);
                setDragStart({
                  x: e.touches[0].clientX - position.x,
                  y: e.touches[0].clientY - position.y
                });
              } else if (e.touches.length === 2) {
                setIsDragging(false);
                const distance = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY
                );
                setLastTouchDistance(distance);
              }
            }}
            onTouchMove={(e) => {
              if (e.touches.length === 1 && isDragging) {
                setPosition({
                  x: e.touches[0].clientX - dragStart.x,
                  y: e.touches[0].clientY - dragStart.y
                });
              } else if (e.touches.length === 2) {
                e.preventDefault();
                const distance = Math.hypot(
                  e.touches[0].clientX - e.touches[1].clientX,
                  e.touches[0].clientY - e.touches[1].clientY
                );
                if (lastTouchDistance > 0) {
                  const delta = (distance - lastTouchDistance) * 0.01;
                  setScale(prev => Math.max(1, Math.min(3, prev + delta)));
                }
                setLastTouchDistance(distance);
              }
            }}
            onTouchEnd={(e) => {
              if (e.touches.length === 0) {
                setIsDragging(false);
                setLastTouchDistance(0);
              } else if (e.touches.length === 1) {
                setLastTouchDistance(0);
                setIsDragging(true);
                setDragStart({
                  x: e.touches[0].clientX - position.x,
                  y: e.touches[0].clientY - position.y
                });
              }
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative w-full h-full flex items-center justify-center overflow-hidden"
            >
              <button
                onClick={() => {
                  setShowFullscreen(false);
                  setScale(1);
                  setPosition({ x: 0, y: 0 });
                }}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors z-10"
              >
                <X className="w-6 h-6 text-white" />
              </button>

              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
                <p className="text-white text-xs">双指缩放</p>
              </div>

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
                <span className="text-white text-sm font-medium">
                  {Math.round(scale * 100)}%
                </span>
              </div>

              <img
                src={currentPose.image_url}
                alt="全屏预览"
                className="max-w-full max-h-full object-contain cursor-move select-none"
                style={{
                  transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
                  transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                }}
                onMouseDown={(e) => {
                  setIsDragging(true);
                  setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
                }}
                onMouseMove={(e) => {
                  if (isDragging) {
                    setPosition({
                      x: e.clientX - dragStart.x,
                      y: e.clientY - dragStart.y
                    });
                  }
                }}
                onMouseUp={() => setIsDragging(false)}
                onMouseLeave={() => setIsDragging(false)}
                onWheel={(e) => {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  const newScale = Math.min(Math.max(1, scale + delta), 3);
                  setScale(newScale);
                  if (newScale === 1) {
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                onDoubleClick={() => {
                  if (scale === 1) {
                    setScale(2);
                  } else {
                    setScale(1);
                    setPosition({ x: 0, y: 0 });
                  }
                }}
                draggable={false}
              />
            </motion.div>
          </motion.div>
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
                  {/* 摇一摇开关 */}
                  <div className="mb-4 bg-gradient-to-r from-[#FFC857]/20 to-[#FFB347]/20 rounded-xl p-3 border-2 border-dashed border-[#FFC857]/40">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-xl flex-shrink-0 ${shakeEnabled ? 'animate-bounce' : ''}`}>📳</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[#5D4037]">摇一摇切换</p>
                          <p className="text-xs text-[#5D4037]/60">摇动手机自动换姿势</p>
                        </div>
                      </div>

                      <ToggleSwitch enabled={shakeEnabled} onChange={setShakeEnabled} />
                    </div>
                  </div>

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
