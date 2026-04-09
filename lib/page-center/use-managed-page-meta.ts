'use client';

import { useMemo } from 'react';
import { usePageCenterRuntime } from '@/lib/page-center/runtime-context';

function normalizeText(value: unknown) {
  return String(value || '').trim();
}

export function useManagedPageMeta(pageKey: string, fallbackTitle: string, fallbackSubtitle = '') {
  const { shellRuntime, managedPage, isBottomNavVisible } = usePageCenterRuntime();

  return useMemo(() => {
    const normalizedPageKey = normalizeText(pageKey);
    const runtimeItems = Array.isArray(shellRuntime?.pageAccessItems) ? shellRuntime.pageAccessItems : [];
    const matchedPage =
      runtimeItems.find((item) => item.pageKey === normalizedPageKey) ||
      (managedPage && managedPage.pageKey === normalizedPageKey ? managedPage : null);

    return {
      title: normalizeText(matchedPage?.headerTitle) || fallbackTitle,
      subtitle: normalizeText(matchedPage?.headerSubtitle) || fallbackSubtitle,
      navLabel: normalizeText(matchedPage?.navText),
      guestNavLabel: normalizeText(matchedPage?.guestNavText) || normalizeText(matchedPage?.navText),
      hasBottomNav: isBottomNavVisible,
      managedPage: matchedPage,
    };
  }, [fallbackSubtitle, fallbackTitle, isBottomNavVisible, managedPage, pageKey, shellRuntime]);
}
