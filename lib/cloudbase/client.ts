import { env } from '@/lib/env';
import { DbQueryPayload } from '@/lib/cloudbase/query-types';
import { buildCompatClient } from '@/lib/cloudbase/compat/core';

interface CompatError {
  message: string;
  code?: string;
}

type CompatClient = ReturnType<typeof buildCompatClient>;
type SessionResponse = { ok: boolean; body: any };
type JsonResponse = { ok: boolean; status: number; body: any };

const SESSION_CACHE_TTL_MS = 45 * 1000;
const CLIENT_TRANSIENT_RETRY_TIMES = 1;
const CLIENT_TRANSIENT_RETRY_DELAY_MS = 320;
const CLIENT_READY_CACHE_TTL_MS = 300;
const TRANSIENT_BACKEND_ERROR_CODE = 'TRANSIENT_BACKEND';
const NON_RETRYABLE_RPC_FUNCTIONS = new Set(['pin_photo_to_wall']);

let compatClientInstance: CompatClient | null = null;
let cachedSessionResponse: SessionResponse | null = null;
let cachedSessionAt = 0;
let pendingSessionRequest: Promise<SessionResponse> | null = null;
let pendingReadyProbe: Promise<boolean> | null = null;
let cachedReadyProbe: { ok: boolean; expiresAt: number } | null = null;

function normalizeCompatError(input: unknown, fallback: string): CompatError {
  if (input && typeof input === 'object') {
    const maybeMessage = (input as { message?: unknown }).message;
    const maybeCode = (input as { code?: unknown }).code;
    if (typeof maybeMessage === 'string' && maybeMessage.trim() !== '') {
      return {
        message: maybeMessage,
        code: typeof maybeCode === 'string' ? maybeCode : undefined,
      };
    }
  }

  if (input instanceof Error) {
    return { message: input.message || fallback };
  }

  return { message: fallback };
}

async function parseResponseBody(response: Response): Promise<any> {
  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

async function wait(ms: number): Promise<void> {
  if (ms <= 0) {
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientBackendBody(body: any): boolean {
  return String(body?.error?.code || '').trim().toUpperCase() === TRANSIENT_BACKEND_ERROR_CODE;
}

async function fetchJsonOnce(url: string, init: RequestInit): Promise<JsonResponse> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  });

  const body = await parseResponseBody(response);
  return {
    ok: response.ok,
    status: response.status,
    body,
  };
}

async function probeBackendReady(): Promise<boolean> {
  const now = Date.now();
  if (cachedReadyProbe && cachedReadyProbe.expiresAt > now) {
    return cachedReadyProbe.ok;
  }

  if (pendingReadyProbe) {
    return pendingReadyProbe;
  }

  pendingReadyProbe = fetchJsonOnce('/api/health/ready', {
    method: 'GET',
    cache: 'no-store',
  })
    .then((result) => {
      const ok = result.ok && result.body?.ok === true;
      cachedReadyProbe = {
        ok,
        expiresAt: Date.now() + CLIENT_READY_CACHE_TTL_MS,
      };
      return ok;
    })
    .catch(() => {
      cachedReadyProbe = {
        ok: false,
        expiresAt: Date.now() + CLIENT_READY_CACHE_TTL_MS,
      };
      return false;
    })
    .finally(() => {
      pendingReadyProbe = null;
    });

  return pendingReadyProbe;
}

