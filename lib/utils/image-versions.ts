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

/**
 * 为照片墙生成图片版本（仅预览图，无缩略图）
 * @param originalFile - 原始图片文件
 * @returns 包含预览图的数组
 */
export async function generateGalleryImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  const versions: ImageVersion[] = [];

  // 生成高质量预览图 - 1920px, 质量92, WebP格式, ~1MB
  const previewFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 1920,
    maxSizeMB: 1,
    initialQuality: 0.92,
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

  // 1. 生成缩略图 - 400px, 质量90, WebP格式, ~200KB
  const thumbnailFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 400,
    maxSizeMB: 0.2,
    initialQuality: 0.9,
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
 * 为首页摆姿生成单一优化版本
 * @param file - 原始图片文件
 * @param maxSizeKB - 最大文件大小（KB），默认 500KB
 * @returns 优化后的文件
 */
export async function generatePoseImage(
  file: File,
  maxSizeKB: number = 500
): Promise<File> {
  const maxSizeMB = maxSizeKB / 1024;

  // 如果文件小于1MB，直接返回原文件
  if (file.size <= 1024 * 1024) {
    return file;
  }

  // 压缩到指定大小（WebP格式）
  const compressedFile = await imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight: 1920,
    initialQuality: 0.9,
    fileType: 'image/webp',
    useWebWorker: true
  });

  return compressedFile;
}
