/**
 * Supabase 图片加载器
 * 使用 Supabase Storage 的 Image Transformation API 实现实时图片转换
 * 优势：不占用额外存储空间，只存储原图，按需转换
 */

import { createClient } from './client';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

/**
 * 获取 Supabase 图片的优化 URL
 * @param path - 图片在 Storage 中的路径（如 'albums/xxx.jpg'）
 * @param bucket - 存储桶名称（默认 'albums'）
 * @param options - 转换选项
 * @returns 转换后的图片 URL
 */
export function getSupabaseImageUrl(
  path: string,
  bucket: string = 'albums',
  options: ImageTransformOptions = {}
): string {
  const supabase = createClient();

  if (!supabase) {
    console.warn('Supabase client not available, returning original path');
    return path;
  }

  // 默认转换选项：WebP 格式，质量 80
  const transform = {
    width: options.width || 800,
    quality: options.quality || 80,
    format: (options.format || 'webp') as 'webp',
    ...(options.height && { height: options.height })
  };

  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path, { transform });

  return data.publicUrl;
}

/**
 * Next.js Image Loader
 * 用于 next/image 组件的自定义 loader
 * 绕过 Vercel 的 Image Optimization，直接使用 Supabase 转换
 */
export function supabaseImageLoader({ src, width, quality }: {
  src: string;
  width: number;
  quality?: number;
}) {
  // 如果已经是完整 URL，直接返回
  if (src.startsWith('http')) {
    return src;
  }

  // 解析路径和存储桶
  // 假设格式为 'bucket:path' 或直接是 'path'（默认 albums）
  const [bucket, ...pathParts] = src.includes(':')
    ? src.split(':')
    : ['albums', src];

  const path = pathParts.join(':');

  return getSupabaseImageUrl(path, bucket, {
    width,
    quality: quality || 80,
    format: 'webp'
  });
}

/**
 * 预设尺寸配置
 * 根据使用场景选择合适的图片尺寸
 */
export const IMAGE_SIZES = {
  thumbnail: 300,    // 缩略图（列表、卡片）
  medium: 600,       // 中等尺寸（预览）
  large: 1200,       // 大图（详情页）
  full: 1920         // 全尺寸（下载、打印）
} as const;
