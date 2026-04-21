'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SimpleImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  loadingVariant?: 'rich' | 'quiet';
  onClick?: () => void;
  onLoad?: () => void;
  onError?: () => void;
  onLoadDimensions?: (dimensions: { width: number; height: number }) => void;
  aspectRatio?: number;
}

export default function SimpleImage({
  src,
  alt,
  className = '',
  priority = false,
  loadingVariant = 'rich',
  onClick,
  onLoad,
  onError,
  onLoadDimensions,
  aspectRatio,
}: SimpleImageProps) {
  const imgRef = useRef<HTMLImageElement>(null);
  const loadStartTimeRef = useRef<number>(0);
  const loadingAnimationDelayTimerRef = useRef<number | null>(null);
  const onLoadRef = useRef(onLoad);
  const onErrorRef = useRef(onError);
  const onLoadDimensionsRef = useRef(onLoadDimensions);

  const [displaySrc, setDisplaySrc] = useState(src);
  const [hasRetriedOriginal, setHasRetriedOriginal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showLoadingAnimation, setShowLoadingAnimation] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const shouldShowRichLoading = loadingVariant !== 'quiet';

  useEffect(() => {
    onLoadRef.current = onLoad;
  }, [onLoad]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onLoadDimensionsRef.current = onLoadDimensions;
  }, [onLoadDimensions]);

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

  useLayoutEffect(() => {
    const optimizedSrc = getOptimizedSrc(src);
    setHasRetriedOriginal(false);
    setDisplaySrc((currentSrc) => (currentSrc === optimizedSrc ? currentSrc : optimizedSrc));
  }, [src]);

  const notifyDimensionsReady = (imgElement?: HTMLImageElement | null) => {
    const target = imgElement ?? imgRef.current;
    if (!target) {
      return;
    }

    const width = Number(target.naturalWidth || 0);
    const height = Number(target.naturalHeight || 0);
    if (width > 0 && height > 0) {
      onLoadDimensionsRef.current?.({ width, height });
    }
  };

  useLayoutEffect(() => {
    setHasError(false);
    setIsLoading(true);
    setShowLoadingAnimation(false);
    setLoadingTime(0);
    if (shouldShowRichLoading) {
      scheduleLoadingAnimation();
    } else {
      clearLoadingAnimationDelayTimer();
    }
    loadStartTimeRef.current = performance.now();

    const img = imgRef.current;
    const domSrc = img?.getAttribute('src') ?? '';
    if (img && domSrc === displaySrc && img.complete && img.naturalHeight !== 0) {
      clearLoadingAnimationDelayTimer();
      setIsLoading(false);
      setShowLoadingAnimation(false);
      notifyDimensionsReady(img);
      onLoadRef.current?.();
    }

    return () => {
      clearLoadingAnimationDelayTimer();
    };
  }, [displaySrc, shouldShowRichLoading]);

  useEffect(() => {
    if (!isLoading) return;

    const startTime = Date.now();
    const timer = window.setInterval(() => {
      setLoadingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [isLoading]);

  const normalizedAspectRatio = Number.isFinite(Number(aspectRatio)) && Number(aspectRatio) > 0
    ? Number(aspectRatio)
    : 0;
  const hasFixedAspectRatio = normalizedAspectRatio > 0;
  const placeholderBackground = 'linear-gradient(135deg, #FFFBF0 0%, #FFF8E8 50%, #FFF4E0 100%)';

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      onClick={onClick}
      style={
        hasFixedAspectRatio
          ? { aspectRatio: String(1 / normalizedAspectRatio), background: placeholderBackground }
          : { background: placeholderBackground }
      }
    >
      {isLoading && !hasError && (
        <div className="absolute inset-0">
          <motion.div
            className="absolute inset-0"
            animate={{ opacity: [0.82, 1, 0.82] }}
            transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: placeholderBackground }}
          />
          <motion.div
            className="absolute inset-y-0 left-[-35%] w-[35%]"
            animate={{ x: ['0%', '420%'] }}
            transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
            style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.45), rgba(255,255,255,0))' }}
          />
        </div>
      )}

      <AnimatePresence>
        {shouldShowRichLoading && showLoadingAnimation && isLoading && !hasError && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.4 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-3"
            style={{ background: placeholderBackground }}
          >
            <motion.div
              animate={{
                rotate: [-2, 2, -2],
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative"
            >
              <motion.div
                className="text-4xl"
                animate={{
                  filter: ['brightness(1)', 'brightness(1.2)', 'brightness(1)'],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                📷
              </motion.div>

              <motion.div
                className="absolute -top-1 -right-1 text-xl"
                animate={{
                  opacity: [0, 1, 0],
                  scale: [0.5, 1.2, 0.5],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: 'easeOut',
                }}
              >
                ✨
              </motion.div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center gap-1"
            >
              <motion.p
                className="text-xs text-[#5D4037]/60 font-medium"
                animate={{
                  opacity: [0.6, 1, 0.6],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                拾光中...
              </motion.p>

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

            <motion.div
              className="absolute top-1/4 left-1/4 text-sm opacity-30"
              animate={{
                y: [-10, 10, -10],
                x: [-5, 5, -5],
                rotate: [0, 360],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              ✨
            </motion.div>
            <motion.div
              className="absolute bottom-1/4 right-1/4 text-sm opacity-30"
              animate={{
                y: [10, -10, 10],
                x: [5, -5, 5],
                rotate: [360, 0],
              }}
              transition={{
                duration: 3.5,
                repeat: Infinity,
                ease: 'easeInOut',
                delay: 0.5,
              }}
            >
              💫
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ backgroundColor: '#FFFBF0' }}
        >
          <span className="text-4xl">🖼️</span>
          <p className="text-xs text-[#5D4037]/60 font-medium">照片去旅行了~</p>
        </div>
      )}

      {!hasError && (
        <img
          key={displaySrc}
          ref={imgRef}
          src={displaySrc}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          fetchPriority={priority ? 'high' : 'low'}
          className={`${hasFixedAspectRatio ? 'absolute inset-0 h-full w-full' : 'h-auto w-full'} transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ objectFit: 'cover' }}
          onLoad={(event) => {
            const loadTime = performance.now() - loadStartTimeRef.current;
            if (loadTime > 3000) {
              console.warn(`图片加载耗时较长: ${(loadTime / 1000).toFixed(2)}s - ${src.substring(0, 100)}`);
            }
            clearLoadingAnimationDelayTimer();
            setIsLoading(false);
            setShowLoadingAnimation(false);
            notifyDimensionsReady(event.currentTarget);
            onLoadRef.current?.();
          }}
          onError={() => {
            if (!hasRetriedOriginal && displaySrc !== src) {
              setHasRetriedOriginal(true);
              setDisplaySrc(src);
              setIsLoading(true);
              setShowLoadingAnimation(false);
              if (shouldShowRichLoading) {
                scheduleLoadingAnimation();
              } else {
                clearLoadingAnimationDelayTimer();
              }
              setHasError(false);
              loadStartTimeRef.current = performance.now();
              return;
            }

            clearLoadingAnimationDelayTimer();
            setIsLoading(false);
            setShowLoadingAnimation(false);
            setHasError(true);
            onErrorRef.current?.();
          }}
        />
      )}
    </div>
  );
}
