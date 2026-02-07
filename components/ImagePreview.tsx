'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useMotionValue, animate } from 'framer-motion';
import { useGesture } from '@use-gesture/react';
import { X, Download } from 'lucide-react';
import { isWechatBrowser } from '@/lib/wechat';
import { downloadPhoto } from '@/lib/android';

interface ImagePreviewProps {
  images: string[];
  currentIndex: number;
  isOpen: boolean;
  onClose: () => void;
  onIndexChange?: (index: number) => void;
  showCounter?: boolean;
  showScale?: boolean;
  enableLongPressDownload?: boolean;
}

/**
 * 微信原生风格图片预览组件
 * 完全复刻微信的缩放、滑动、双击等交互体验
 */
export default function ImagePreview({
  images,
  currentIndex,
  isOpen,
  onClose,
  onIndexChange,
  showCounter = true,
  showScale = true,
  enableLongPressDownload = true
}: ImagePreviewProps) {
  const [index, setIndex] = useState(currentIndex);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [baseSize, setBaseSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isWechat, setIsWechat] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);
  const [clickTimer, setClickTimer] = useState<NodeJS.Timeout | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const ringRadius = 24;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference - (longPressProgress / 100) * ringCircumference;

  // Motion values for smooth animations
  const scale = useMotionValue(1);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const offsetX = useMotionValue(0);

  // Spring configs for smooth animations
  const springConfig = { damping: 30, stiffness: 300 };
  const scaleSpring = useSpring(scale, springConfig);
  const xSpring = useSpring(x, springConfig);
  const ySpring = useSpring(y, springConfig);
  const offsetXSpring = useSpring(offsetX, springConfig);

  // 实时计算缩放比例显示
  const [displayScale, setDisplayScale] = useState(100);
  const [isZoomed, setIsZoomed] = useState(false);

  // 计算图片在容器内的适配尺寸（contain 模式）
  const getFitScale = useCallback(() => {
    if (!containerSize.width || !imageDimensions.width) return 1;

    const scaleX = containerSize.width / imageDimensions.width;
    const scaleY = containerSize.height / imageDimensions.height;

    return Math.min(1, scaleX, scaleY);
  }, [containerSize, imageDimensions]);

  const getFallbackBaseSize = useCallback(() => {
    const fitScale = getFitScale();
    return {
      width: imageDimensions.width * fitScale,
      height: imageDimensions.height * fitScale
    };
  }, [getFitScale, imageDimensions]);

  // 最小缩放比例：以适配尺寸为 1
  const getMinScale = useCallback(() => 1, []);

  // 最大缩放比例（6倍，即600%）
  const getMaxScale = useCallback(() => 6, []);

  const getBounds = useCallback((currentScale: number) => {
    if (!baseSize.width || !containerSize.width) return null;

    const imgWidth = baseSize.width * currentScale;
    const imgHeight = baseSize.height * currentScale;
    const maxX = Math.max(0, (imgWidth - containerSize.width) / 2);
    const maxY = Math.max(0, (imgHeight - containerSize.height) / 2);

    return { maxX, maxY };
  }, [baseSize, containerSize]);

  const updateBaseSize = useCallback(() => {
    const fallback = getFallbackBaseSize();
    if (!imageRef.current) {
      if (fallback.width > 0 && fallback.height > 0) {
        setBaseSize(fallback);
      }
      return;
    }

    const rect = imageRef.current.getBoundingClientRect();
    const currentScale = Math.max(getMinScale(), scale.get() || 1);
    const width = rect.width / currentScale;
    const height = rect.height / currentScale;

    if (width > 0 && height > 0) {
      setBaseSize({ width, height });
    } else if (fallback.width > 0 && fallback.height > 0) {
      setBaseSize(fallback);
    }
  }, [getFallbackBaseSize, getMinScale, scale]);

  // 检测微信环境
  useEffect(() => {
    setIsWechat(isWechatBrowser());
  }, []);

  // 实时更新缩放比例显示和缩放状态，并校准位移
  useEffect(() => {
    const unsubscribe = scale.on('change', (latest) => {
      const minScale = getMinScale();
      if (minScale > 0) {
        setDisplayScale(Math.round((latest / minScale) * 100));
        setIsZoomed(latest > minScale + 0.01);

        // 缩放时实时校准位移，确保不超出边界
        const bounds = getBounds(latest);
        if (!bounds) return;

        const currentX = x.get();
        const currentY = y.get();
        const clampedX = Math.max(-bounds.maxX, Math.min(bounds.maxX, currentX));
        const clampedY = Math.max(-bounds.maxY, Math.min(bounds.maxY, currentY));

        if (clampedX !== currentX) x.set(clampedX);
        if (clampedY !== currentY) y.set(clampedY);
      }
    });
    return unsubscribe;
  }, [scale, getMinScale, getBounds, x, y]);

  // 监听容器尺寸变化
  useEffect(() => {
    if (!containerRef.current) return;

    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => updateBaseSize());
    return () => cancelAnimationFrame(raf);
  }, [containerSize, imageDimensions, updateBaseSize]);

  // 同步外部索引
  useEffect(() => {
    if (currentIndex !== index) {
      setIndex(currentIndex);
      resetImageState();
    }
  }, [currentIndex]);

  // 重置图片状态
  const resetImageState = useCallback(() => {
    const minScale = getMinScale();
    animate(scale, minScale, springConfig);
    animate(x, 0, springConfig);
    animate(y, 0, springConfig);
    animate(offsetX, 0, springConfig);
    setIsZoomed(false);
  }, [getMinScale, scale, x, y, offsetX]);

  // 图片加载完成
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });

    // 初始化为最小比例
    scale.set(getMinScale());
    x.set(0);
    y.set(0);
    offsetX.set(0);
    setIsZoomed(false);

    requestAnimationFrame(() => updateBaseSize());
  };

  // 切换图片
  const changeImage = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= images.length) return;
    if (newIndex === index) return;

    // 直接切换图片，依靠 AnimatePresence 处理过渡动画
    setIndex(newIndex);
    onIndexChange?.(newIndex);
    setImageDimensions({ width: 0, height: 0 });
    resetImageState();
  }, [images.length, index, onIndexChange, resetImageState]);

  // 双击还原
  const handleDoubleTap = useCallback((tapX: number, tapY: number) => {
    const currentScale = scale.get();
    const minScale = getMinScale();
    const maxScale = getMaxScale();

    if (currentScale > minScale) {
      // 已放大：还原到最小比例
      animate(scale, minScale, springConfig);
      animate(x, 0, springConfig);
      animate(y, 0, springConfig);
    } else {
      // 未放大：放大到2倍，以点击位置为中心
      const targetScale = Math.min(minScale * 2, maxScale);
      animate(scale, targetScale, springConfig);

      // 计算偏移，使点击位置保持在屏幕中心
      const rect = imageRef.current?.getBoundingClientRect();
      if (rect) {
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const offsetXVal = (centerX - tapX) * (targetScale / currentScale - 1);
        const offsetYVal = (centerY - tapY) * (targetScale / currentScale - 1);
        const bounds = getBounds(targetScale);
        if (bounds) {
          const clampedX = Math.max(-bounds.maxX, Math.min(bounds.maxX, offsetXVal));
          const clampedY = Math.max(-bounds.maxY, Math.min(bounds.maxY, offsetYVal));
          animate(x, clampedX, springConfig);
          animate(y, clampedY, springConfig);
        } else {
          animate(x, offsetXVal, springConfig);
          animate(y, offsetYVal, springConfig);
        }
      }
    }
  }, [scale, x, y, getMinScale, getMaxScale, getBounds]);

  // 长按下载
  const startLongPress = useCallback(() => {
    if (isWechat || !enableLongPressDownload) return;

    setLongPressProgress(0);

    const progressInterval = setInterval(() => {
      setLongPressProgress(prev => Math.min(prev + 12.5, 100));
    }, 100);
    longPressIntervalRef.current = progressInterval;

    const timer = setTimeout(async () => {
      clearInterval(progressInterval);
      setLongPressProgress(0);
      await downloadPhoto(images[index], `photo_${index + 1}.jpg`);
    }, 800);

    longPressTimerRef.current = timer;
  }, [isWechat, enableLongPressDownload, images, index]);

  const cancelLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    if (longPressIntervalRef.current) {
      clearInterval(longPressIntervalRef.current);
      longPressIntervalRef.current = null;
    }
    setLongPressProgress(0);
  }, []);

  useEffect(() => {
    return () => cancelLongPress();
  }, [cancelLongPress]);

  // 手势处理
  useGesture(
    {
      onClick: ({ event }) => {
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime;

        if (timeSinceLastTap < 300) {
          // 双击检测
          const rect = imageRef.current?.getBoundingClientRect();
          if (rect) {
            const tapX = (event as MouseEvent).clientX - rect.left;
            const tapY = (event as MouseEvent).clientY - rect.top;
            handleDoubleTap(tapX, tapY);
          }
        }

        setLastTapTime(now);
      },

      onDrag: ({ offset: [ox, oy], last, movement: [mx, my], velocity: [vx, vy], memo }) => {
        cancelLongPress();
        const currentScale = scale.get();
        const minScale = getMinScale();

        if (currentScale <= minScale) {
          // 未缩放：左右滑动切换图片
          // 边界弹性：首张向左滑、末张向右滑时限制
          let limitedOx = ox;
          if (index === 0 && ox > 0) {
            // 首张向左滑，添加阻尼效果
            limitedOx = ox * 0.3;
          } else if (index === images.length - 1 && ox < 0) {
            // 末张向右滑，添加阻尼效果
            limitedOx = ox * 0.3;
          }
          offsetX.set(limitedOx);

          if (last) {
            const threshold = containerSize.width / 3;
            const shouldChange = Math.abs(ox) > threshold || Math.abs(vx) > 0.5;

            if (shouldChange) {
              if (ox > 0 && index > 0) {
                changeImage(index - 1);
              } else if (ox < 0 && index < images.length - 1) {
                changeImage(index + 1);
              } else {
                animate(offsetX, 0, springConfig);
              }
            } else {
              animate(offsetX, 0, springConfig);
            }
          }
        } else {
          // 已缩放：拖拽移动，实时限制边界
          const bounds = getBounds(currentScale);
          if (!bounds) {
            x.set(ox);
            y.set(oy);
            return;
          }

          // 实时限制位移在边界内
          const limitedX = Math.max(-bounds.maxX, Math.min(bounds.maxX, ox));
          const limitedY = Math.max(-bounds.maxY, Math.min(bounds.maxY, oy));

          x.set(limitedX);
          y.set(limitedY);
        }
      },

      onPinch: ({ offset: [s], last }) => {
        cancelLongPress();
        const minScale = getMinScale();
        const maxScale = getMaxScale();

        scale.set(s);

        if (last) {
          // 回弹到合法范围
          let finalScale = s;
          if (s < minScale) {
            finalScale = minScale;
            animate(scale, minScale, springConfig);
          } else if (s > maxScale) {
            finalScale = maxScale;
            animate(scale, maxScale, springConfig);
          }

          // 缩放后校准位移，确保不超出边界
          const bounds = getBounds(finalScale);
          if (!bounds) return;

          const currentX = x.get();
          const currentY = y.get();
          const clampedX = Math.max(-bounds.maxX, Math.min(bounds.maxX, currentX));
          const clampedY = Math.max(-bounds.maxY, Math.min(bounds.maxY, currentY));

          if (clampedX !== currentX || clampedY !== currentY) {
            animate(x, clampedX, springConfig);
            animate(y, clampedY, springConfig);
          }
        }
      },

      onWheel: ({ delta: [, dy] }) => {
        cancelLongPress();
        const currentScale = scale.get();
        const minScale = getMinScale();
        const maxScale = getMaxScale();
        const delta = dy > 0 ? -0.2 : 0.2;
        const newScale = Math.max(minScale * 0.5, Math.min(maxScale * 1.5, currentScale + delta));

        scale.set(newScale);

        // 延迟回弹
        setTimeout(() => {
          const finalScale = scale.get();
          if (finalScale < minScale) {
            animate(scale, minScale, springConfig);
          } else if (finalScale > maxScale) {
            animate(scale, maxScale, springConfig);
          }
        }, 100);
      }
    },
    {
      target: imageRef,
      drag: {
        from: () => {
          const currentScale = scale.get();
          const minScale = getMinScale();
          return currentScale <= minScale ? [offsetX.get(), 0] : [x.get(), y.get()];
        }
      },
      pinch: {
        from: () => [scale.get(), 0],
        scaleBounds: { min: getMinScale() * 0.5, max: getMaxScale() * 1.5 }
      }
    }
  );

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        ref={containerRef}
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
              onClose();
              setClickTimer(null);
            }, 300);
            setClickTimer(timer);
          }
        }}
        className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden"
        style={{ backgroundColor: 'rgba(0, 0, 0, 0.95)' }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center hover:bg-white/20 transition-colors z-10"
        >
          <X className="w-6 h-6 text-white" />
        </button>

        {/* 操作提示 */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
          <p className="text-white text-xs">
            双指缩放 · 双击还原
          </p>
        </div>

        {/* 图片序号 */}
        {showCounter && images.length > 1 && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-3 py-1 z-10">
            <p className="text-white text-xs font-medium">
              {index + 1} / {images.length}
            </p>
          </div>
        )}

        {/* 缩放比例 */}
        {showScale && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
            <span className="text-white text-sm font-medium">{displayScale}%</span>
          </div>
        )}

        {/* 图片容器 */}
        <AnimatePresence mode="wait">
          <motion.img
            ref={imageRef}
            key={images[index]}
            src={images[index]}
            alt={`图片 ${index + 1}`}
            className="max-w-full max-h-full object-contain select-none touch-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              scale: scaleSpring,
              x: isZoomed ? xSpring : offsetXSpring,
              y: ySpring,
              cursor: 'grab'
            }}
            onLoad={handleImageLoad}
            draggable={false}
            onTouchStart={(e) => {
              if (e.touches.length === 1) {
                startLongPress();
              }
            }}
            onTouchMove={cancelLongPress}
            onTouchEnd={cancelLongPress}
            onTouchCancel={cancelLongPress}
          />
        </AnimatePresence>

        {/* 长按下载进度环 */}
        {!isWechat && enableLongPressDownload && longPressProgress > 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <svg className="w-16 h-16" viewBox="0 0 56 56">
              <circle
                cx="28"
                cy="28"
                r={ringRadius}
                stroke="rgba(255,255,255,0.35)"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="28"
                cy="28"
                r={ringRadius}
                stroke="#FFFFFF"
                strokeWidth="4"
                fill="none"
                strokeDasharray={ringCircumference}
                strokeDashoffset={ringOffset}
                strokeLinecap="round"
                transform="rotate(-90 28 28)"
              />
            </svg>
          </div>
        )}

        {/* 下载原图按钮 */}
        {!isWechat && enableLongPressDownload && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              downloadPhoto(images[index], `photo_${index + 1}.jpg`);
            }}
            className="absolute bottom-4 right-4 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 hover:bg-white/20 transition-colors z-10 flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-white" />
            <span className="text-white text-sm">下载原图</span>
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
