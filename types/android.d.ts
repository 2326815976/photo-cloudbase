/**
 * Android原生接口类型声明
 * 通过JavaScriptInterface注入到window对象
 */

interface AndroidPhotoDownload {
  /**
   * 下载照片到本地
   * @param url 照片URL
   * @param filename 文件名
   */
  downloadPhoto(url: string, filename: string): void;
}

interface AndroidClipboard {
  /**
   * 读取剪贴板内容
   * @returns 剪贴板中的文本内容
   */
  getClipboardText(): string;

  /**
   * 写入内容到剪贴板
   * @param text 要写入的文本内容
   */
  setClipboardText(text: string): void;

  /**
   * 检查剪贴板是否有内容
   * @returns true 如果剪贴板有内容
   */
  hasClipboardText(): boolean;
}

interface Window {
  AndroidPhotoDownload?: AndroidPhotoDownload;
  AndroidClipboard?: AndroidClipboard;
}
