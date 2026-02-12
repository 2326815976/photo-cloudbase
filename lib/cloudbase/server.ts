import 'server-only';

import { Buffer } from 'buffer';
import { cookies, headers } from 'next/headers';
import { env } from '@/lib/env';
import { DbQueryPayload } from '@/lib/cloudbase/query-types';
import { executeQuery } from '@/lib/cloudbase/query-engine';
import { executeRpc } from '@/lib/cloudbase/rpc-engine';
import {
  buildCloudBasePublicUrl,
  deleteCloudBaseObjects,
  uploadFileToCloudBase,
} from '@/lib/cloudbase/storage';
import { buildCompatClient } from '@/lib/cloudbase/compat/core';
import { getAuthContextFromServerCookies } from '@/lib/auth/context';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/cookie';
import { AuthContext, AuthUser } from '@/lib/auth/types';
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  signInWithPassword,
  updateUserPassword,
} from '@/lib/auth/service';
import { revokeSessionByToken } from '@/lib/auth/session-store';

interface CompatError {
  message: string;
  code?: string;
}

type CompatClient = ReturnType<typeof buildCompatClient>;
type CookieStore = Awaited<ReturnType<typeof cookies>>;
type HeaderStore = Awaited<ReturnType<typeof headers>>;

type StorageFolder = 'albums' | 'gallery' | 'poses' | 'releases';

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
    return {
      message: input.message || fallback,
    };
  }

  return { message: fallback };
}

function toCompatAuthUser(user: AuthUser | null): { id: string; email?: string } | null {
  if (!user) {
    return null;
  }

  return {
    id: user.id,
    email: user.email,
  };
}

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

function resolvePublicUrl(bucket: string, path: string): string {
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  const resolvedPath = resolveStoragePath(bucket, path).fullPath;
  return buildCloudBasePublicUrl(resolvedPath) || path;
}

function getClientIp(headerStore: HeaderStore): string | undefined {
  const forwarded = headerStore.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0]?.trim();
  }

  return headerStore.get('x-real-ip') ?? undefined;
}

