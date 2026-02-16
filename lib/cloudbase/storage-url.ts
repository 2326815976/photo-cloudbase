import 'server-only';

import { env } from '@/lib/env';
import { getCloudBaseTempFileUrls, resolveCloudBaseFileId } from '@/lib/cloudbase/storage';

export const DEFAULT_STORAGE_TEMP_URL_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function normalizeAbsoluteOrigin(input: string): string {
  const trimmed = String(input ?? '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function getConfiguredStorageHosts(): Set<string> {
  const hosts = new Set<string>();

  const configuredDomain = normalizeAbsoluteOrigin(env.CLOUDBASE_STORAGE_DOMAIN());
  if (!configuredDomain) {
    return hosts;
  }

  try {
    hosts.add(new URL(configuredDomain).hostname.toLowerCase());
  } catch {
    // ignore
  }

  return hosts;
}

function isCloudBaseStorageHttpUrl(url: string): boolean {
  const trimmed = String(url ?? '').trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }

  try {
    const host = new URL(trimmed).hostname.toLowerCase();
    if (host === 'tcb.qcloud.la' || host.endsWith('.tcb.qcloud.la')) {
      return true;
    }

    // 自定义域名场景：依然视为 CloudBase 存储 URL（仅用于生成临时签名 URL）。
    const configuredHosts = getConfiguredStorageHosts();
    return configuredHosts.has(host);
  } catch {
    return false;
  }
}

function shouldResolveCloudBaseStorageUrl(input: unknown): boolean {
  const raw = String(input ?? '').trim();
  if (!raw) {
    return false;
  }

  if (raw.startsWith('cloud://')) {
    return true;
  }

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    return isCloudBaseStorageHttpUrl(raw);
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

