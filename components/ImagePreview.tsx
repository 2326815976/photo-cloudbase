'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform, animate } from 'framer-motion';
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
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [isWechat, setIsWechat] = useState(false);
  const [longPressProgress, setLongPressProgress] = useState(0);
  const [lastTapTime, setLastTapTime] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const longPressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // 计算最小缩放比例（contain 模式）
  const getMinScale = useCallback(() => {
    if (!containerSize.width || !imageDimensions.width) return 1;

    const scaleX = containerSize.width / imageDimensions.width;
    const scaleY = containerSize.height / imageDimensions.height;

    return Math.min(scaleX, scaleY);
  }, [containerSize, imageDimensions]);

  // 计算最大缩放比例（3倍）
  const getMaxScale = useCallback(() => {
    return getMinScale() * 3;
  }, [getMinScale]);

  // 检测微信环境
  useEffect(() => {
    setIsWechat(isWechatBrowser());
  }, []);

  // 实时更新缩放比例显示和缩放状态
  useEffect(() => {
    const unsubscribe = scale.on('change', (latest) => {
      const minScale = getMinScale();
      if (minScale > 0) {
        setDisplayScale(Math.round((latest / minScale) * 100));
        setIsZoomed(latest > minScale);
      }
    });
    return unsubscribe;
  }, [scale, getMinScale]);

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
    const minScale = getMinScale();
    scale.set(minScale);
    x.set(0);
    y.set(0);
    offsetX.set(0);
  };

  // 切换图片
  const changeImage = useCallback((newIndex: number) => {
    if (newIndex < 0 || newIndex >= images.length) return;
    if (newIndex === index) return;

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
        animate(x, offsetXVal, springConfig);
        animate(y, offsetYVal, springConfig);
      }
    }
  }, [scale, x, y, getMinScale, getMaxScale]);

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
        const currentScale = scale.get();
        const minScale = getMinScale();

        if (currentScale <= minScale) {
          // 未缩放：左右滑动切换图片
          offsetX.set(ox);

          if (last) {
            const threshold = 80;
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
          // 已缩放：拖拽移动，手动限制边界
          const imgWidth = imageDimensions.width * currentScale;
          const imgHeight = imageDimensions.height * currentScale;

          // 计算最大可移动距离
          const maxX = Math.max(0, (imgWidth - containerSize.width) / 2);
          const maxY = Math.max(0, (imgHeight - containerSize.height) / 2);

          // 限制在边界内
          const boundedX = Math.max(-maxX, Math.min(maxX, ox));
          const boundedY = Math.max(-maxY, Math.min(maxY, oy));

          x.set(boundedX);
          y.set(boundedY);
        }
      },

      onPinch: ({ offset: [s], last }) => {
        const minScale = getMinScale();
        const maxScale = getMaxScale();

        scale.set(s);

        if (last) {
          // 回弹到合法范围
          if (s < minScale) {
            animate(scale, minScale, springConfig);
          } else if (s > maxScale) {
            animate(scale, maxScale, springConfig);
          }
        }
      },

      onWheel: ({ delta: [, dy] }) => {
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
        },
        bounds: (state) => {
          const currentScale = scale.get();
          const minScale = getMinScale();

          if (currentScale <= minScale) {
            return { left: -300, right: 300, top: 0, bottom: 0 };
          }

          // 已缩放：动态计算边界
          const imgWidth = imageDimensions.width * currentScale;
          const imgHeight = imageDimensions.height * currentScale;
          const maxX = Math.max(0, (imgWidth - containerSize.width) / 2);
          const maxY = Math.max(0, (imgHeight - containerSize.height) / 2);

          return {
            left: -maxX,
            right: maxX,
            top: -maxY,
            bottom: maxY
          };
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
            双指缩放 · 长按保存
          </p>
        </div>

        {/* 图片序号 */}
        {showScale && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/10 backdrop-blur-sm rounded-full px-4 py-2 z-10">
            <span className="text-white text-sm font-medium">{displayScale}%</span>
          </div>
        )}

        {/* 图片容器 - 多图片轮播模式 */}
        <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
          <motion.div
            className="flex items-center justify-center"
            style={{
              x: isZoomed ? xSpring : offsetXSpring,
              width: '300%',
              height: '100%'
            }}
          >
            {/* 前一张图片 */}
            {index > 0 && (
              <div className="w-1/3 h-full flex items-center justify-center">
                <img
                  src={images[index - 1]}
                  alt={`图片 ${index}`}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              </div>
            )}
            {index === 0 && <div className="w-1/3" />}

            {/* 当前图片 */}
            <div className="w-1/3 h-full flex items-center justify-center">
              <motion.img
                ref={imageRef}
                key={images[index]}
                src={images[index]}
                alt={`图片 ${index + 1}`}
                className="max-w-full max-h-full object-contain select-none touch-none"
                style={{
                  scale: scaleSpring,
                  y: ySpring,
                  cursor: 'grab'
                }}
                onLoad={handleImageLoad}
                onTouchStart={startLongPress}
                onTouchEnd={cancelLongPress}
                onTouchMove={cancelLongPress}
                draggable={false}
              />
            </div>

            {/* 后一张图片 */}
            {index < images.length - 1 && (
              <div className="w-1/3 h-full flex items-center justify-center">
                <img
                  src={images[index + 1]}
                  alt={`图片 ${index + 2}`}
                  className="max-w-full max-h-full object-contain select-none"
                  draggable={false}
                />
              </div>
            )}
            {index === images.length - 1 && <div className="w-1/3" />}
          </motion.div>
        </div>

        {/* 长按下载进度环 */}
        {!isWechat && enableLongPressDownload && longPressProgress > 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
            <div className="relative w-20 h-20">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="40" cy="40" r="36" stroke="rgba(255, 255, 255, 0.2)" strokeWidth="4" fill="none" />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="#FFC857"
                  strokeWidth="4"
                  fill="none"
                  strokeDasharray={`${2 * Math.PI * 36}`}
                  strokeDashoffset={`${2 * Math.PI * 36 * (1 - longPressProgress / 100)}`}
                  style={{ transition: 'stroke-dashoffset 0.1s linear' }}
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <Download className="w-8 h-8 text-white" />
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
