/**
 * 平台检测工具
 * 用于识别应用运行环境（Android App / iOS / Web）
 */

declare global {
  interface Window {
    AndroidPhotoDownload?: {
      downloadPhoto: (url: string, filename: string) => void;
    };
    AndroidClipboard?: {
      getClipboardText: () => string;
      setClipboardText: (text: string) => void;
      hasClipboardText: () => boolean;
    };
    AndroidPhotoViewer?: {
      openPhotoViewer: (photosJson: string, position: number) => void;
    };
    AndroidVibrate?: {
      vibrate: (duration: number) => void;
    };
    AndroidShare?: {
      shareContent: (text: string, url: string) => void;
    };
  }
}

/**
 * 检测是否在 Android App 环境中运行
 * 使用 UserAgent 检测，避免依赖 JavaScript Bridge 的注入时机
 */
export function isAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;

  // 优先使用 UserAgent 检测（更可靠，不依赖 Bridge 注入时机）
  const userAgent = navigator.userAgent || '';
  // 检测特定的App标识或Android WebView特征
  // 增强检测：包含更多Android WebView特征
  const isAndroidWebView = /SloganApp|median|gonative|Android.*wv|Android.*Version\/[\d.]+.*Chrome|; wv\)|Android.*AppleWebKit.*\(KHTML, like Gecko\).*Chrome/i.test(userAgent);

  // 备用方案：检测 Bridge 对象（用于确认）
  const hasBridge = !!(window.AndroidPhotoDownload || window.AndroidClipboard || window.AndroidPhotoViewer);

  // 调试日志（仅开发环境）
  if (process.env.NODE_ENV !== 'production' && typeof console !== 'undefined') {
    console.log('[Platform Detection] ==================');
    console.log('[Platform] UserAgent:', userAgent);
    console.log('[Platform] isAndroidWebView:', isAndroidWebView);
    console.log('[Platform] hasBridge:', hasBridge);
    console.log('[Platform] Final Result:', isAndroidWebView || hasBridge);
    console.log('[Platform Detection] ==================');
  }

  return isAndroidWebView || hasBridge;
}

/**
 * 获取当前平台类型
 */
export function getPlatform(): 'android' | 'ios' | 'web' {
  if (typeof window === 'undefined') return 'web';

  if (isAndroidApp()) return 'android';

  const userAgent = navigator.userAgent || navigator.vendor;
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios';

  return 'web';
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}
