/**
 * 多版本图片生成工具
 * 用于上传时生成 thumbnail(速览) + preview(高质量) + original(原图) 三个版本
 */

import imageCompression from 'browser-image-compression';

export interface ImageVersion {
  file: File;
  type: 'thumbnail' | 'preview' | 'original';
  width: number;
  height: number;
}

interface PoseImageGenerateOptions {
  signal?: AbortSignal;
}

/**
 * 为照片墙生成图片版本（小红书式两级加载）
 * @param originalFile - 原始图片文件
 * @returns 包含缩略图和预览图的数组
 */
export async function generateGalleryImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  const versions: ImageVersion[] = [];

  // 1. 生成列表缩略图 - 1080px, 质量80, WebP格式, ~500KB
  // 用于首页Feed流快速加载
  const thumbnailFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 1080,
    maxSizeMB: 0.5,
    initialQuality: 0.8,
    fileType: 'image/webp',
    useWebWorker: true
  });

  const thumbnailDimensions = await getImageDimensions(thumbnailFile);
  versions.push({
    file: thumbnailFile,
    type: 'thumbnail',
    width: thumbnailDimensions.width,
    height: thumbnailDimensions.height
  });

  // 2. 生成高清预览图 - 1440px, 质量90, WebP格式, ~1.5MB
  // 用于点击查看大图
  const previewFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 1440,
    maxSizeMB: 1.5,
    initialQuality: 0.9,
    useWebWorker: true,
    fileType: 'image/webp'
  });

  const previewDimensions = await getImageDimensions(previewFile);
  versions.push({
    file: previewFile,
    type: 'preview',
    width: previewDimensions.width,
    height: previewDimensions.height
  });

  return versions;
}

/**
 * 为返图空间生成多版本图片（缩略图 + 预览图 + 原图）
 * @param originalFile - 原始图片文件
 * @returns 包含三个版本的数组
 */
export async function generateAlbumImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  const versions: ImageVersion[] = [];

  // 1. 生成缩略图 - 600px, 质量85, WebP格式, ~600KB
  // 提升列表展示质量，利用CDN加速优势
  const thumbnailFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 600,
    maxSizeMB: 0.6,
    initialQuality: 0.85,
    fileType: 'image/webp',
    useWebWorker: true
  });

  const thumbnailDimensions = await getImageDimensions(thumbnailFile);
  versions.push({
    file: thumbnailFile,
    type: 'thumbnail',
    width: thumbnailDimensions.width,
    height: thumbnailDimensions.height
  });

  // 2. 生成高质量预览图 - 1920px, 质量95, WebP格式
  // 只有当原图大于2MB时才压缩
  let previewFile: File;
  if (originalFile.size > 2 * 1024 * 1024) {
    previewFile = await imageCompression(originalFile, {
      maxWidthOrHeight: 1920,
      maxSizeMB: 2,
      initialQuality: 0.95,
      useWebWorker: true,
      fileType: 'image/webp'
    });
  } else {
    // 小于2MB，只调整尺寸，不压缩质量
    previewFile = await imageCompression(originalFile, {
      maxWidthOrHeight: 1920,
      initialQuality: 1.0,
      useWebWorker: true,
      fileType: 'image/webp'
    });
  }

  const previewDimensions = await getImageDimensions(previewFile);
  versions.push({
    file: previewFile,
    type: 'preview',
    width: previewDimensions.width,
    height: previewDimensions.height
  });

  // 3. 原图 - 保持原始质量
  const originalDimensions = await getImageDimensions(originalFile);
  versions.push({
    file: originalFile,
    type: 'original',
    width: originalDimensions.width,
    height: originalDimensions.height
  });

  return versions;
}

/**
 * @deprecated 使用 generateGalleryImageVersions 或 generateAlbumImageVersions 替代
 */
export async function generateImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  // 默认使用返图空间的逻辑（向后兼容）
  return generateAlbumImageVersions(originalFile);
}

/**
 * 获取图片尺寸
 */
async function getImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.width, height: img.height });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/**
 * 为首页摆姿生成单一优化版本（对标照片墙列表缩略图）
 * @param file - 原始图片文件
 * @returns 优化后的文件
 */
export async function generatePoseImage(
  file: File,
  options: PoseImageGenerateOptions = {}
): Promise<File> {
  // 如果文件小于500KB，直接返回原文件
  if (file.size <= 500 * 1024) {
    return file;
  }

  const sourceSizeMb = file.size / (1024 * 1024);
  const sourceType = String(file.type ?? '').toLowerCase();
  const isHeavySource = sourceSizeMb >= 8 || sourceType === 'image/png';

  // 使用与照片墙列表一致的配置：1080px, 500KB, 质量0.8
  // 快速切换，流畅体验
  const compressedFile = await imageCompression(file, {
    // 重图/PNG压缩时适度放宽目标体积，减少循环次数，降低超时概率。
    maxSizeMB: isHeavySource ? 1.2 : 0.5,
    maxWidthOrHeight: 1080,
    initialQuality: isHeavySource ? 0.72 : 0.8,
    fileType: 'image/webp',
    useWebWorker: true,
    maxIteration: isHeavySource ? 6 : 10,
    signal: options.signal,
  });

  return compressedFile;
}
