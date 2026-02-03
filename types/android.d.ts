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

interface Window {
  AndroidPhotoViewer?: AndroidPhotoViewer;
  AndroidPhotoDownload?: AndroidPhotoDownload;
}
