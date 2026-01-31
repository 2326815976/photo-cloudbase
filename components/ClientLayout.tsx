'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { MotionConfig } from 'framer-motion';
import BottomNav from './BottomNav';
import { createClient } from '@/lib/supabase/client';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  // 记录用户活跃日志
  useEffect(() => {
    const logActivity = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        // 调用RPC函数记录用户活跃日志
        await supabase.rpc('log_user_activity');
      }
    };

    logActivity();
  }, [pathname]); // 每次路由变化时记录

  if (isAdminRoute) {
    // 管理后台：使用桌面端全屏布局
    return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
  }

  // 普通用户页面：使用移动端布局
  return (
    <MotionConfig reducedMotion="user">
      <div className="fixed inset-0 w-full h-[100dvh] bg-gray-100 flex justify-center items-center overflow-hidden">
        <main className="w-full max-w-[430px] h-full bg-[#FFFBF0] relative flex flex-col shadow-[0_0_40px_rgba(93,64,55,0.15)] overflow-hidden">
          {children}
          <BottomNav />
        </main>
      </div>
    </MotionConfig>
  );
}
