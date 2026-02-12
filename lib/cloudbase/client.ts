import { env } from '@/lib/env';
import { DbQueryPayload } from '@/lib/cloudbase/query-types';
import { buildCompatClient } from '@/lib/cloudbase/compat/core';

interface CompatError {
  message: string;
  code?: string;
}

type CompatClient = ReturnType<typeof buildCompatClient>;

let compatClientInstance: CompatClient | null = null;

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

async function requestJson(url: string, init: RequestInit): Promise<{ ok: boolean; body: any }> {
  const response = await fetch(url, {
    credentials: 'include',
    ...init,
  });

  const body = await parseResponseBody(response);
  return {
    ok: response.ok,
    body,
  };
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
        const { ok, body } = await requestJson('/api/db/rpc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            functionName,
            args: args ?? {},
          }),
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
          const { ok, body } = await requestJson('/api/auth/session', {
            method: 'GET',
          });

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
          const { ok, body } = await requestJson('/api/auth/session', {
            method: 'GET',
          });

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
      signInWithPassword: async (params: { email: string; password: string }) => {
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
      updateUser: async (params: { password?: string }) => {
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
