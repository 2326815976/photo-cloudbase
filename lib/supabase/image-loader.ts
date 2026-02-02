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

  // 优化转换选项：WebP 格式，质量 85（平衡性能和质量）
  const transform = {
    width: options.width || 800,
    quality: options.quality || 85, // 质量 85 保证视觉效果
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
    quality: quality || 85, // 质量 85 保证视觉效果
    format: 'webp'
  });
}

/**
 * 获取原图 URL（不经过任何转换）
 * 用于下载功能，保证用户获得完整质量的原始文件
 * @param path - 图片在 Storage 中的路径
 * @param bucket - 存储桶名称
 * @returns 原图 URL
 */
export function getOriginalImageUrl(
  path: string,
  bucket: string = 'albums'
): string {
  const supabase = createClient();

  if (!supabase) {
    console.warn('Supabase client not available, returning original path');
    return path;
  }

  // 不使用 transform 参数，直接获取原图
  const { data } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);

  return data.publicUrl;
}

/**
 * 预设尺寸配置
 * 根据使用场景选择合适的图片尺寸
 * 优化策略：平衡性能和质量，适配现代移动设备
 */
export const IMAGE_SIZES = {
  thumbnail: 300,    // 缩略图（列表、卡片）
  medium: 600,       // 中等尺寸（照片墙、预览）- 适合移动端高清屏
  large: 1200,       // 大图（详情页、全屏预览）
  full: 1920         // 全尺寸（下载、打印）- 不经过转换
} as const;

/**
 * 根据网络速度动态调整图片质量
 */
export function getAdaptiveQuality(): number {
  if (typeof navigator === 'undefined' || !('connection' in navigator)) {
    return 85; // 默认质量
  }

  const connection = (navigator as any).connection;
  const effectiveType = connection?.effectiveType;

  // 根据网络类型调整质量
  switch (effectiveType) {
    case 'slow-2g':
    case '2g':
      return 60; // 低质量
    case '3g':
      return 75; // 中等质量
    case '4g':
    default:
      return 85; // 高质量
  }
}

