'use client';

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';

export function useWebPreviewMode() {
  const searchParams = useSearchParams();

  return useMemo(() => {
    const presentation = String(searchParams?.get('presentation') || '').trim();
    const pageKey = String(searchParams?.get('page_key') || '').trim();
    return presentation === 'preview' && Boolean(pageKey);
  }, [searchParams]);
}