function buildAuthClient(
  cookieStore: CookieStore,
  contextResolver: () => Promise<AuthContext>
) {
  return {
    getUser: async () => {
      try {
        const context = await contextResolver();
        return {
          data: {
            user: toCompatAuthUser(context.user),
          },
          error: null,
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
        const context = await contextResolver();
        return {
          data: {
            session: context.user ? { user: toCompatAuthUser(context.user)! } : null,
          },
          error: null,
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
        let userAgent: string | undefined;
        let ipAddress: string | undefined;
        try {
          const headerStore = await headers();
          userAgent = headerStore.get('user-agent') ?? undefined;
          ipAddress = getClientIp(headerStore);
        } catch {
          // ignore
        }

        const result = await signInWithPassword(params.email, params.password, userAgent, ipAddress);
        if (result.error || !result.user || !result.sessionToken) {
          return {
            data: { user: null },
            error: normalizeCompatError(null, 'Invalid login credentials'),
          };
        }

        try {
          cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
        } catch {
          // server component 场景下无法写 cookie，忽略
        }

        return {
          data: { user: toCompatAuthUser(result.user) },
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
        const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
        if (token) {
          await revokeSessionByToken(token);
        }

        try {
          cookieStore.set(SESSION_COOKIE_NAME, '', {
            ...getSessionCookieOptions(),
            maxAge: 0,
          });
        } catch {
          // server component 场景下无法写 cookie，忽略
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
        const context = await contextResolver();
        if (!context.user) {
          return {
            data: { user: null },
            error: normalizeCompatError(null, 'Not authenticated'),
          };
        }

        if (!params.password) {
          return {
            data: { user: toCompatAuthUser(context.user) },
            error: null,
          };
        }

        const result = await updateUserPassword(context.user.id, params.password);
        if (result.error) {
          return {
            data: { user: null },
            error: normalizeCompatError(null, result.error),
          };
        }

        return {
          data: { user: toCompatAuthUser(context.user) },
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
        const result = await createPasswordResetToken(email);
        if (result.error || !result.token) {
          return {
            data: null,
            error: normalizeCompatError(null, result.error ?? '发送重置邮件失败'),
          };
        }

        const baseUrl = options?.redirectTo || env.APP_URL() || 'http://localhost:3000/auth/confirm';
        const resetUrl = baseUrl.includes('?')
          ? `${baseUrl}&token_hash=${encodeURIComponent(result.token)}&type=recovery`
          : `${baseUrl}?token_hash=${encodeURIComponent(result.token)}&type=recovery`;

        console.info(`[RESET_PASSWORD_LINK] ${email} -> ${resetUrl}`);

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
        const tokenHash = String(params.token_hash ?? '').trim();
        if (!tokenHash) {
          return {
            data: null,
            error: normalizeCompatError(null, 'Invalid token'),
          };
        }

        const result = await consumePasswordResetToken(tokenHash);
        if (result.error || !result.sessionToken) {
          return {
            data: null,
            error: normalizeCompatError(null, result.error ?? '验证失败'),
          };
        }

        try {
          cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
        } catch {
          // server component 场景下无法写 cookie，忽略
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
        const tokenHash = String(code ?? '').trim();
        if (!tokenHash) {
          return {
            data: { session: null },
            error: normalizeCompatError(null, 'Invalid code'),
          };
        }

        const result = await consumePasswordResetToken(tokenHash);
        if (result.error || !result.user || !result.sessionToken) {
          return {
            data: { session: null },
            error: normalizeCompatError(null, result.error ?? '代码交换失败'),
          };
        }

        try {
          cookieStore.set(SESSION_COOKIE_NAME, result.sessionToken, getSessionCookieOptions());
        } catch {
          // server component 场景下无法写 cookie，忽略
        }

        return {
          data: {
            session: {
              user: toCompatAuthUser(result.user)!,
            },
          },
          error: null,
        };
      } catch (error) {
        return {
          data: { session: null },
          error: normalizeCompatError(error, '代码交换失败'),
        };
      }
    },
  };
}

async function uploadByBucket(bucket: string, path: string, file: File | Blob): Promise<{ fullPath: string; publicUrl: string }> {
  const { folder, relativePath, fullPath } = resolveStoragePath(bucket, path);
  const uploadInput = file instanceof File ? file : Buffer.from(await file.arrayBuffer());
  const uploadResult = await uploadFileToCloudBase(uploadInput, relativePath, folder);
  return {
    fullPath,
    publicUrl: uploadResult.downloadUrl,
  };
}

function buildCompatServerClient(
  contextResolver: () => Promise<AuthContext>,
  authClient: ReturnType<typeof buildAuthClient>
): CompatClient {
  return buildCompatClient({
    queryExecutor: async (payload: DbQueryPayload) => {
      const context = await contextResolver();
      return executeQuery(payload, context);
    },
    rpcExecutor: async (functionName: string, args?: Record<string, unknown>) => {
      const context = await contextResolver();
      return executeRpc(functionName, args ?? {}, context);
    },
    authClient,
    storageUploadExecutor: async (bucket: string, path: string, file: File | Blob) => {
      try {
        const { fullPath, publicUrl } = await uploadByBucket(bucket, path, file);
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
        await deleteCloudBaseObjects(normalizedPaths);
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

export async function createClient(): Promise<CompatClient> {
  const cookieStore = await cookies();
  const contextResolver = async () => getAuthContextFromServerCookies();
  const authClient = buildAuthClient(cookieStore, contextResolver);
  return buildCompatServerClient(contextResolver, authClient);
}

export function createAdminClient(): CompatClient {
  const adminContext: AuthContext = {
    role: 'admin',
    user: {
      id: 'system',
      email: 'system@slogan.app',
      phone: null,
      role: 'admin',
      name: 'system',
    },
  };

  const authClient = {
    getUser: async () => ({
      data: { user: toCompatAuthUser(adminContext.user) },
      error: null,
    }),
    getSession: async () => ({
      data: { session: { user: toCompatAuthUser(adminContext.user)! } },
      error: null,
    }),
    signInWithPassword: async () => ({
      data: { user: toCompatAuthUser(adminContext.user) },
      error: null,
    }),
    signOut: async () => ({ error: null }),
    updateUser: async () => ({
      data: { user: toCompatAuthUser(adminContext.user) },
      error: null,
    }),
    resetPasswordForEmail: async () => ({
      data: null,
      error: null,
    }),
    verifyOtp: async () => ({
      data: null,
      error: null,
    }),
    exchangeCodeForSession: async () => ({
      data: { session: { user: toCompatAuthUser(adminContext.user)! } },
      error: null,
    }),
  };

  return buildCompatServerClient(async () => adminContext, authClient);
}
