/**
 * 微信浏览器检测和下载工具
 */

/**
 * 检测是否在微信浏览器中
 */
export function isWechatBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger/.test(ua);
}

/**
 * 检测是否在微信小程序的 WebView 中
 */
export function isWechatMiniProgram(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent.toLowerCase();
  return /miniprogram/.test(ua);
}

/**
 * 在微信浏览器中下载图片（使用 Canvas 转换）
 * @param url - 图片 URL
 * @param filename - 文件名
 */
export async function downloadImageInWechat(url: string, filename: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous'; // 处理跨域

    img.onload = () => {
      try {
        // 创建 Canvas
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('无法创建 Canvas 上下文'));
          return;
        }

        // 绘制图片
        ctx.drawImage(img, 0, 0);

        // 转换为 Blob
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('图片转换失败'));
            return;
          }

          // 创建下载链接
          const blobUrl = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = blobUrl;
          link.download = filename;
          link.style.display = 'none';

          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);

          // 清理
          setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
          resolve();
        }, 'image/jpeg', 0.95);
      } catch (error) {
        reject(error);
      }
    };

    img.onerror = () => {
      reject(new Error('图片加载失败'));
    };

    img.src = url;
  });
}

