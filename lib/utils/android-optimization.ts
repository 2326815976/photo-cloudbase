import { isAndroidWebViewUserAgent } from './platform-detect';

/**
 * Android WebView 性能优化工具
 * 提供针对Android WebView环境的性能优化策略
 */

/**
 * 检测是否在Android WebView环境中运行
 */
export function isAndroidWebView(): boolean {
  if (typeof window === 'undefined') return false;

  const ua = navigator.userAgent.toLowerCase();
  return isAndroidWebViewUserAgent(ua) || !!(window as any).Capacitor;
}

/**
 * 获取优化后的图片加载策略
 * Android WebView中使用更激进的懒加载和预加载策略
 */
export function getImageLoadingStrategy() {
  const isAndroid = isAndroidWebView();

  return {
    // 懒加载阈值（像素）
    lazyLoadThreshold: isAndroid ? 200 : 100,

    // 预加载数量
    preloadCount: isAndroid ? 3 : 5,

    // 是否使用低质量占位图
    useLowQualityPlaceholder: isAndroid,

    // 图片解码策略
    decoding: isAndroid ? 'async' as const : 'auto' as const,
  };
}

/**
 * 获取优化后的动画配置
 * Android WebView中禁用或简化动画
 */
export function getAnimationConfig() {
  const isAndroid = isAndroidWebView();

  return {
    // 是否启用动画
    enabled: !isAndroid,

    // 动画持续时间（毫秒）
    duration: isAndroid ? 0 : 300,

    // 是否使用GPU加速
    useGPU: !isAndroid,

    // Framer Motion配置
    reducedMotion: isAndroid ? 'always' as const : 'user' as const,
  };
}

/**
 * 获取优化后的网络请求配置
 * Android WebView中使用更长的超时和更激进的缓存
 */
export function getNetworkConfig() {
  const isAndroid = isAndroidWebView();

  return {
    // 请求超时（毫秒）
    timeout: isAndroid ? 10000 : 5000,

    // 重试次数
    retryCount: isAndroid ? 2 : 3,

    // 缓存时间（毫秒）
    cacheTime: isAndroid ? 60 * 60 * 1000 : 30 * 60 * 1000,

    // 是否启用持久化缓存
    persistentCache: isAndroid,
  };
}

/**
 * 优化页面渲染性能
 * 在Android WebView中应用各种性能优化
 */
export function optimizePageRendering() {
  if (typeof window === 'undefined' || !isAndroidWebView()) return;

  // 禁用不必要的事件监听器
  const passiveEvents = ['touchstart', 'touchmove', 'wheel', 'scroll'];
  passiveEvents.forEach(event => {
    const originalAddEventListener = EventTarget.prototype.addEventListener;
    EventTarget.prototype.addEventListener = function(type, listener, options) {
      if (passiveEvents.includes(type) && typeof options === 'object') {
        options.passive = true;
      }
      return originalAddEventListener.call(this, type, listener, options);
    };
  });

  // 优化字体加载
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      // 字体加载完成，无需额外操作
      // fontDisplay已在CSS中配置
    });
  }

  // 禁用不必要的CSS动画
  const style = document.createElement('style');
  style.textContent = `
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    }
  `;
  document.head.appendChild(style);
}

/**
 * 预热关键资源
 * 在Android WebView中预加载关键资源以提升首屏速度
 */
export function prewarmResources(urls: string[]) {
  if (typeof window === 'undefined') return;

  urls.forEach(url => {
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    link.as = 'fetch';
    document.head.appendChild(link);
  });
}

/**
 * 清理内存
 * 在Android WebView中定期清理不必要的缓存和引用
 */
export function cleanupMemory() {
  if (typeof window === 'undefined' || !isAndroidWebView()) return;

  // 清理过期的图片缓存
  const images = document.querySelectorAll('img[data-loaded="true"]');
  images.forEach((img: Element) => {
    const htmlImg = img as HTMLImageElement;
    if (!htmlImg.complete || htmlImg.naturalHeight === 0) {
      htmlImg.src = '';
    }
  });

  // 触发垃圾回收（如果可用）
  if ((window as any).gc) {
    (window as any).gc();
  }
}
