'use client';

import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';
import type { WebPageAccessItem, WebShellRuntime } from '@/lib/page-center/config';

export interface PageCenterRuntimeContextValue {
  shellRuntime: WebShellRuntime | null | undefined;
  shellRuntimeResolved: boolean;
  managedPage: WebPageAccessItem | null;
  isPreviewMode: boolean;
  isBottomNavVisible: boolean;
}

const DEFAULT_VALUE: PageCenterRuntimeContextValue = {
  shellRuntime: undefined,
  shellRuntimeResolved: false,
  managedPage: null,
  isPreviewMode: false,
  isBottomNavVisible: false,
};

const PageCenterRuntimeContext = createContext<PageCenterRuntimeContextValue>(DEFAULT_VALUE);

export function PageCenterRuntimeProvider({
  value,
  children,
}: {
  value: PageCenterRuntimeContextValue;
  children: ReactNode;
}) {
  return <PageCenterRuntimeContext.Provider value={value}>{children}</PageCenterRuntimeContext.Provider>;
}

export function usePageCenterRuntime() {
  return useContext(PageCenterRuntimeContext);
}
