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

/**
 * 批量下载图片（使用 JSZip 打包）
 * 需要安装 jszip: npm install jszip
 */
export async function downloadImagesAsZip(
  urls: string[],
  zipFilename: string = 'photos.zip'
): Promise<void> {
  try {
    // 动态导入 JSZip
    const JSZip = (await import('jszip')).default;
    const zip = new JSZip();

    // 下载所有图片并添加到 ZIP
    const promises = urls.map(async (url, index) => {
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const extension = url.split('.').pop() || 'jpg';
        zip.file(`photo_${index + 1}.${extension}`, blob);
      } catch (error) {
        console.error(`下载图片 ${index + 1} 失败:`, error);
      }
    });

    await Promise.all(promises);

    // 生成 ZIP 文件
    const zipBlob = await zip.generateAsync({ type: 'blob' });

    // 创建下载链接
    const blobUrl = URL.createObjectURL(zipBlob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = zipFilename;
    link.style.display = 'none';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 清理
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100);
  } catch (error) {
    console.error('批量下载失败:', error);
    throw error;
  }
}
