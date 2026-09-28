'use client';

import { useEffect, useRef } from 'react';

interface UseAutoLoadMoreOptions {
  enabled: boolean;
  isLoading: boolean;
  onLoadMore: () => void;
  threshold?: number;
}

export function useAutoLoadMore({
  enabled,
  isLoading,
  onLoadMore,
  threshold = 320,
}: UseAutoLoadMoreOptions) {
  const lockRef = useRef(false);

  useEffect(() => {
    if (!isLoading) {
      lockRef.current = false;
    }
  }, [isLoading]);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    let frameId = 0;

    const check = () => {
      if (lockRef.current || isLoading) {
        return;
      }

      const scrollElement = document.documentElement;
      const distanceToBottom = scrollElement.scrollHeight - (window.innerHeight + window.scrollY);
      if (distanceToBottom <= threshold) {
        lockRef.current = true;
        onLoadMore();
      }
    };

    const handleScroll = () => {
      if (frameId) {
        return;
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        check();
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll);
    handleScroll();

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, [enabled, isLoading, onLoadMore, threshold]);
}
