'use client';

import { usePathname } from 'next/navigation';
import BottomNav from './BottomNav';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdminRoute = pathname?.startsWith('/admin');

  if (isAdminRoute) {
    // 管理后台：使用桌面端全屏布局
    return <>{children}</>;
  }

  // 普通用户页面：使用移动端布局
  return (
    <div className="fixed inset-0 w-full h-[100dvh] bg-gray-100 flex justify-center items-center overflow-hidden">
      <main className="w-full max-w-[430px] h-full bg-[#FFFBF0] relative flex flex-col shadow-[0_0_40px_rgba(93,64,55,0.15)] overflow-hidden">
        {children}
        <BottomNav />
      </main>
    </div>
  );
}
