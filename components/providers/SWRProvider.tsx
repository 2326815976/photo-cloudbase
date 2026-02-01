'use client';

/**
 * SWR Provider
 * 为整个应用提供 SWR 配置和缓存上下文
 */

import { SWRConfig } from 'swr';
import { swrConfig } from '@/lib/swr/config';

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig value={swrConfig}>
      {children}
    </SWRConfig>
  );
}
