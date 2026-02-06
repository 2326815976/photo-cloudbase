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
 * 下载照片（支持Android原生、微信浏览器、Web）
 * @param url 照片URL
 * @param filename 文件名（可选，默认从URL提取）
 */
export async function downloadPhoto(url: string, filename?: string): Promise<void> {
  if (typeof window === 'undefined') return;

  const finalFilename = filename || url.split('/').pop() || 'photo.jpg';

  // 1. Android原生下载
  if (window.AndroidPhotoDownload) {
    window.AndroidPhotoDownload.downloadPhoto(url, finalFilename);
    return;
  }

  // 2. 微信浏览器：使用Canvas转换下载
  const { isWechatBrowser, downloadImageInWechat } = await import('./wechat');
  if (isWechatBrowser()) {
    try {
      await downloadImageInWechat(url, finalFilename);
      return;
    } catch (error) {
      console.error('微信浏览器下载失败，尝试传统方式:', error);
      // 降级到传统方式
    }
  }

  // 3. Web端降级：使用浏览器下载
  const link = document.createElement('a');
  link.href = url;
  link.download = finalFilename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 读取剪贴板内容
 * 注意：微信浏览器不支持读取剪贴板，会返回空字符串
 */
export async function getClipboardText(): Promise<string> {
  if (typeof window === 'undefined') return '';

  if (window.AndroidClipboard) {
    // Android原生读取
    return window.AndroidClipboard.getClipboardText();
  } else {
    // Web端：尝试使用Clipboard API
    try {
      return await navigator.clipboard.readText();
    } catch (error) {
      // 静默失败（浏览器安全限制是正常情况，特别是微信浏览器）
      return '';
    }
  }
}

/**
 * 写入内容到剪贴板（同步版本，兼容微信浏览器）
 */
export function setClipboardText(text: string): boolean {
  if (typeof window === 'undefined') return false;

  if (window.AndroidClipboard) {
    // Android原生写入
    window.AndroidClipboard.setClipboardText(text);
    return true;
  }

  // 优先使用 execCommand（微信浏览器兼容性更好）
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.top = '0';
    textarea.style.left = '0';
    textarea.style.width = '2em';
    textarea.style.height = '2em';
    textarea.style.padding = '0';
    textarea.style.border = 'none';
    textarea.style.outline = 'none';
    textarea.style.boxShadow = 'none';
    textarea.style.background = 'transparent';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    // 必须在同步上下文中执行
    const successful = document.execCommand('copy');
    document.body.removeChild(textarea);

    return successful;
  } catch (error) {
    console.error('剪贴板写入失败:', error);
    return false;
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

