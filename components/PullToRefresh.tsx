'use client';

import { useEffect, useState } from 'react';
import { isAndroidApp } from '@/lib/platform';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  threshold?: number;
}

export default function PullToRefresh({
  onRefresh,
  children,
  threshold = 80
}: PullToRefreshProps) {
  const [startY, setStartY] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // 在 Android App 中禁用 Web 端下拉刷新，使用原生刷新
    // Android WebView已在原生层实现SwipeRefreshLayout，提供更流畅的原生体验
    // 避免Web和原生刷新冲突，提升用户体验
    if (isAndroidApp()) {
      return;
    }
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        touchStartY = e.touches[0].clientY;
        setStartY(touchStartY);
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (window.scrollY === 0 && !isRefreshing) {
        const currentY = e.touches[0].clientY;
        const distance = currentY - touchStartY;

        if (distance > 0) {
          setPullDistance(Math.min(distance, threshold * 1.5));
        }
      }
    };

    const handleTouchEnd = async () => {
      if (pullDistance >= threshold && !isRefreshing) {
        setIsRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setIsRefreshing(false);
        }
      }
      setPullDistance(0);
    };

    document.addEventListener('touchstart', handleTouchStart);
    document.addEventListener('touchmove', handleTouchMove);
    document.addEventListener('touchend', handleTouchEnd);

    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const showIndicator = pullDistance > 0 || isRefreshing;

  return (
    <div className="relative">
      {showIndicator && (
        <div
          className="fixed top-0 left-0 right-0 flex items-center justify-center transition-all duration-200 z-50"
          style={{
            height: `${Math.max(pullDistance, isRefreshing ? 60 : 0)}px`,
            opacity: isRefreshing ? 1 : progress
          }}
        >
          <div className="flex flex-col items-center gap-2">
            {isRefreshing ? (
              // 刷新中：旋转的星星
              <div className="relative">
                <div className="text-2xl animate-spin">✨</div>
                <div className="absolute inset-0 text-2xl animate-ping opacity-50">✨</div>
              </div>
            ) : (
              // 下拉中：跳动的云朵
              <div
                className="text-2xl transition-transform duration-200"
                style={{
                  transform: `scale(${0.8 + progress * 0.4}) translateY(${progress * 5}px)`
                }}
              >
                ☁️
              </div>
            )}
            <span className="text-xs text-foreground/60 font-medium">
              {isRefreshing ? '刷新中...' : pullDistance >= threshold ? '松开刷新 ✨' : '下拉刷新'}
            </span>
          </div>
        </div>
      )}
      {children}
    </div>
  );
}