async function requestJson(
  url: string,
  init: RequestInit & { backendRecovery?: { disabled?: boolean; skipReadyGate?: boolean } }
): Promise<{ ok: boolean; body: any }> {
  const { backendRecovery, ...fetchInit } = init;
  const disableRecovery = backendRecovery?.disabled === true || url === '/api/health/ready';
  const skipReadyGate = backendRecovery?.skipReadyGate === true;
  const totalAttempts = disableRecovery ? 1 : CLIENT_TRANSIENT_RETRY_TIMES + 1;
  let lastResult: JsonResponse | null = null;

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      const result = await fetchJsonOnce(url, fetchInit);
      lastResult = result;
      const isTransientFailure = result.status === 503 || isTransientBackendBody(result.body);

      if (!isTransientFailure || attempt === totalAttempts - 1) {
        return {
          ok: result.ok,
          body: result.body,
        };
      }

      if (!skipReadyGate) {
        await probeBackendReady();
      }

      await wait(CLIENT_TRANSIENT_RETRY_DELAY_MS * (attempt + 1));
    } catch (error) {
      if (attempt === totalAttempts - 1) {
        throw error;
      }

      if (!skipReadyGate) {
        await probeBackendReady();
      }

      await wait(CLIENT_TRANSIENT_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  return {
    ok: lastResult?.ok ?? false,
    body: lastResult?.body ?? null,
  };
}

function clearSessionCache() {
  cachedSessionResponse = null;
  cachedSessionAt = 0;
  pendingSessionRequest = null;
}

async function fetchSessionResponse(force = false): Promise<SessionResponse> {
  if (!force && cachedSessionResponse) {
    const age = Date.now() - cachedSessionAt;
    if (age >= 0 && age <= SESSION_CACHE_TTL_MS) {
      return cachedSessionResponse;
    }
  }

  if (!force && pendingSessionRequest) {
    return pendingSessionRequest;
  }

  pendingSessionRequest = requestJson('/api/auth/session', {
    method: 'GET',
    backendRecovery: { skipReadyGate: true },
  })
    .then((result) => {
      if (result.ok && !result.body?.error) {
        cachedSessionResponse = result;
        cachedSessionAt = Date.now();
      } else {
        clearSessionCache();
      }
      return result;
    })
    .catch((error) => {
      clearSessionCache();
      throw error;
    })
    .finally(() => {
      pendingSessionRequest = null;
    });

  return pendingSessionRequest;
}

type StorageFolder = 'albums' | 'gallery' | 'poses' | 'releases';

function mapBucketToFolder(bucket: string): StorageFolder {
  switch (bucket) {
    case 'albums':
      return 'albums';
    case 'gallery':
      return 'gallery';
    case 'poses':
      return 'poses';
    case 'apk-releases':
    case 'releases':
      return 'releases';
    default:
      return 'gallery';
  }
}

function resolveStoragePath(bucket: string, path: string): { folder: StorageFolder; relativePath: string; fullPath: string } {
  const folder = mapBucketToFolder(bucket);
  const normalized = path.replace(/^\/+/, '');
  const prefix = `${folder}/`;
  const relativePath = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  const safeRelativePath = relativePath.replace(/^\/+/, '');
  const fullPath = `${folder}/${safeRelativePath}`;

  return {
    folder,
    relativePath: safeRelativePath,
    fullPath,
  };
}

function resolveCloudBaseStorageDomain(): string {
  const explicitDomain = env.CLOUDBASE_STORAGE_DOMAIN().replace(/\/+$/, '');
  if (explicitDomain) {
    return explicitDomain;
  }

  const bucketId = env.CLOUDBASE_BUCKET_ID();
  if (!bucketId) {
    return '';
  }

  return `https://${bucketId}.tcb.qcloud.la`;
}

function resolvePublicUrl(bucket: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const storageDomain = resolveCloudBaseStorageDomain();
  if (!storageDomain) {
    return path;
  }

  const resolvedPath = resolveStoragePath(bucket, path).fullPath;
  return `${storageDomain}/${resolvedPath}`;
}

function buildBrowserCompatClient(): CompatClient {
  return buildCompatClient({
    queryExecutor: async (payload: DbQueryPayload) => {
      try {
        const { ok, body } = await requestJson('/api/db/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const error = body?.error
          ? normalizeCompatError(body.error, '数据库查询失败')
          : ok
            ? null
            : normalizeCompatError(null, '数据库查询失败');

        return {
          data: body?.data ?? null,
          error,
          count: body?.count ?? null,
        };
      } catch (error) {
        return {
          data: null,
          error: normalizeCompatError(error, '数据库查询失败'),
          count: null,
        };
      }
    },
    rpcExecutor: async (functionName: string, args?: Record<string, unknown>) => {
      try {
        const disableBackendRecovery = NON_RETRYABLE_RPC_FUNCTIONS.has(String(functionName || '').trim());
        const { ok, body } = await requestJson('/api/db/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            functionName,
            args: args ?? {},
          }),
          backendRecovery: disableBackendRecovery
            ? {
                disabled: true,
                skipReadyGate: true,
              }
            : undefined,
        });

        const error = body?.error
          ? normalizeCompatError(body.error, 'RPC 调用失败')
          : ok
            ? null
            : normalizeCompatError(null, 'RPC 调用失败');

        return {
          data: body?.data ?? null,
          error,
        };
      } catch (error) {
        return {
          data: null,
          error: normalizeCompatError(error, 'RPC 调用失败'),
        };
      }
    },
    authClient: {
      getUser: async () => {
        try {
          const { ok, body } = await fetchSessionResponse();

          if (!ok && !body?.error) {
            return {
              data: { user: null },
              error: normalizeCompatError(null, '获取用户失败'),
            };
          }

          return {
            data: { user: body?.user ?? null },
            error: body?.error ? normalizeCompatError(body.error, '获取用户失败') : null,
          };
        } catch (error) {
          return {
            data: { user: null },
            error: normalizeCompatError(error, '获取用户失败'),
          };
        }
      },
      getSession: async () => {
        try {
          const { ok, body } = await fetchSessionResponse();

          if (!ok && !body?.error) {
            return {
              data: { session: null },
              error: normalizeCompatError(null, '获取会话失败'),
            };
          }

          return {
            data: {
              session: body?.session ?? (body?.user ? { user: body.user } : null),
            },
            error: body?.error ? normalizeCompatError(body.error, '获取会话失败') : null,
          };
        } catch (error) {
          return {
            data: { session: null },
            error: normalizeCompatError(error, '获取会话失败'),
          };
        }
      },
      signInWithPassword: async (params: { phone: string; password: string }) => {
        clearSessionCache();
        try {
          const { ok, body } = await requestJson('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          });

          if (!ok || body?.error) {
            return {
              data: { user: null },
              error: normalizeCompatError(body?.error, 'Invalid login credentials'),
            };
          }

          clearSessionCache();
          clearSessionCache();
          return {
            data: { user: body?.data?.user ?? null },
            error: null,
          };
        } catch (error) {
          return {
            data: { user: null },
            error: normalizeCompatError(error, 'Invalid login credentials'),
          };
        }
      },
      signOut: async () => {
        clearSessionCache();
        try {
          const { ok, body } = await requestJson('/api/auth/logout', {
            method: 'POST',
          });

          if (!ok || body?.error) {
            return {
              error: normalizeCompatError(body?.error, '登出失败'),
            };
          }

          return { error: null };
        } catch (error) {
          return {
            error: normalizeCompatError(error, '登出失败'),
          };
        }
      },
      updateUser: async (params: {
        password?: string;
        currentPassword?: string;
        name?: string;
        phone?: string | null;
        wechat?: string | null;
      }) => {
        clearSessionCache();
        try {
          const { ok, body } = await requestJson('/api/auth/update-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          });

          if (!ok || body?.error) {
            return {
              data: { user: null },
              error: normalizeCompatError(body?.error, '更新用户失败'),
            };
          }

          clearSessionCache();
          return {
            data: { user: body?.data?.user ?? null },
            error: null,
          };
        } catch (error) {
          return {
            data: { user: null },
            error: normalizeCompatError(error, '更新用户失败'),
          };
        }
      },
      resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
        try {
          const { ok, body } = await requestJson('/api/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              redirectTo: options?.redirectTo,
            }),
          });

          if (!ok || body?.error) {
            return {
              data: null,
              error: normalizeCompatError(body?.error, '发送重置邮件失败'),
            };
          }

          return {
            data: null,
            error: null,
          };
        } catch (error) {
          return {
            data: null,
            error: normalizeCompatError(error, '发送重置邮件失败'),
          };
        }
      },
      verifyOtp: async (params: Record<string, unknown>) => {
        try {
          const { ok, body } = await requestJson('/api/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params),
          });

          if (!ok || body?.error) {
            return {
              data: null,
              error: normalizeCompatError(body?.error, '验证失败'),
            };
          }

          return {
            data: null,
            error: null,
          };
        } catch (error) {
          return {
            data: null,
            error: normalizeCompatError(error, '验证失败'),
          };
        }
      },
      exchangeCodeForSession: async (code: string) => {
        clearSessionCache();
        try {
          const { ok, body } = await requestJson('/api/auth/exchange-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code }),
          });

          if (!ok || body?.error) {
            return {
              data: { session: null },
              error: normalizeCompatError(body?.error, '代码交换失败'),
            };
          }

          clearSessionCache();
          return {
            data: { session: body?.data?.session ?? null },
            error: null,
          };
        } catch (error) {
          return {
            data: { session: null },
            error: normalizeCompatError(error, '代码交换失败'),
          };
        }
      },
    },
    storageUploadExecutor: async (bucket: string, path: string, file: File | Blob) => {
      try {
        const { folder, relativePath, fullPath } = resolveStoragePath(bucket, path);
        const formData = new FormData();
        const uploadFile = file instanceof File ? file : new File([file], 'upload.bin');

        formData.append('file', uploadFile);
        formData.append('folder', folder);
        formData.append('key', relativePath);

        const { ok, body } = await requestJson('/api/upload', {
          method: 'POST',
          body: formData,
        });

        if (!ok || body?.error) {
          return {
            data: null,
            error: normalizeCompatError(body?.error, '文件上传失败'),
          };
        }

        const publicUrl = typeof body?.url === 'string' ? body.url : resolvePublicUrl(bucket, fullPath);

        return {
          data: { path: fullPath },
          error: null,
          publicUrl,
        };
      } catch (error) {
        return {
          data: null,
          error: normalizeCompatError(error, '文件上传失败'),
        };
      }
    },
    storageRemoveExecutor: async (bucket: string, paths: string[]) => {
      try {
        const normalizedPaths = paths.map((path) => resolveStoragePath(bucket, path).fullPath);
        const { ok, body } = await requestJson('/api/batch-delete', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keys: normalizedPaths }),
        });

        if (!ok || body?.error) {
          return {
            data: null,
            error: normalizeCompatError(body?.error, '文件删除失败'),
          };
        }

        return {
          data: normalizedPaths.map((path) => ({ path })),
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: normalizeCompatError(error, '文件删除失败'),
        };
      }
    },
    storagePublicUrlResolver: resolvePublicUrl,
  });
}

export function createClient(): CompatClient {
  if (typeof window === 'undefined') {
    throw new Error('Client cannot be created on server side');
  }

  if (compatClientInstance) {
    return compatClientInstance;
  }

  compatClientInstance = buildBrowserCompatClient();
  return compatClientInstance;
}
