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

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface SimpleImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  onClick?: () => void;
}

export default function SimpleImage({
  src,
  alt,
  className = '',
  priority = false,
  onClick
}: SimpleImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [loadingTime, setLoadingTime] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  // 检查图片是否已缓存
  useEffect(() => {
    const img = imgRef.current;
    if (img && img.complete && img.naturalHeight !== 0) {
      setIsLoading(false);
    }
  }, [src]);

  useEffect(() => {
    if (!isLoading) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      setLoadingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [isLoading]);

  return (
    <div className={`relative overflow-hidden ${className}`} onClick={onClick}>
      {/* 加载占位符 - 优化版 */}
      <AnimatePresence>
        {isLoading && !hasError && (
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
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={`w-full h-auto transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          style={{ objectFit: 'cover' }}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
        />
      )}
    </div>
  );
}
