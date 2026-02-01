'use client';

/**
 * CuteImage - 治愈系图片组件
 *
 * 特性：
 * 1. 使用 Supabase Image Transformations 实时转换图片
 * 2. 温暖治愈的加载占位符（跳动云朵动画）
 * 3. 优雅的淡入过渡效果
 * 4. 智能错误处理（显示可爱占位图）
 * 5. 自动选择合适的图片尺寸
 */

import { useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { supabaseImageLoader, IMAGE_SIZES } from '@/lib/supabase/image-loader';

interface CuteImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  className?: string;
  size?: keyof typeof IMAGE_SIZES; // 'thumbnail' | 'medium' | 'large' | 'full'
  priority?: boolean; // 是否高优先级加载（首屏图片）
  onClick?: () => void;
}

export default function CuteImage({
  src,
  alt,
  width,
  height,
  className = '',
  size = 'medium',
  priority = false,
  onClick
}: CuteImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  // 根据 size 参数自动选择宽度
  const imageWidth = width || IMAGE_SIZES[size];

  return (
    <div className={`relative overflow-hidden ${className}`} onClick={onClick}>
      {/* 加载占位符 - 跳动云朵动画 */}
      <AnimatePresence>
        {isLoading && !hasError && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, #FFFBF0 0%, #FFF4E0 100%)'
            }}
          >
            {/* 跳动的云朵图标 */}
            <motion.div
              animate={{
                y: [0, -10, 0],
                scale: [1, 1.1, 1]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: 'easeInOut'
              }}
              className="text-4xl opacity-40"
            >
              ☁️
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 错误占位符 - "照片去旅行了" */}
      {hasError && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2"
          style={{ backgroundColor: '#FFFBF0' }}
        >
          <span className="text-5xl">📸</span>
          <p className="text-sm text-[#5D4037]/60 font-medium">照片去旅行了~</p>
        </div>
      )}

      {/* 实际图片 */}
      {!hasError && (
        <Image
          src={src}
          alt={alt}
          width={imageWidth}
          height={height || imageWidth}
          loader={supabaseImageLoader}
          quality={80}
          priority={priority}
          className={`w-full h-auto transition-opacity duration-500 ${
            isLoading ? 'opacity-0' : 'opacity-100'
          }`}
          onLoad={() => setIsLoading(false)}
          onError={() => {
            setIsLoading(false);
            setHasError(true);
          }}
          style={{ objectFit: 'cover' }}
        />
      )}
    </div>
  );
}
