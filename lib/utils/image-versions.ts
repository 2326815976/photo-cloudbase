/**
 * 多版本图片生成工具
 * 按场景生成图片版本（照片墙：thumbnail + preview；返图空间：thumbnail + original）
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

const GALLERY_THUMBNAIL_VERSION_OPTIONS = {
  maxWidthOrHeight: 1280,
  maxSizeMB: 0.9,
  initialQuality: 0.82,
  fileType: 'image/webp' as const,
  useWebWorker: true
};

const ALBUM_THUMBNAIL_VERSION_OPTIONS = {
  maxWidthOrHeight: 1600,
  maxSizeMB: 1.6,
  initialQuality: 0.9,
  fileType: 'image/webp' as const,
  useWebWorker: true
};

const PREVIEW_VERSION_OPTIONS = {
  maxWidthOrHeight: 2560,
  maxSizeMB: 3.5,
  initialQuality: 0.92,
  useWebWorker: true,
  fileType: 'image/webp' as const
};

async function buildThumbnailVersion(
  originalFile: File,
  options: typeof GALLERY_THUMBNAIL_VERSION_OPTIONS
): Promise<ImageVersion> {
  const thumbnailFile = await imageCompression(originalFile, options);
  const thumbnailDimensions = await getImageDimensions(thumbnailFile);
  return {
    file: thumbnailFile,
    type: 'thumbnail',
    width: thumbnailDimensions.width,
    height: thumbnailDimensions.height
  };
}

async function buildPreviewVersion(originalFile: File): Promise<ImageVersion> {
  const previewFile = await imageCompression(originalFile, PREVIEW_VERSION_OPTIONS);
  const previewDimensions = await getImageDimensions(previewFile);
  return {
    file: previewFile,
    type: 'preview',
    width: previewDimensions.width,
    height: previewDimensions.height
  };
}

async function buildOriginalVersion(originalFile: File): Promise<ImageVersion> {
  const originalDimensions = await getImageDimensions(originalFile);
  return {
    file: originalFile,
    type: 'original',
    width: originalDimensions.width,
    height: originalDimensions.height
  };
}

/**
 * 为照片墙生成图片版本（小红书式两级加载）
 * @param originalFile - 原始图片文件
 * @returns 包含缩略图和预览图的数组
 */
export async function generateGalleryImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  const thumbnailVersion = await buildThumbnailVersion(originalFile, GALLERY_THUMBNAIL_VERSION_OPTIONS);
  const previewVersion = await buildPreviewVersion(originalFile);
  return [thumbnailVersion, previewVersion];
}

/**
 * 为返图空间生成双版本图片（列表图 + 原图）
 * @param originalFile - 原始图片文件
 * @returns 包含缩略图与原图的数组
 */
export async function generateAlbumImageVersions(
  originalFile: File
): Promise<ImageVersion[]> {
  const thumbnailVersion = await buildThumbnailVersion(originalFile, ALBUM_THUMBNAIL_VERSION_OPTIONS);
  const originalVersion = await buildOriginalVersion(originalFile);
  return [thumbnailVersion, originalVersion];
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
