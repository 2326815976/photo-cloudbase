/**
 * Android原生桥接接口类型声明
 */

interface AndroidPhotoViewer {
  /**
   * 打开原生图片查看器
   * @param photosJson JSON数组格式的图片URL列表
   * @param position 当前查看的图片索引（从0开始）
   */
  openPhotoViewer(photosJson: string, position: number): void;
}

interface AndroidPhotoDownload {
  /**
   * 下载照片到本地相册
   * @param url 图片URL
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

interface AndroidVibrate {
  /**
   * 触发设备震动
   * @param duration 震动时长（毫秒）
   */
  vibrate(duration: number): void;
}

interface AndroidKeyboard {
  /**
   * 显示软键盘
   */
  show(): void;

  /**
   * 隐藏软键盘
   */
  hide(): void;
}

interface Window {
  AndroidPhotoViewer?: AndroidPhotoViewer;
  AndroidPhotoDownload?: AndroidPhotoDownload;
  AndroidClipboard?: AndroidClipboard;
  AndroidVibrate?: AndroidVibrate;
  AndroidKeyboard?: AndroidKeyboard;
}
