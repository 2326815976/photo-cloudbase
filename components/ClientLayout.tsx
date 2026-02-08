'use client';

import { usePathname } from 'next/navigation';
import { useEffect, lazy, Suspense } from 'react';
import { MotionConfig } from 'framer-motion';
import BottomNav from './BottomNav';
import { createClient } from '@/lib/supabase/client';
import SWRProvider from './providers/SWRProvider';
import { prefetchByRoute } from '@/lib/swr/prefetch';
import { isAndroidWebView, optimizePageRendering } from '@/lib/utils/android-optimization';

const VersionChecker = lazy(() => import('./VersionChecker'));

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  // Android WebView优化：应用性能优化策略
  useEffect(() => {
    // 生产环境禁用 console 日志
    if (process.env.NODE_ENV === 'production') {
      const noop = () => {};
      console.log = noop;
      console.warn = noop;
      console.error = noop;
      console.info = noop;
      console.debug = noop;
    }

    // Android WebView专项优化
    if (isAndroidWebView()) {
      optimizePageRendering();
    }
  }, []);

  // 记录用户活跃日志（延迟执行，确保首屏优先）
  useEffect(() => {
    const timer = setTimeout(() => {
      const logActivity = async () => {
        const supabase = createClient();
        if (!supabase) return;

        const { data: { user } } = await supabase.auth.getUser();

        if (user) {
          await supabase.rpc('log_user_activity');
        }
      };

      logActivity();
    }, 5000); // 延迟5秒，确保首屏加载完成

    return () => clearTimeout(timer);
  }, [pathname]);

  // 首屏优先：等待首屏完全加载后再预加载其他页面
  useEffect(() => {
    if (!isAdminRoute && pathname) {
      // 等待2秒确保首屏完全加载，然后使用requestIdleCallback预加载
      const timer = setTimeout(() => {
        const idleCallback = (window as any).requestIdleCallback || ((cb: any) => setTimeout(cb, 100));
        const handle = idleCallback(() => {
          prefetchByRoute(pathname);
        });
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [pathname, isAdminRoute]);

  // 延迟加载书信字体，确保不影响首屏加载
  useEffect(() => {
    const timer = setTimeout(() => {
      if (document.fonts && document.fonts.load) {
        document.fonts.load('1rem "Letter Font"').catch(() => {
          // 忽略加载失败
        });
      }
    }, 3000); // 3秒后开始加载
    return () => clearTimeout(timer);
  }, []);

  if (isAdminRoute) {
    // 管理后台：使用桌面端全屏布局
    return (
      <SWRProvider>
        <MotionConfig reducedMotion="user">{children}</MotionConfig>
      </SWRProvider>
    );
  }

  // 普通用户页面：使用移动端布局
  // Android WebView优化：简化动画而不是完全禁用，保留交互反馈
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

  return (
    <SWRProvider>
      {/*
        Android环境：使用"user"让系统设置决定，而不是强制"always"
        这样可以保留简单的交互反馈动画，只禁用复杂的过渡动画
        BottomNav等组件已经针对Android使用CSS动画优化
      */}
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
