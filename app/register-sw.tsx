'use client';

import { useEffect } from 'react';
import { isAndroidApp } from '@/lib/platform';

export default function RegisterServiceWorker() {
  useEffect(() => {
    // 开发环境禁用 SW，避免调试时缓存 API 造成状态错乱。
    if (process.env.NODE_ENV !== 'production') {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister().catch(() => {
              // 忽略反注册失败
            });
          });
        });
      }

      return;
    }

    if (isAndroidApp()) {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister().catch(() => {
              // 忽略反注册失败
            });
          });
        });
      }

      return;
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('[SW] 注册成功:', registration.scope);

          registration.update().catch(() => {
            // 忽略更新检查失败
          });

          const markUpdateReady = () => {
            if (!navigator.serviceWorker.controller) return;
            try {
              sessionStorage.setItem('sw-update-ready', '1');
            } catch {
              // ignore storage write errors
            }
            console.info('[SW] Update ready and will be applied on next reopen.');
          };

          if (registration.waiting) {
            markUpdateReady();
          }

          registration.addEventListener('updatefound', () => {
            const installingWorker = registration.installing;
            if (!installingWorker) return;

            installingWorker.addEventListener('statechange', () => {
              if (installingWorker.state === 'installed') {
                markUpdateReady();
              }
            });
          });
        })
        .catch((error) => {
          console.error('[SW] 注册失败:', error);
        });

    }
  }, []);

  return null;
}
