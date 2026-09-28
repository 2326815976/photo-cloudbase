import 'server-only';

import { cookies } from 'next/headers';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';
import { SESSION_COOKIE_NAME } from './cookie';
import { findSessionUser } from './session-store';
import { AuthContext, AuthUser } from './types';

export interface AuthContextResolution {
  context: AuthContext;
  hasToken: boolean;
  transientFailure: boolean;
  error: Error | null;
}

function parseCookieValue(cookieHeader: string | null, key: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === key) {
      return decodeURIComponent(rest.join('='));
    }
  }
  return null;
}

function buildContextFromUser(user: AuthUser | null): AuthContext {
  if (!user) {
    return {
      role: 'anonymous',
      user: null,
    };
  }

  return {
    role: user.role,
    user,
  };
}

function buildTransientAuthError(error: unknown): Error & { code: string; originError?: unknown } {
  const wrapped = new Error(TRANSIENT_BACKEND_ERROR_MESSAGE) as Error & { code: string; originError?: unknown };
  wrapped.code = TRANSIENT_BACKEND_ERROR_CODE;
  wrapped.originError = error;
  return wrapped;
}

export async function resolveAuthContextFromRequest(request: Request): Promise<AuthContextResolution> {
  const cookieHeader = request.headers.get('cookie');
  const token = parseCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) {
    return {
      context: buildContextFromUser(null),
      hasToken: false,
      transientFailure: false,
      error: null,
    };
  }

  try {
    const user = await findSessionUser(token);
    return {
      context: buildContextFromUser(user),
      hasToken: true,
      transientFailure: false,
      error: null,
    };
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return {
        context: buildContextFromUser(null),
        hasToken: true,
        transientFailure: true,
        error: buildTransientAuthError(error),
      };
    }
    throw error;
  }
}

export async function resolveAuthContextFromServerCookies(): Promise<AuthContextResolution> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return {
      context: buildContextFromUser(null),
      hasToken: false,
      transientFailure: false,
      error: null,
    };
  }

  try {
    const user = await findSessionUser(token);
    return {
      context: buildContextFromUser(user),
      hasToken: true,
      transientFailure: false,
      error: null,
    };
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return {
        context: buildContextFromUser(null),
        hasToken: true,
        transientFailure: true,
        error: buildTransientAuthError(error),
      };
    }
    throw error;
  }
}

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext> {
  const resolution = await resolveAuthContextFromRequest(request);
  return resolution.context;
}

export async function getAuthContextFromServerCookies(): Promise<AuthContext> {
  const resolution = await resolveAuthContextFromServerCookies();
  return resolution.context;
}

export async function getSessionUserFromRequest(request: Request): Promise<AuthUser | null> {
  const resolution = await resolveAuthContextFromRequest(request);
  if (resolution.transientFailure && resolution.error) {
    throw resolution.error;
  }
  return resolution.context.user;
}

export async function getSessionUserFromServerCookies(): Promise<AuthUser | null> {
  const resolution = await resolveAuthContextFromServerCookies();
  if (resolution.transientFailure && resolution.error) {
    throw resolution.error;
  }
  return resolution.context.user;
}

export function getSessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  return parseCookieValue(cookieHeader, SESSION_COOKIE_NAME);
}
