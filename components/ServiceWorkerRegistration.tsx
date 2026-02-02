'use client';

import { useEffect, useState } from 'react';
import Toast from '@/components/ui/Toast';

export function ServiceWorkerRegistration() {
  const [showUpdateToast, setShowUpdateToast] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('Service Worker registered:', registration);

          // Check for updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // 新版本可用，显示Toast并3秒后自动刷新
                  setShowUpdateToast(true);
                  setTimeout(() => {
                    window.location.reload();
                  }, 3000);
                }
              });
            }
          });
        })
        .catch((error) => {
          console.error('Service Worker registration failed:', error);
        });
    }
  }, []);

  return showUpdateToast ? (
    <Toast
      message="发现新版本，即将自动刷新..."
      type="success"
      onClose={() => setShowUpdateToast(false)}
      duration={3000}
    />
  ) : null;
}
