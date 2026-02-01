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
 * 生成多版本图片
 * @param originalFile - 原始图片文件
 * @returns 包含三个版本的数组
 */
export async function generateImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  const versions: ImageVersion[] = [];

  // 1. 生成速览图 (thumbnail) - 300px, 质量75, ~50-100KB
  const thumbnailFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 300,
    maxSizeMB: 0.1,  // 强制限制文件大小不超过 100KB
    quality: 0.75,
    useWebWorker: true
  });

  const thumbnailDimensions = await getImageDimensions(thumbnailFile);
  versions.push({
    file: thumbnailFile,
    type: 'thumbnail',
    width: thumbnailDimensions.width,
    height: thumbnailDimensions.height
  });

  // 2. 生成高质量预览图 (preview) - 1200px, 质量85, ~300-500KB
  const previewFile = await imageCompression(originalFile, {
    maxWidthOrHeight: 1200,
    maxSizeMB: 0.5,  // 强制限制文件大小不超过 500KB
    quality: 0.85,
    useWebWorker: true
  });

  const previewDimensions = await getImageDimensions(previewFile);
  versions.push({
    file: previewFile,
    type: 'preview',
    width: previewDimensions.width,
    height: previewDimensions.height
  });

  // 3. 原图 (original) - 保持原始质量
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

  // 如果文件已经小于阈值，直接返回
  if (file.size <= maxSizeKB * 1024) {
    return file;
  }

  // 压缩到指定大小
  const compressedFile = await imageCompression(file, {
    maxSizeMB,
    maxWidthOrHeight: 1920,
    quality: 0.85,
    useWebWorker: true
  });

  return compressedFile;
}
