'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  Camera,
  Calendar,
  Image,
  FolderHeart,
  Package,
  LogOut,
  User,
  Menu,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';

interface AdminSidebarProps {
  username: string;
}

const navItems = [
  { href: '/admin/stats', label: '数据统计', icon: LayoutDashboard },
  { href: '/admin/poses', label: '摆姿管理', icon: Camera },
  { href: '/admin/bookings', label: '预约管理', icon: Calendar },
  { href: '/admin/schedule', label: '档期管理', icon: Calendar },
  { href: '/admin/gallery', label: '照片墙管理', icon: Image },
  { href: '/admin/albums', label: '专属空间管理', icon: FolderHeart },
  { href: '/admin/releases', label: '发布版本', icon: Package },
];

export default function AdminSidebar({ username }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!isMobile) {
      setMobileMenuOpen(false);
    }
  }, [isMobile]);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  const handleLogout = async () => {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
    }
    router.push('/login');
  };

  return (
    <>
      {/* 移动端顶部栏 */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-14 bg-[#FFFBF0] border-b border-[#5D4037]/10 flex items-center justify-between px-4 z-50">
        <Link href="/admin/stats" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center shadow-md">
            <span className="text-lg">✨</span>
          </div>
          <span className="text-lg font-bold text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            拾光谣管理
          </span>
        </Link>
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="h-10 w-10 flex items-center justify-center text-[#5D4037] active:bg-[#5D4037]/5 rounded-lg transition-colors"
          aria-label={mobileMenuOpen ? "关闭菜单" : "打开菜单"}
        >
          {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* 桌面端侧边栏 */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-64 bg-[#FFFBF0] border-r border-[#5D4037]/10 flex-col">
      {/* Logo / 标题 */}
      <div className="p-6 border-b border-[#5D4037]/10">
        <Link href="/admin/stats" className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center shadow-md">
            <span className="text-xl">✨</span>
          </div>
          <span className="text-xl font-bold text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            拾光谣管理
          </span>
        </Link>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                isActive
                  ? 'bg-[#FFC857]/20 text-[#5D4037] font-medium shadow-sm'
                  : 'text-[#5D4037]/60 hover:bg-[#5D4037]/5'
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span className="text-base">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 用户信息和登出 */}
      <div className="p-4 border-t border-[#5D4037]/10">
        <div className="flex items-center gap-3 px-4 py-2 mb-2">
          <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center flex-shrink-0">
            <User className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-medium truncate text-[#5D4037]" title={username}>
            {username}
          </span>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-4 py-3 rounded-2xl text-[#5D4037]/60 hover:text-red-600 hover:bg-red-50 active:bg-red-100 transition-all active:scale-95"
        >
          <LogOut className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">退出登录</span>
        </button>
      </div>
    </aside>

      {/* 移动端菜单 */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="md:hidden fixed inset-0 top-14 bg-[#FFFBF0] z-40 overflow-y-auto"
          >
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${
                    isActive
                      ? 'bg-[#FFC857]/20 text-[#5D4037] font-medium shadow-sm'
                      : 'text-[#5D4037]/60 hover:bg-[#5D4037]/5'
                  }`}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span className="text-base">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#5D4037]/10">
            <div className="flex items-center gap-3 px-4 py-2 mb-2">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm font-medium truncate text-[#5D4037]" title={username}>
                {username}
              </span>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[#5D4037]/60 hover:text-red-600 hover:bg-red-50 transition-all"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              <span className="text-sm">退出登录</span>
            </button>
          </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
