'use client';

import { useEffect, useState } from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';

interface NetworkErrorProps {
  onRetry?: () => void;
  message?: string;
}

export default function NetworkError({ onRetry, message = '网络连接失败' }: NetworkErrorProps) {
  const [isOnline, setIsOnline] = useState(true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    setIsOnline(navigator.onLine);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline && !message) return null;

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-50">
      <div className="text-center max-w-sm">
        <WifiOff className="w-16 h-16 text-border mx-auto mb-4" />
        <h2 className="text-xl font-medium text-foreground mb-2">
          {isOnline ? message : '网络已断开'}
        </h2>
        <p className="text-sm text-foreground/60 mb-6">
          {isOnline
            ? '请检查网络连接后重试'
            : '请检查你的网络设置'}
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            重试
          </button>
        )}
      </div>
    </div>
  );
}
