/**
 * 客户端上传工具（CloudBase 云存储）
 */

type StorageFolder = 'albums' | 'gallery' | 'poses' | 'releases';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB，与服务端限制一致

/**
 * 客户端上传文件（内部调用 /api/upload）。
 * @param file - 要上传的文件
 * @param key - 相对路径（不含 folder 前缀）
 * @param folder - 逻辑目录
 * @returns 可访问 URL
 */
export async function uploadToCloudBaseDirect(
  file: File,
  key: string,
  folder: StorageFolder
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`);
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('key', key);
  formData.append('folder', folder);

  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData,
  });

  const payload = await response.json().catch(() => ({} as any));
  if (!response.ok) {
    throw new Error(String(payload?.error ?? '上传失败'));
  }

  const url = String(payload?.url ?? '').trim();
  if (!url) {
    throw new Error('上传失败：未返回可访问地址');
  }

  return url;
}
