'use client';

import { useEffect, useState } from 'react';
import { Clock, RefreshCw } from 'lucide-react';

interface LoadingTimeoutProps {
  timeout?: number;
  onTimeout?: () => void;
  onRetry?: () => void;
}

export default function LoadingTimeout({
  timeout = 30000,
  onTimeout,
  onRetry
}: LoadingTimeoutProps) {
  const [isTimeout, setIsTimeout] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsTimeout(true);
      onTimeout?.();
    }, timeout);

    return () => clearTimeout(timer);
  }, [timeout, onTimeout]);

  if (!isTimeout) return null;

  return (
    <div className="fixed inset-0 bg-background flex items-center justify-center p-4 z-50">
      <div className="text-center max-w-sm">
        <Clock className="w-16 h-16 text-border mx-auto mb-4" />
        <h2 className="text-xl font-medium text-foreground mb-2">
          加载超时
        </h2>
        <p className="text-sm text-foreground/60 mb-6">
          内容加载时间过长，请检查网络连接或稍后重试
        </p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            <RefreshCw className="w-4 h-4" />
            重新加载
          </button>
        )}
      </div>
    </div>
  );
}
