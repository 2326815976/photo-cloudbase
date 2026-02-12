import 'server-only';

import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME } from './cookie';
import { findSessionUser } from './session-store';
import { AuthContext, AuthUser } from './types';

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

export async function getAuthContextFromRequest(request: Request): Promise<AuthContext> {
  const cookieHeader = request.headers.get('cookie');
  const token = parseCookieValue(cookieHeader, SESSION_COOKIE_NAME);
  if (!token) {
    return buildContextFromUser(null);
  }
  const user = await findSessionUser(token);
  return buildContextFromUser(user);
}

export async function getAuthContextFromServerCookies(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    return buildContextFromUser(null);
  }
  const user = await findSessionUser(token);
  return buildContextFromUser(user);
}

export async function getSessionUserFromRequest(request: Request): Promise<AuthUser | null> {
  const context = await getAuthContextFromRequest(request);
  return context.user;
}

export async function getSessionUserFromServerCookies(): Promise<AuthUser | null> {
  const context = await getAuthContextFromServerCookies();
  return context.user;
}

export function getSessionTokenFromCookieHeader(cookieHeader: string | null): string | null {
  return parseCookieValue(cookieHeader, SESSION_COOKIE_NAME);
}

