/**
 * 客户端图片压缩工具
 * 在上传前压缩图片以减少存储和传输成本
 */

import imageCompression from 'browser-image-compression';

export interface CompressionOptions {
  maxSizeMB?: number;
  maxWidthOrHeight?: number;
  useWebWorker?: boolean;
  quality?: number;
}

/**
 * 压缩图片文件
 * @param file - 原始图片文件
 * @param options - 压缩选项
 * @returns 压缩后的文件
 */
export async function compressImage(
  file: File,
  options: CompressionOptions = {}
): Promise<File> {
  const defaultOptions = {
    maxSizeMB: 1, // 最大 1MB
    maxWidthOrHeight: 1920, // 最大宽高 1920px
    useWebWorker: true,
    quality: 0.85, // 质量 85%
    ...options
  };

  try {
    const compressedFile = await imageCompression(file, defaultOptions);

    // 如果压缩后反而更大，返回原文件
    if (compressedFile.size > file.size) {
      return file;
    }

    return compressedFile;
  } catch (error) {
    console.error('图片压缩失败:', error);
    return file; // 压缩失败则返回原文件
  }
}

/**
 * 批量压缩图片
 */
export async function compressImages(
  files: File[],
  options?: CompressionOptions,
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  const compressed: File[] = [];

  for (let i = 0; i < files.length; i++) {
    const compressedFile = await compressImage(files[i], options);
    compressed.push(compressedFile);
    onProgress?.(i + 1, files.length);
  }

  return compressed;
}
