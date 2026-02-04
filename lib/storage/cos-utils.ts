/**
 * COS 存储工具函数（客户端安全）
 * 这些函数不依赖 Node.js 模块，可以在浏览器环境中使用
 */

/**
 * 从URL中提取COS存储路径
 * @param url - 完整的URL（如：https://xxx.com/albums/timestamp_0_thumbnail.webp）
 * @returns 存储路径（如：albums/timestamp_0_thumbnail.webp）
 */
export function extractKeyFromURL(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // 移除开头的斜杠
    return urlObj.pathname.substring(1);
  } catch {
    return null;
  }
}
