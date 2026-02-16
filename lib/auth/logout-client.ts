'use client';

import { createClient } from '@/lib/cloudbase/client';
import { clearSessionId } from '@/lib/utils/session';

const LOCAL_STORAGE_KEYS_TO_CLEAR = ['login_redirect', 'swr-cache'] as const;
const SESSION_STORAGE_KEYS_TO_CLEAR_PREFIXES = ['album_bind_notice_'] as const;

export function clearClientAuthArtifacts() {
  if (typeof window === 'undefined') {
    return;
  }

  clearSessionId();
  LOCAL_STORAGE_KEYS_TO_CLEAR.forEach((key) => {
    window.localStorage.removeItem(key);
  });

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (!key) {
      continue;
    }
    if (SESSION_STORAGE_KEYS_TO_CLEAR_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      window.sessionStorage.removeItem(key);
    }
  }
}

async function revokeServerSession(): Promise<Error | null> {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      keepalive: true,
    });

    if (!response.ok) {
      return new Error('登出失败');
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error('登出失败');
  }
}

export async function logoutWithCleanup(): Promise<{ error: Error | null }> {
  let signOutError: Error | null = null;

  try {
    const dbClient = createClient();
    const { error } = await dbClient.auth.signOut();
    if (error) {
      signOutError = new Error(error.message || '登出失败');
    }
  } catch (error) {
    signOutError = error instanceof Error ? error : new Error('登出失败');
  }

  const fallbackError = await revokeServerSession();
  clearClientAuthArtifacts();
  return { error: signOutError && fallbackError ? signOutError : null };
}
