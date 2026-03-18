/**
 * 简化版图片组件 - 原生img标签
 *
 * 特性：
 * - 浏览器原生懒加载
 * - 治愈系加载动画
 * - 加载时间显示
 * - 零Vercel额度消耗
 */

'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SimpleImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  onClick?: () => void;
  onLoad?: () => void;
  onLoadDimensions?: (dimensions: { width: number; height: number }) => void;
  aspectRatio?: number;
}

export default function SimpleImage({
  src,
  alt,
  className = '',
  priority = false,
  onClick,
  onLoad,
  onLoadDimensions,
  aspectRatio,
}: SimpleImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const loadStartTimeRef = useRef<number>(0);
  const loadingAnimationDelayTimerRef = useRef<number | null>(null);
  const [displaySrc, setDisplaySrc] = useState(src);
  const [hasRetriedOriginal, setHasRetriedOriginal] = useState(false);

  // 统一初始状态避免 hydration 错误
  const [isLoading, setIsLoading] = useState(true);

  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);

  const clearLoadingAnimationDelayTimer = () => {
    if (loadingAnimationDelayTimerRef.current !== null) {
      window.clearTimeout(loadingAnimationDelayTimerRef.current);
      loadingAnimationDelayTimerRef.current = null;
    }
  };

  const scheduleLoadingAnimation = () => {
    clearLoadingAnimationDelayTimer();
    loadingAnimationDelayTimerRef.current = window.setTimeout(() => {
      setShowLoadingAnimation(true);
      loadingAnimationDelayTimerRef.current = null;
    }, 500);
  };

  const getOptimizedSrc = (originalSrc: string) => {
    if (typeof window === 'undefined') return originalSrc;
    if (window.innerWidth >= 768) return originalSrc;

    const runtimeDomain = window.__RUNTIME_CONFIG__?.NEXT_PUBLIC_CLOUDBASE_STORAGE_DOMAIN ?? '';
    const runtimeHost = runtimeDomain
      .replace(/^https?:\/\//, '')
      .replace(/\/+$/, '')
      .toLowerCase();

    const srcLower = originalSrc.toLowerCase();
    const isCloudStorageImage =
      srcLower.includes('tcb.qcloud.la') ||
      (runtimeHost && srcLower.includes(runtimeHost));

    if (!isCloudStorageImage) return originalSrc;
    if (originalSrc.includes('imageMogr2/')) return originalSrc;

    const separator = originalSrc.includes('?') ? '&' : '?';
    return `${originalSrc}${separator}imageMogr2/format/webp/rquality/80/rwidth/750`;
  };

  // 检查图片是否已缓存 - 使用 useLayoutEffect 避免已缓存图片闪烁加载动画
  useLayoutEffect(() => {
    const optimizedSrc = getOptimizedSrc(src);
    setDisplaySrc(optimizedSrc);
    setHasRetriedOriginal(false);
    setHasError(false);
    setIsLoading(true);
    setShowLoadingAnimation(false);
    setLoadingTime(0);
    scheduleLoadingAnimation();

    const img = imgRef.current;
    if (img && img.complete && img.naturalHeight !== 0) {
      clearLoadingAnimationDelayTimer();
      setIsLoading(false);
      setShowLoadingAnimation(false);
      notifyDimensionsReady(img);
      onLoad?.();
    }

    // 记录加载开始时间
    loadStartTimeRef.current = performance.now();

    return () => {
      clearLoadingAnimationDelayTimer();
    };
  }, [src, onLoad]);

  useEffect(() => {
    if (!isLoading) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      setLoadingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading]);

  const normalizedAspectRatio = Number.isFinite(Number(aspectRatio)) && Number(aspectRatio) > 0
    ? Number(aspectRatio)
    : 0;
  const hasFixedAspectRatio = normalizedAspectRatio > 0;

  const notifyDimensionsReady = (imgElement?: HTMLImageElement | null) => {
    const target = imgElement ?? imgRef.current;
    if (!target) {
      return;
    }

    const width = Number(target.naturalWidth || 0);
    const height = Number(target.naturalHeight || 0);
    if (width > 0 && height > 0) {
      onLoadDimensions?.({ width, height });
    }
  };

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onClick={onClick}
      style={hasFixedAspectRatio ? { paddingTop: `${normalizedAspectRatio * 100}%` } : undefined}
    >
      {/* 加载占位符 - 优化版 */}
      <AnimatePresence>
        {showLoadingAnimation && isLoading && !hasError && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{
              background: 'linear-gradient(135deg, #FFFBF0 0%, #FFF8E8 50%, #FFF4E0 100%)'
            }}
          >
            {/* 主动画 - 拍立得相机 */}
            <motion.div
              animate={{
                rotate: [-2, 2, -2],
                scale: [1, 1.05, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="relative"
            >
              <motion.div
                className="text-4xl"
                animate={{
                  filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)']
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              >
                📷
              </motion.div>

              {/* 闪光效果 */}
              <motion.div
                className="absolute -top-1 -right-1 text-xl"
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0.5, 1.2, 0.5]
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeOut'
                }}
              >
                ✨
              </motion.div>
            </motion.div>

            {/* 加载文字 */}
            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center gap-1"
            >
              <motion.p
                className="text-xs text-[#5D4037]/60 font-medium"
                animate={{
                  opacity: [0.6, 1, 0.6]
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut'
                }}
              >
                拾光中...
              </motion.p>

              {/* 加载时间提示 */}
              {loadingTime > 3 && (
                <motion.p
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-[10px] text-[#5D4037]/40"
                >
                  {loadingTime}s
                </motion.p>
              )}
            </motion.div>

            {/* 装饰性元素 - 飘动的光点 */}
            <motion.div
              className="absolute top-1/4 left-1/4 text-sm opacity-30"
              animate={{
                y: [-10, 10, -10],
                x: [-5, 5, -5],
                rotate: [0, 360]
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
            >
              ✨
            </motion.div>
            <motion.div
              className="absolute bottom-1/4 right-1/4 text-sm opacity-30"
              animate={{
                y: [10, -10, 10],
                x: [5, -5, 5],
                rotate: [360, 0]
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5
              }}
            >
              💫
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误占位符 */}
      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ backgroundColor: '#FFFBF0' }}
        >
          <span className="text-4xl">📸</span>
          <p className="text-xs text-[#5D4037]/60 font-medium">照片去旅行了~</p>
        </div>
      )}

      {/* 原生img标签 - 零额度消耗 */}
      {!hasError && (
        <img
          ref={imgRef}
          src={displaySrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'low'}
          className={`${hasFixedAspectRatio ? 'absolute inset-0 w-full h-full' : 'w-full h-auto'} transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ objectFit: 'cover' }}
          onLoad={(event) => {
            const loadTime = performance.now() - loadStartTimeRef.current;
            if (loadTime > 3000) {
              console.warn(`?? ??????: ${(loadTime / 1000).toFixed(2)}s - ${src.substring(0, 100)}`);
            }
            clearLoadingAnimationDelayTimer();
            setIsLoading(false);
            setShowLoadingAnimation(false);
            notifyDimensionsReady(event.currentTarget);
            onLoad?.();
          }}
          onError={() => {
            if (!hasRetriedOriginal && displaySrc !== src) {
              setHasRetriedOriginal(true);
              setDisplaySrc(src);
              setIsLoading(true);
              setShowLoadingAnimation(false);
              scheduleLoadingAnimation();
              setHasError(false);
              loadStartTimeRef.current = performance.now();
              return;
            }

            clearLoadingAnimationDelayTimer();
            setIsLoading(false);
            setShowLoadingAnimation(false);
            setHasError(true);
          }}
        />
      )}
    </div>
  );
}
