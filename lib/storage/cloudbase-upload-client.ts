/**
 * 客户端上传工具（CloudBase 云存储）
 */

type StorageFolder = 'albums' | 'gallery' | 'poses' | 'releases';

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB，与服务端限制一致
const DEFAULT_UPLOAD_TIMEOUT_MS = 60 * 1000;

interface UploadOptions {
  timeoutMs?: number;
}

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
  folder: StorageFolder,
  options: UploadOptions = {}
): Promise<string> {
  if (file.size > MAX_FILE_SIZE) {
    throw new Error(`文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）`);
  }

  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0
    ? Math.floor(options.timeoutMs!)
    : DEFAULT_UPLOAD_TIMEOUT_MS;

  const formData = new FormData();
  formData.append('file', file);
  formData.append('key', key);
  formData.append('folder', folder);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
  } catch (error: any) {
    const isAbortError = error?.name === 'AbortError';
    if (isAbortError) {
      throw new Error(`上传超时（>${Math.ceil(timeoutMs / 1000)}s）`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

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
