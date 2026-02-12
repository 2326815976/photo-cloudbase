import 'server-only';

import { Buffer } from 'buffer';
import { env } from '@/lib/env';
import { getCloudBaseApp } from '@/lib/cloudbase/sdk';

export type CloudBaseStorageFolder = 'albums' | 'gallery' | 'poses' | 'releases';

const ALLOWED_FOLDERS = new Set<CloudBaseStorageFolder>(['albums', 'gallery', 'poses', 'releases']);

function normalizeFolder(input: string): CloudBaseStorageFolder {
  const folder = String(input ?? '').trim().toLowerCase() as CloudBaseStorageFolder;
  if (!ALLOWED_FOLDERS.has(folder)) {
    throw new Error(`不支持的 CloudBase 存储目录: ${input}`);
  }
  return folder;
}

function normalizeKey(input: string): string {
  const normalized = String(input ?? '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/\?.*$/, '')
    .replace(/\/+/g, '/');

  if (!normalized) {
    throw new Error('CloudBase 文件路径不能为空');
  }

  if (normalized.includes('..')) {
    throw new Error('CloudBase 文件路径非法');
  }

  return normalized;
}

function ensureCloudPath(folder: CloudBaseStorageFolder, key: string): string {
  const normalizedKey = normalizeKey(key);
  const prefix = `${folder}/`;
  return normalizedKey.startsWith(prefix) ? normalizedKey : `${prefix}${normalizedKey}`;
}

function getStorageDomain(): string {
  const configuredDomain = env.CLOUDBASE_STORAGE_DOMAIN();
  if (configuredDomain) {
    return configuredDomain;
  }

  const bucketId = env.CLOUDBASE_BUCKET_ID();
  if (!bucketId) {
    return '';
  }

  return `https://${bucketId}.tcb.qcloud.la`;
}

function normalizeDomain(domain: string): string {
  const trimmed = String(domain ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function extractCloudPathFromFileId(fileId: string): string | null {
  const normalizedFileId = String(fileId ?? '').trim();
  if (!normalizedFileId.startsWith('cloud://')) {
    return null;
  }

  const slashIndex = normalizedFileId.indexOf('/');
  if (slashIndex < 0 || slashIndex >= normalizedFileId.length - 1) {
    return null;
  }

  return normalizeKey(normalizedFileId.slice(slashIndex + 1));
}

function toFileBuffer(file: File | Blob | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(file)) {
    return Promise.resolve(file);
  }

  return file.arrayBuffer().then((buffer) => Buffer.from(buffer));
}

export function buildCloudBaseFileId(cloudPath: string): string {
  const cloudbaseEnvId = env.CLOUDBASE_ID();
  const bucketId = env.CLOUDBASE_BUCKET_ID();

  if (!cloudbaseEnvId || !bucketId) {
    throw new Error('CloudBase 文件删除需要配置 CLOUDBASE_ID 与 CLOUDBASE_BUCKET_ID');
  }

  const normalizedPath = normalizeKey(cloudPath);
  return `cloud://${cloudbaseEnvId}.${bucketId}/${normalizedPath}`;
}

export function extractCloudPathFromUrl(input: string): string | null {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('cloud://')) {
    return extractCloudPathFromFileId(trimmed);
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const pathFromUrl = new URL(trimmed).pathname;
      return normalizeKey(pathFromUrl);
    } catch {
      return null;
    }
  }

  return normalizeKey(trimmed);
}

export function buildCloudBasePublicUrl(cloudPath: string): string {
  const domain = normalizeDomain(getStorageDomain());
  if (!domain) {
    return '';
  }

  const normalizedPath = normalizeKey(cloudPath);
  return `${domain}/${normalizedPath}`;
}

export async function getCloudBaseTempFileUrl(fileId: string, maxAgeSeconds: number = 3600): Promise<string> {
  const normalizedFileId = String(fileId ?? '').trim();
  if (!normalizedFileId) {
    throw new Error('CloudBase 文件 ID 不能为空');
  }

  const app = getCloudBaseApp();
  const result = await app.getTempFileURL({
    fileList: [
      {
        fileID: normalizedFileId,
        maxAge: Math.max(60, Math.floor(maxAgeSeconds)),
      },
    ],
  });

  const fileInfo = Array.isArray(result?.fileList) ? result.fileList[0] : null;
  if (!fileInfo || fileInfo.code !== 'SUCCESS' || !fileInfo.tempFileURL) {
    throw new Error(`获取 CloudBase 临时下载地址失败: ${fileInfo?.code ?? 'unknown'}`);
  }

  return String(fileInfo.tempFileURL);
}

export async function uploadFileToCloudBase(
  file: File | Blob | Buffer,
  key: string,
  folder: CloudBaseStorageFolder = 'albums'
): Promise<{ fileId: string; downloadUrl: string; cloudPath: string }> {
  const normalizedFolder = normalizeFolder(folder);
  const cloudPath = ensureCloudPath(normalizedFolder, key);
  const fileContent = await toFileBuffer(file);
  const app = getCloudBaseApp();

  const uploadResult = await app.uploadFile({
    cloudPath,
    fileContent,
  });

  const fileId = String(uploadResult?.fileID ?? '').trim();
  if (!fileId) {
    throw new Error('CloudBase 上传失败：未返回 fileID');
  }

  // 优先返回稳定公开域名地址；若未配置公开域名则回退到临时下载地址。
  const publicUrl = buildCloudBasePublicUrl(cloudPath);
  const downloadUrl = publicUrl || (await getCloudBaseTempFileUrl(fileId, 7 * 24 * 60 * 60));

  return {
    fileId,
    downloadUrl,
    cloudPath,
  };
}

export async function uploadReleaseFileToCloudBase(
  file: File | Buffer,
  key: string
): Promise<{ fileId: string; downloadUrl: string; cloudPath: string }> {
  return uploadFileToCloudBase(file, key, 'releases');
}

export async function deleteCloudBaseFiles(fileIds: string[]): Promise<void> {
  const normalizedIds = fileIds
    .map((item) => String(item ?? '').trim())
    .filter(Boolean);

  if (normalizedIds.length === 0) {
    return;
  }

  const app = getCloudBaseApp();
  const result = await app.deleteFile({
    fileList: normalizedIds,
  });

  const ignorableCodes = new Set([
    'FILE_NOT_EXIST',
    'STORAGE_FILE_NONEXIST',
    'RESOURCE_NOT_FOUND',
    'NOT_FOUND',
  ]);

  const failed = (result?.fileList ?? []).filter((item: any) => {
    const code = String(item?.code ?? '').trim().toUpperCase();
    if (!code || code === 'SUCCESS') {
      return false;
    }
    return !ignorableCodes.has(code);
  });

  if (failed.length > 0) {
    const failCodes = failed.map((item: any) => `${item.fileID}:${item.code}`).join(', ');
    throw new Error(`CloudBase 删除文件失败: ${failCodes}`);
  }
}

function resolveToFileId(input: string): string | null {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('cloud://')) {
    return trimmed;
  }

  const cloudPath = extractCloudPathFromUrl(trimmed);
  if (!cloudPath) {
    return null;
  }

  return buildCloudBaseFileId(cloudPath);
}

export async function deleteCloudBaseObjects(inputs: string[]): Promise<void> {
  const fileIds = Array.from(
    new Set(
      inputs
        .map((item) => resolveToFileId(item))
        .filter((item): item is string => Boolean(item))
    )
  );

  if (fileIds.length === 0) {
    return;
  }

  await deleteCloudBaseFiles(fileIds);
}
