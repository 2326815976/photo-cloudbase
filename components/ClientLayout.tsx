'use client';

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { MotionConfig } from 'framer-motion';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import BackendRecoveryIndicator from './BackendRecoveryIndicator';
import BottomNav from './BottomNav';
import MiniProgramRecoveryScreen, { MINI_PROGRAM_RECONNECT_COPY } from './MiniProgramRecoveryScreen';
import { createClient } from '@/lib/cloudbase/client';
import { ensureBackendRecoveryFetchInstalled, getBackendRecoveryState } from '@/lib/backend-recovery';
import { useBackendRecoveryState } from '@/lib/hooks/useBackendRecoveryState';
import SWRProvider from './providers/SWRProvider';
import { prefetchByRoute } from '@/lib/swr/prefetch';
import { isAndroidWebView, optimizePageRendering } from '@/lib/utils/android-optimization';
import type { WebShellRuntime } from '@/lib/page-center/config';
import { PageCenterRuntimeProvider } from '@/lib/page-center/runtime-context';

const VersionChecker = lazy(() => import('./VersionChecker'));

const CLIENT_SESSION_SYNC_THROTTLE_MS = 45 * 1000;
const CLIENT_RUNTIME_SYNC_THROTTLE_MS = 15 * 1000;

function normalizePathname(pathname: string) {
  if (!pathname) return '/';
  return pathname.startsWith('/') ? pathname : `/${pathname}`;
}

function normalizeRouteTarget(target: string) {
  const raw = String(target || '').trim();
  if (!raw) {
    return '/';
  }

  try {
    const url = new URL(raw, 'https://shiguangyao.local');
    return `${normalizePathname(url.pathname)}${url.search || ''}`;
  } catch {
    return normalizePathname(raw);
  }
}

function buildCurrentRouteKey(pathname: string, searchKey: string) {
  const normalizedPath = normalizePathname(pathname);
  const normalizedSearch = String(searchKey || '').trim();
  return normalizedSearch ? `${normalizedPath}?${normalizedSearch}` : normalizedPath;
}

function resolveManagedPageFallbackPath(runtime: WebShellRuntime, pathname: string, publishState: string) {
  const currentPath = normalizePathname(pathname);
  const normalizedHomePath = normalizePathname(runtime.homePath || '/');
  if (publishState === 'beta' && currentPath !== '/profile/beta') {
    return '/profile/beta';
  }

  if (normalizedHomePath !== currentPath) {
    return normalizedHomePath;
  }

  const alternativeNavPath = (runtime.navItems || [])
    .map((item) => normalizePathname(item.href))
    .find((href) => href !== currentPath);
  if (alternativeNavPath) {
    return alternativeNavPath;
  }

  if (currentPath !== '/profile') {
    return '/profile';
  }

  return '/login';
}

