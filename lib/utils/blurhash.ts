/**
 * BlurHash 工具函数
 * 用于生成和解码图片的 BlurHash 占位符
 */

import { encode } from 'blurhash';

/**
 * 从文件生成 BlurHash
 * @param file - 图片文件
 * @returns BlurHash 字符串
 */
export async function generateBlurHash(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      // 缩小尺寸以加快编码速度
      const scale = 32 / Math.max(img.width, img.height);
      canvas.width = Math.floor(img.width * scale);
      canvas.height = Math.floor(img.height * scale);

      ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
      const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);

      if (!imageData) {
        reject(new Error('无法获取图片数据'));
        return;
      }

      // 生成 BlurHash (4x3 组件，质量和性能平衡)
      const hash = encode(
        imageData.data,
        imageData.width,
        imageData.height,
        4,
        3
      );

      resolve(hash);
    };

    img.onerror = () => reject(new Error('图片加载失败'));
    img.src = URL.createObjectURL(file);
  });
}
