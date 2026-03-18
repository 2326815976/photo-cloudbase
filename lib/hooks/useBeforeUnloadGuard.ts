'use client';

import { useEffect } from 'react';

export function useBeforeUnloadGuard(
  enabled: boolean,
  message = 'An upload is still in progress. Leaving may interrupt it.'
) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
      return message;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [enabled, message]);
}
