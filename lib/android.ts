/**
 * Android原生功能工具函数
 */

/**
 * 检查是否在Android环境中
 */
export function isAndroid(): boolean {
  return typeof window !== 'undefined' &&
         (!!window.AndroidPhotoDownload || !!window.AndroidClipboard);
}

/**
 * 下载照片（Android原生）
 * @param url 照片URL
 * @param filename 文件名（可选，默认从URL提取）
 */
export function downloadPhoto(url: string, filename?: string): void {
  if (typeof window === 'undefined') return;

  if (window.AndroidPhotoDownload) {
    // Android原生下载
    const finalFilename = filename || url.split('/').pop() || 'photo.jpg';
    window.AndroidPhotoDownload.downloadPhoto(url, finalFilename);
  } else {
    // Web端降级：使用浏览器下载
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'photo.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * 读取剪贴板内容
 */
export async function getClipboardText(): Promise<string> {
  if (typeof window === 'undefined') return '';

  if (window.AndroidClipboard) {
    // Android原生读取
    return window.AndroidClipboard.getClipboardText();
  } else {
    // Web端降级：使用Clipboard API
    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      // 静默失败，不打印错误（浏览器安全限制是正常情况）
      return '';
    }
  }
}

/**
 * 写入内容到剪贴板
 */
export async function setClipboardText(text: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  if (window.AndroidClipboard) {
    // Android原生写入
    window.AndroidClipboard.setClipboardText(text);
    return true;
  } else {
    // Web端降级：使用Clipboard API
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      console.error('写入剪贴板失败:', error);
      return false;
    }
  }
}

/**
 * 检查剪贴板是否有内容
 */
export function hasClipboardText(): boolean {
  if (typeof window === 'undefined') return false;

  if (window.AndroidClipboard) {
    return window.AndroidClipboard.hasClipboardText();
  }
  return false;
}

/**
 * 触觉反馈（震动）
 * @param duration 震动时长（毫秒），默认50ms
 */
export function vibrate(duration: number = 50): void {
  if (typeof window === 'undefined') return;

  // Android 原生震动
  if ((window as any).AndroidVibrate) {
    (window as any).AndroidVibrate.vibrate(duration);
    return;
  }

  // Web 端降级：使用 Vibration API
  if ('vibrate' in navigator) {
    navigator.vibrate(duration);
  }
}

/**
 * 显示Android软键盘
 */
export function showKeyboard(): void {
  if (typeof window === 'undefined') return;

  if ((window as any).AndroidKeyboard) {
    (window as any).AndroidKeyboard.show();
  }
}

/**
 * 隐藏Android软键盘
 */
export function hideKeyboard(): void {
  if (typeof window === 'undefined') return;

  if ((window as any).AndroidKeyboard) {
    (window as any).AndroidKeyboard.hide();
  }
}

