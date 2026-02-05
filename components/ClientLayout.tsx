'use client';

import { usePathname } from 'next/navigation';
import { useEffect, lazy, Suspense } from 'react';
import { MotionConfig } from 'framer-motion';
import BottomNav from './BottomNav';
import { createClient } from '@/lib/supabase/client';
import SWRProvider from './providers/SWRProvider';
import { prefetchByRoute } from '@/lib/swr/prefetch';

const VersionChecker = lazy(() => import('./VersionChecker'));

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  // 记录用户活跃日志（延迟执行，确保首屏优先）
  useEffect(() => {
    const timer = setTimeout(() => {
      const logActivity = async () => {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          await supabase.rpc('log_user_activity');
        }
      };

      logActivity();
    }, 5000); // 延迟5秒，确保首屏加载完成

    return () => clearTimeout(timer);
  }, [pathname]);

  // 延迟预加载机制，首屏加载完成后再预加载其他页面
  useEffect(() => {
    if (!isAdminRoute && pathname) {
      // 所有页面延迟3秒预加载，确保首屏优先
      const timer = setTimeout(() => {
        prefetchByRoute(pathname);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [pathname, isAdminRoute]);

  if (isAdminRoute) {
    // 管理后台：使用桌面端全屏布局
    return (
      <SWRProvider>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </SWRProvider>
    );
  }

  // 普通用户页面：使用移动端布局
  return (
    <SWRProvider>
      <MotionConfig reducedMotion="user">
        <div className="fixed inset-0 w-full h-[100dvh] bg-gray-100 flex justify-center items-center overflow-hidden">
          <main className="w-full max-w-[430px] h-full bg-[#FFFBF0] relative flex flex-col shadow-[0_0_40px_rgba(93,64,55,0.15)] overflow-hidden">
            {children}
            <BottomNav />
          </main>
        </div>
        <Suspense fallback={null}>
          <VersionChecker />
        </Suspense>
      </MotionConfig>
    </SWRProvider>
  );
}
