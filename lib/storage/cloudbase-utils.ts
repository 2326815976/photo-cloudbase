/**
 * CloudBase 云存储 URL 工具函数（客户端安全）
 */

/**
 * 从 URL 中提取存储路径。
 * @param url - 完整 URL（如：https://xxx.com/albums/a.webp）
 * @returns 存储路径（如：albums/a.webp）
 */
export function extractStorageKeyFromURL(url: string): string | null {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname.replace(/^\/+/, '');
  } catch {
    return null;
  }
}
