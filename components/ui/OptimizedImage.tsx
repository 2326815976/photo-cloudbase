'use client';

/**
 * OptimizedImage - 高性能图片组件
 *
 * 优化特性：
 * 1. BlurHash 占位符 - 即时显示模糊预览
 * 2. Supabase Image Transformations - 自动 WebP 转换和压缩
 * 3. 渐进式加载 - 平滑过渡效果
 * 4. 懒加载 - 节省带宽
 * 5. 响应式尺寸 - 根据设备自动调整
 */

import { useState } from 'react';
import Image from 'next/image';
import { Blurhash } from 'react-blurhash';
import { supabaseImageLoader, IMAGE_SIZES } from '@/lib/supabase/image-loader';

interface OptimizedImageProps {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  blurhash?: string;
  className?: string;
  size?: keyof typeof IMAGE_SIZES;
  priority?: boolean;
  onClick?: () => void;
}

export default function OptimizedImage({
  src,
  alt,
  width,
  height,
  blurhash,
  className = '',
  size = 'medium',
  priority = false,
  onClick
}: OptimizedImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  const imageWidth = width || IMAGE_SIZES[size];
  const imageHeight = height || imageWidth;

  return (
    <div className={`relative overflow-hidden ${className}`} onClick={onClick}>
      {/* BlurHash 占位符 - 即时显示 */}
      {isLoading && !hasError && blurhash && (
        <div className="absolute inset-0">
          <Blurhash
            hash={blurhash}
            width="100%"
            height="100%"
            resolutionX={32}
            resolutionY={32}
            punch={1}
          />
        </div>
      )}

      {/* 无 BlurHash 时的简单占位符 */}
      {isLoading && !hasError && !blurhash && (
        <div
          className="absolute inset-0 animate-pulse"
          style={{
            background: 'linear-gradient(135deg, #FFFBF0 0%, #FFF4E0 100%)'
          }}
        />
      )}

      {/* 错误占位符 */}
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
          height={imageHeight}
          loader={supabaseImageLoader}
          quality={75}
          priority={priority}
          className={`w-full h-auto transition-opacity duration-700 ${
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
