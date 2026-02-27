import 'server-only';

import { getCloudBaseTempFileUrls, resolveCloudBaseFileId } from '@/lib/cloudbase/storage';

export const DEFAULT_STORAGE_TEMP_URL_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

const SIGNED_URL_QUERY_KEYS = new Set([
  'sign',
  'signature',
  'token',
  'expires',
  'authorization',
  'x-cos-security-token',
  'x-cos-signature',
  'x-cos-expires',
]);

function shouldResolveCloudBaseStorageUrl(input: unknown): boolean {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return false;
  }

  if (raw.startsWith('cloud://')) {
    return true;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    // 公开 URL 直接透传，减少额外 getTempFileURL 调用。
    // 仅当 URL 携带明显签名参数时，才尝试刷新临时链接，兼容历史数据。
    try {
      const url = new URL(raw);
      if (!url.search) {
        return false;
      }
      for (const key of url.searchParams.keys()) {
        if (SIGNED_URL_QUERY_KEYS.has(String(key).toLowerCase())) {
          return true;
        }
      }
    } catch {
      return false;
    }
    return false;
  }

  // 相对路径默认视为 CloudBase 存储路径（如 albums/xxx.webp）。
  return true;
}

async function resolveCloudBaseStorageTempUrls(inputs: string[], maxAgeSeconds: number): Promise<Map<string, string>> {
  const fileIdByInput = new Map<string, string>();
  const fileIds: string[] = [];

  (inputs ?? [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean)
    .forEach((value) => {
      if (!shouldResolveCloudBaseStorageUrl(value)) {
        return;
      }

      let fileId: string | null = null;
      try {
        fileId = resolveCloudBaseFileId(value);
      } catch {
        fileId = null;
      }

      if (!fileId) {
        return;
      }

      fileIdByInput.set(value, fileId);
      fileIds.push(fileId);
    });

  const uniqueFileIds = Array.from(new Set(fileIds));
  if (uniqueFileIds.length === 0) {
    return new Map();
  }

  try {
    const tempUrlByFileId = await getCloudBaseTempFileUrls(uniqueFileIds, maxAgeSeconds);
    const tempUrlByInput = new Map<string, string>();

    fileIdByInput.forEach((fileId, value) => {
      const tempUrl = tempUrlByFileId.get(fileId);
      if (tempUrl) {
        tempUrlByInput.set(value, tempUrl);
      }
    });

    return tempUrlByInput;
  } catch {
    return new Map();
  }
}

export async function hydrateCloudBaseTempUrlsInRows(
  rows: Array<Record<string, any>>,
  fields: string[],
  maxAgeSeconds: number = DEFAULT_STORAGE_TEMP_URL_MAX_AGE_SECONDS
): Promise<void> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return;
  }

  const candidates: string[] = [];
  rows.forEach((row) => {
    fields.forEach((field) => {
      const value = String(row?.[field] ?? '').trim();
      if (!value) return;
      if (!shouldResolveCloudBaseStorageUrl(value)) return;
      candidates.push(value);
    });
  });

  if (candidates.length === 0) {
    return;
  }

  const tempUrlByValue = await resolveCloudBaseStorageTempUrls(candidates, maxAgeSeconds);
  if (tempUrlByValue.size === 0) {
    return;
  }

  rows.forEach((row) => {
    fields.forEach((field) => {
      const value = String(row?.[field] ?? '').trim();
      if (!value) return;
      const tempUrl = tempUrlByValue.get(value);
      if (tempUrl) {
        row[field] = tempUrl;
      }
    });
  });
}
