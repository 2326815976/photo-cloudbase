export const AUTH_REFRESH_QUERY_KEY = '__auth_refresh';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function appendAuthRefreshQuery(target: string): string {
  const rawTarget = String(target || '').trim() || '/';

  try {
    const url = new URL(rawTarget, 'https://shiguangyao.local');
    url.searchParams.set(AUTH_REFRESH_QUERY_KEY, String(Date.now()));
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const separator = rawTarget.includes('?') ? '&' : '?';
    return `${rawTarget}${separator}${AUTH_REFRESH_QUERY_KEY}=${Date.now()}`;
  }
}

export function clearAuthRefreshQueryFromCurrentUrl(): void {
  if (!isBrowser()) {
    return;
  }

  const currentUrl = new URL(window.location.href);
  if (!currentUrl.searchParams.has(AUTH_REFRESH_QUERY_KEY)) {
    return;
  }

  currentUrl.searchParams.delete(AUTH_REFRESH_QUERY_KEY);
  const nextUrl = `${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`;
  window.history.replaceState(window.history.state, '', nextUrl || '/');
}

export function subscribeAuthResume(handler: () => void): () => void {
  if (!isBrowser()) {
    return () => {};
  }

  let lastTriggeredAt = 0;
  const dispatch = () => {
    const now = Date.now();
    if (now - lastTriggeredAt < 180) {
      return;
    }
    lastTriggeredAt = now;
    handler();
  };

  const handlePageShow = () => {
    dispatch();
  };

  const handleFocus = () => {
    dispatch();
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      dispatch();
    }
  };

  window.addEventListener('pageshow', handlePageShow);
  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    window.removeEventListener('pageshow', handlePageShow);
    window.removeEventListener('focus', handleFocus);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