function findManagedPage(runtime: WebShellRuntime | null, pathname: string) {
  if (!runtime) return null;
  const normalized = normalizePathname(pathname);
  return (
    runtime.pageAccessItems.find((item) => normalizePathname(item.routePath) === normalized) || null
  );
}

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const searchParams = useSearchParams();
  const isAdminRoute = pathname.startsWith('/admin');
  const backendState = useBackendRecoveryState();
  const [shellRuntime, setShellRuntime] = useState<WebShellRuntime | null>();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [routeGuardLoading, setRouteGuardLoading] = useState(false);
  const [hasCompletedInitialShellLoad, setHasCompletedInitialShellLoad] = useState(false);
  const authSyncAtRef = useRef(0);
  const authSyncPendingRef = useRef<Promise<void> | null>(null);
  const runtimeFetchAtRef = useRef(0);
  const runtimeFetchPendingRef = useRef<Promise<void> | null>(null);

  const previewPageKey = String(searchParams?.get('page_key') || '').trim();
  const presentation = String(searchParams?.get('presentation') || '').trim();
  const isPreviewMode = presentation === 'preview' && Boolean(previewPageKey);
  const searchKey = searchParams?.toString() || '';

  const managedPage = useMemo(
    () => findManagedPage(shellRuntime ?? null, pathname),
    [pathname, shellRuntime]
  );
  const shellRuntimeResolved = shellRuntime !== undefined;
  const bottomNavHidden =
    isPreviewMode ||
    routeGuardLoading ||
    !shellRuntimeResolved ||
    !shellRuntime ||
    managedPage?.publishState === 'beta';
  const shellBottomSpacingVisible = shellRuntimeResolved ? !bottomNavHidden : !isPreviewMode;
  const shellLayoutVars = useMemo(
    () => ({
      ['--app-shell-nav-height' as string]: 'calc(68px + env(safe-area-inset-bottom))',
      ['--app-shell-floating-offset' as string]: shellBottomSpacingVisible
        ? 'calc(68px + env(safe-area-inset-bottom))'
        : 'calc(12px + env(safe-area-inset-bottom))',
      ['--app-shell-scroll-padding' as string]: shellBottomSpacingVisible
        ? 'calc(84px + env(safe-area-inset-bottom))'
        : 'max(16px, env(safe-area-inset-bottom))',
      ['--app-shell-compact-padding' as string]: shellBottomSpacingVisible
        ? 'calc(56px + env(safe-area-inset-bottom))'
        : 'max(8px, env(safe-area-inset-bottom))',
    }),
    [shellBottomSpacingVisible]
  );
  const pageCenterRuntimeValue = useMemo(
    () => ({
      shellRuntime,
      shellRuntimeResolved,
      managedPage,
      isPreviewMode,
      isBottomNavVisible: !bottomNavHidden,
    }),
    [bottomNavHidden, isPreviewMode, managedPage, shellRuntime, shellRuntimeResolved]
  );
  const shouldUseReconnectCopy = !hasCompletedInitialShellLoad && backendState.backendReconnecting;
  const shellLoadingTitle = shouldUseReconnectCopy ? MINI_PROGRAM_RECONNECT_COPY.title : '加载中...';
  const shellLoadingDescription = shouldUseReconnectCopy
    ? MINI_PROGRAM_RECONNECT_COPY.description
    : '正在加载页面';

  useEffect(() => {
    ensureBackendRecoveryFetchInstalled();

    if (process.env.NODE_ENV === 'production') {
      const noop = () => {};
      console.log = noop;
      console.info = noop;
      console.debug = noop;
    }

    if (isAndroidWebView()) {
      optimizePageRendering();
    }
  }, []);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    let cancelled = false;
    const dbClient = createClient();

    const syncAuthState = async (force = false) => {
      const now = Date.now();
      if (!force && now - authSyncAtRef.current < CLIENT_SESSION_SYNC_THROTTLE_MS) {
        return authSyncPendingRef.current || Promise.resolve();
      }

      if (authSyncPendingRef.current) {
        return authSyncPendingRef.current;
      }

      authSyncAtRef.current = now;
      authSyncPendingRef.current = (async () => {
        if (!dbClient) {
          if (!cancelled) {
            setIsAuthenticated(false);
          }
          return;
        }

        try {
          const {
            data: { user },
          } = await dbClient.auth.getUser();
          if (!cancelled) {
            setIsAuthenticated(Boolean(user));
          }
        } catch {
          if (!cancelled) {
            setIsAuthenticated(false);
          }
        }
      })().finally(() => {
        authSyncPendingRef.current = null;
      });

      return authSyncPendingRef.current;
    };

    void syncAuthState(true);

    return () => {
      cancelled = true;
      authSyncPendingRef.current = null;
    };
  }, [isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute || !isAuthenticated) {
      return;
    }

    const timer = setTimeout(() => {
      const logActivity = async () => {
        const { backendReady, backendReconnecting } = getBackendRecoveryState();
        if (!backendReady || backendReconnecting) {
          return;
        }

        const dbClient = createClient();
        if (!dbClient) return;

        try {
          await dbClient.rpc('log_user_activity');
        } catch (error) {
          console.warn('log_user_activity failed:', error);
        }
      };

      void logActivity();
    }, 5000);

    return () => clearTimeout(timer);
  }, [isAdminRoute, isAuthenticated, pathname]);

  useEffect(() => {
    if (!isAdminRoute && pathname) {
      const timer = setTimeout(() => {
        const idleCallback =
          (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback ||
          ((callback: () => void) => window.setTimeout(callback, 100));
        idleCallback(() => {
          prefetchByRoute(pathname);
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [pathname, isAdminRoute]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (document.fonts && document.fonts.load) {
        document.fonts.load('1rem "Letter Font"').catch(() => {
          // ignore
        });
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isAdminRoute) {
      return;
    }

    let cancelled = false;
    const fetchRuntime = async (force = false) => {
      const now = Date.now();
      if (!force && now - runtimeFetchAtRef.current < CLIENT_RUNTIME_SYNC_THROTTLE_MS) {
        return runtimeFetchPendingRef.current || Promise.resolve();
      }

      if (runtimeFetchPendingRef.current) {
        return runtimeFetchPendingRef.current;
      }

      runtimeFetchAtRef.current = now;
      runtimeFetchPendingRef.current = (async () => {
        try {
          const response = await fetch('/api/page-center/runtime', {
            cache: 'no-store',
            backendRecovery: { skipReadyGate: true },
          } as RequestInit & { backendRecovery: { skipReadyGate: true } });
          const payload = (await response.json()) as WebShellRuntime | { error?: string };
          const isRuntimePayload =
            payload && typeof payload === 'object' && !('error' in payload);
          if (!cancelled && response.ok && isRuntimePayload) {
            setShellRuntime(payload as WebShellRuntime);
          }
        } catch {
          if (!cancelled) {
            setShellRuntime(null);
          }
        }
      })().finally(() => {
        runtimeFetchPendingRef.current = null;
      });

      return runtimeFetchPendingRef.current;
    };

    void fetchRuntime(true);

    return () => {
      cancelled = true;
      runtimeFetchPendingRef.current = null;
    };
  }, [isAdminRoute]);

  useEffect(() => {
    if (isAdminRoute) {
      setRouteGuardLoading(false);
      return;
    }

    if (!shellRuntimeResolved) {
      setRouteGuardLoading(true);
      return;
    }

    if (!shellRuntime) {
      setRouteGuardLoading(false);
      return;
    }

    let cancelled = false;
    const homePath = shellRuntime.homePath || '/';
    const redirect = (target: string) => {
      if (!cancelled && buildCurrentRouteKey(pathname, searchKey) !== normalizeRouteTarget(target)) {
        router.replace(target);
      }
    };

    if (isPreviewMode) {
      setRouteGuardLoading(true);
      void fetch(
        `/api/page-center/access?page_key=${encodeURIComponent(previewPageKey)}&presentation=preview`,
        { cache: 'no-store' }
      )
        .then(async (response) => {
          const payload = (await response.json()) as {
            allowed?: boolean;
            reason?: string;
          };

          if (cancelled) return;
          if (payload.allowed) {
            setRouteGuardLoading(false);
            return;
          }

          const reason = String(payload.reason || '');
          redirect(reason === 'unauthorized' || reason === 'forbidden' ? '/profile/beta' : homePath);
        })
        .catch(() => {
          if (!cancelled) {
            redirect(homePath);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRouteGuardLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    if (!managedPage) {
      setRouteGuardLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (managedPage.publishState === 'online') {
      setRouteGuardLoading(false);
      return () => {
        cancelled = true;
      };
    }

    if (managedPage.publishState === 'beta') {
      setRouteGuardLoading(true);
      void fetch(`/api/page-center/access?page_key=${encodeURIComponent(managedPage.pageKey)}&channel=web`, {
        cache: 'no-store',
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            allowed?: boolean;
            reason?: string;
          };

          if (cancelled) return;
          if (payload.allowed) {
            setRouteGuardLoading(false);
            return;
          }

          const reason = String(payload.reason || '');
          if (reason === 'unauthorized' || reason === 'forbidden') {
            redirect('/profile/beta');
            return;
          }

          const fallbackPath = resolveManagedPageFallbackPath(shellRuntime, pathname, managedPage.publishState);
          if (fallbackPath) {
            redirect(fallbackPath);
            return;
          }

          setRouteGuardLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            const fallbackPath = resolveManagedPageFallbackPath(shellRuntime, pathname, managedPage.publishState);
            if (fallbackPath) {
              redirect(fallbackPath);
              return;
            }
            setRouteGuardLoading(false);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setRouteGuardLoading(false);
          }
        });

      return () => {
        cancelled = true;
      };
    }

    setRouteGuardLoading(true);
    const fallbackPath = resolveManagedPageFallbackPath(shellRuntime, pathname, managedPage.publishState);
    if (fallbackPath) {
      redirect(fallbackPath);
    } else {
      setRouteGuardLoading(false);
    }
    return () => {
      cancelled = true;
      setRouteGuardLoading(false);
    };
  }, [isAdminRoute, isPreviewMode, managedPage, pathname, previewPageKey, router, searchKey, shellRuntime, shellRuntimeResolved]);

  useEffect(() => {
    if (isAdminRoute) {
      setHasCompletedInitialShellLoad(true);
      return;
    }

    if (shellRuntimeResolved && !routeGuardLoading) {
      setHasCompletedInitialShellLoad(true);
    }
  }, [isAdminRoute, routeGuardLoading, shellRuntimeResolved]);

  if (isAdminRoute) {
    return (
      <SWRProvider>
        <MotionConfig reducedMotion="user">
          {children}
          <BackendRecoveryIndicator enabled={!hasCompletedInitialShellLoad} />
        </MotionConfig>
      </SWRProvider>
    );
  }

  return (
    <SWRProvider>
      <MotionConfig reducedMotion="user">
        <div className="app-shell h-full w-full min-w-0" style={shellLayoutVars}>
          <div className="app-shell__viewport fixed inset-0 flex h-[100dvh] w-full min-w-0 items-center justify-center overflow-hidden bg-gray-100">
            <main className="app-shell__main relative flex h-full w-full min-w-0 max-w-[430px] flex-col overflow-hidden bg-[#FFFBF0] shadow-[0_0_40px_rgba(93,64,55,0.15)]">
              <PageCenterRuntimeProvider value={pageCenterRuntimeValue}>
                {routeGuardLoading ? (
                  <MiniProgramRecoveryScreen
                    title={shellLoadingTitle}
                    description={shellLoadingDescription}
                    className="h-full flex-1"
                  />
                ) : (
                  children
                )}
                <BottomNav runtime={shellRuntime ?? null} hidden={bottomNavHidden} isAuthenticated={isAuthenticated} />
              </PageCenterRuntimeProvider>
            </main>
          </div>
          <BackendRecoveryIndicator enabled={!hasCompletedInitialShellLoad} />
          <Suspense fallback={null}>
            <VersionChecker />
          </Suspense>
        </div>
      </MotionConfig>
    </SWRProvider>
  );
}

