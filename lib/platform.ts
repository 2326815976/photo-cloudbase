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
 */
export function isAndroidApp(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.AndroidPhotoDownload || window.AndroidClipboard);
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
