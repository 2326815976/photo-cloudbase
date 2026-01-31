/**
 * 图片优化工具函数
 */

/**
 * 生成 Supabase 图片缩略图 URL
 * @param url 原始图片 URL
 * @param width 目标宽度（像素）
 * @param quality 图片质量 (1-100)
 * @returns 优化后的图片 URL
 */
export function getOptimizedImageUrl(
  url: string,
  width: number = 400,
  quality: number = 80
): string {
  if (!url) return url;

  // Supabase 的 /render/image/ API 被浏览器阻止
  // 暂时直接返回原始 URL，依赖浏览器懒加载优化
  return url;
}

/**
 * 获取不同尺寸的图片 URL
 */
export const ImageSizes = {
  thumbnail: 400,    // 缩略图
  medium: 800,       // 中等尺寸
  large: 1200,       // 大图
  preview: 1600,     // 预览图
} as const;
