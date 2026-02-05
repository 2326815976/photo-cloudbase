/**
 * Capacitor 原生下载工具
 * 用于在 APK 中实现内置下载功能，不跳转外部浏览器
 */

import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';

/**
 * 下载文件到设备
 * @param url - 文件 URL
 * @param filename - 保存的文件名
 * @returns 下载的文件路径
 */
export async function downloadFile(url: string, filename: string): Promise<string> {
  // 检查是否在原生环境中运行
  if (!Capacitor.isNativePlatform()) {
    // Web 环境：使用传统下载方式
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    return url;
  }

  try {
    // 原生环境：使用 Capacitor Filesystem
    // 1. 下载文件内容
    const response = await fetch(url);
    const blob = await response.blob();

    // 2. 转换为 base64
    const base64Data = await blobToBase64(blob);

    // 3. 保存到设备
    const result = await Filesystem.writeFile({
      path: `Download/${filename}`,
      data: base64Data,
      directory: Directory.External,
      recursive: true,
    });

    // 4. 返回文件路径
    return result.uri;
  } catch (error) {
    console.error('下载失败:', error);
    throw error;
  }
}

/**
 * 批量下载文件
 * @param urls - 文件 URL 数组
 * @param filenamePrefix - 文件名前缀
 * @returns 下载的文件路径数组
 */
export async function downloadMultipleFiles(
  urls: string[],
  filenamePrefix: string = 'photo'
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < urls.length; i++) {
    // 添加500ms间隔，防止浏览器阻止批量下载
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const url = urls[i];
    const extension = url.split('.').pop() || 'jpg';
    const filename = `${filenamePrefix}_${i + 1}.${extension}`;

    try {
      const path = await downloadFile(url, filename);
      results.push(path);
    } catch (error) {
      console.error(`下载文件 ${i + 1} 失败:`, error);
    }
  }

  return results;
}

/**
 * 将 Blob 转换为 Base64
 */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      // 移除 data:image/jpeg;base64, 前缀
      const base64Data = base64.split(',')[1];
      resolve(base64Data);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 检查是否在原生环境中
 */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
