/**
 * 简化版图片组件 - 无需Supabase图片转换
 *
 * 使用浏览器原生懒加载 + 优化的占位符
 * 适用于Supabase图片转换API不可用的情况
 */

'use client';

import { useState, useEffect } from 'react';
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

  // 加载超时检测（30秒）
  useEffect(() => {
    if (!isLoading) return;

    const startTime = Date.now();
    const timer = setInterval(() => {
      setLoadingTime(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    const timeout = setTimeout(() => {
      if (isLoading) {
        console.warn('图片加载超时:', src);
        setHasError(true);
        setIsLoading(false);
      }
    }, 30000);

    return () => {
      clearInterval(timer);
      clearTimeout(timeout);
    };
  }, [isLoading, src]);

  return (
    <div className={`relative overflow-hidden ${className}`} onClick={onClick}>
      {/* 加载占位符 */}
      <AnimatePresence>
        {isLoading && !hasError && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            style={{
              background: 'linear-gradient(135deg, #FFFBF0 0%, #FFF4E0 100%)'
            }}
          >
            <motion.div
              animate={{
                y: [0, -8, 0],
                scale: [1, 1.05, 1]
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="text-3xl opacity-40"
            >
              ☁️
            </motion.div>
            {loadingTime > 3 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[10px] text-[#5D4037]/40"
              >
                加载中 {loadingTime}s...
              </motion.p>
            )}
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

      {/* 实际图片 */}
      {!hasError && (
        <img
          src={src}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className={`w-full h-auto transition-opacity duration-300 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={() => {
            console.log('图片加载成功:', src);
            setIsLoading(false);
          }}
          onError={(e) => {
            console.error('图片加载失败:', src, e);
            setIsLoading(false);
            setHasError(true);
          }}
          style={{ objectFit: 'cover' }}
        />
      )}
    </div>
  );
}
