/**
 * 图片预加载工具
 * 用于提前加载即将显示的图片，提升用户体验
 */

interface PreloadOptions {
  priority?: 'high' | 'low';
  crossOrigin?: 'anonymous' | 'use-credentials';
}

/**
 * 预加载单张图片
 */
export function preloadImage(url: string, options: PreloadOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    if (options.crossOrigin) {
      img.crossOrigin = options.crossOrigin;
    }

    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to preload image: ${url}`));
    img.src = url;
  });
}

/**
 * 批量预加载图片
 */
export async function preloadImages(urls: string[], options: PreloadOptions = {}): Promise<void> {
  const promises = urls.map(url => preloadImage(url, options).catch(() => {
    // 忽略单个图片加载失败，不影响其他图片
    console.warn(`Failed to preload: ${url}`);
  }));

  await Promise.all(promises);
}

/**
 * 使用 Intersection Observer 实现懒加载预加载
 * 当图片即将进入视口时提前加载
 */
export function createLazyPreloader(
  threshold: number = 0.5,
  rootMargin: string = '50px'
) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const img = entry.target as HTMLImageElement;
          const src = img.dataset.src;

          if (src && !img.src) {
            img.src = src;
            observer.unobserve(img);
          }
        }
      });
    },
    { threshold, rootMargin }
  );

  return observer;
}
