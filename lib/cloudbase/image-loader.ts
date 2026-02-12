/**
 * CloudBase 图片加载器
 * 通过统一 storage 适配层生成公开 URL，用于 next/image 自定义 loader。
 */

import { createClient } from './client';

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'webp' | 'jpeg' | 'png';
}

/**
 * 获取图片公开 URL
 * @param path - 图片在存储中的路径（如 'albums/xxx.jpg'）
 * @param bucket - 逻辑桶名称（默认 'albums'）
 * @param options - 兼容参数（当前主要用于调用方透传）
 */
export function getStorageImageUrl(
  path: string,
  bucket: string = 'albums',
  options: ImageTransformOptions = {}
): string {
  const dbClient = createClient();

  // createClient 在浏览器场景始终存在，这里保留兜底避免极端环境异常。
  if (!dbClient) return path;

  // 优化转换选项：WebP 格式，质量 85（平衡性能和质量）
  const transform = {
    width: options.width || 800,
    quality: options.quality || 85, // 质量 85 保证视觉效果
    format: (options.format || 'webp') as 'webp',
    ...(options.height && { height: options.height })
  };

  const { data } = dbClient.storage
    .from(bucket)
    .getPublicUrl(path, { transform });

  return data.publicUrl;
}

/**
 * Next.js Image Loader
 * 用于 next/image 的自定义 loader
 */
export function storageImageLoader({ src, width, quality }: {
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

  return getStorageImageUrl(path, bucket, {
    width,
    quality: quality || 85, // 质量 85 保证视觉效果
    format: 'webp'
  });
}

// 统一导出 cloudbase 命名。
export const getCloudbaseImageUrl = getStorageImageUrl;
export const cloudbaseImageLoader = storageImageLoader;

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
  const dbClient = createClient();

  if (!dbClient) return path;

  // 不使用 transform 参数，直接获取原图
  const { data } = dbClient.storage
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
