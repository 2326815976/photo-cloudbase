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
  Info,
  Package,
  LogOut,
  User,
  Menu,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { logoutWithCleanup } from '@/lib/auth/logout-client';

interface AdminSidebarProps {
  username: string;
}

const BRAND_TITLE = '\u62fe\u5149\u8c23\u7ba1\u7406';
const BRAND_SUBTITLE = '\u540e\u53f0\u529f\u80fd\u5bfc\u822a';
const NAV_GROUP_TITLE = '\u529f\u80fd\u5206\u533a';
const OPEN_MENU_TEXT = '\u6253\u5f00\u83dc\u5355';
const CLOSE_MENU_TEXT = '\u5173\u95ed\u83dc\u5355';
const LOGOUT_TEXT = '\u9000\u51fa\u767b\u5f55';
const LOGOUT_TITLE = '\u786e\u8ba4\u9000\u51fa\u7ba1\u7406\u540e\u53f0\uff1f';
const LOGOUT_DESCRIPTION = '\u9000\u51fa\u540e\u5c06\u6e05\u7406\u5f53\u524d\u767b\u5f55\u4f1a\u8bdd\uff0c\u9700\u91cd\u65b0\u767b\u5f55\u624d\u80fd\u7ee7\u7eed\u7ba1\u7406\u5185\u5bb9\u3002';

const navItems = [
  { href: '/admin/stats', label: '\u6570\u636e\u7edf\u8ba1', icon: LayoutDashboard },
  { href: '/admin/poses', label: '\u6446\u59ff\u7ba1\u7406', icon: Camera },
  { href: '/admin/bookings', label: '\u9884\u7ea6\u7ba1\u7406', icon: Calendar },
  { href: '/admin/schedule', label: '\u6863\u671f\u7ba1\u7406', icon: Calendar },
  { href: '/admin/gallery', label: '\u7167\u7247\u5899\u7ba1\u7406', icon: Image },
  { href: '/admin/albums', label: '\u4e13\u5c5e\u7a7a\u95f4\u7ba1\u7406', icon: FolderHeart },
  { href: '/admin/about', label: '\u5173\u4e8e\u8bbe\u7f6e', icon: Info },
  { href: '/admin/releases', label: '\u53d1\u5e03\u7248\u672c', icon: Package },
];

export default function AdminSidebar({ username }: AdminSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

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
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [mobileMenuOpen]);

  const handleRequestLogout = () => {
    setShowLogoutConfirm(true);
  };

  const handleConfirmLogout = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    await logoutWithCleanup();
    setShowLogoutConfirm(false);
    setMobileMenuOpen(false);
    setIsLoggingOut(false);
    router.replace('/login');
  };

  return (
    <>
      <div className="md:hidden fixed left-0 right-0 top-0 z-50 border-b border-[#5D4037]/10 bg-[#FFFBF0]/92 px-4 py-3 shadow-[0_8px_24px_rgba(93,64,55,0.08)] backdrop-blur-xl supports-[backdrop-filter]:bg-[#FFFBF0]/80">
        <div className="flex items-center justify-between gap-3">
          <Link href="/admin/stats" className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFC857] to-[#FFB347] text-[18px] shadow-[0_8px_18px_rgba(255,200,87,0.28)]">
              <span aria-hidden="true">?</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[17px] font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                {BRAND_TITLE}
              </p>
              <p className="mt-1 truncate text-[10px] font-semibold tracking-[0.16em] text-[#8D6E63]/72">
                {BRAND_SUBTITLE}
              </p>
            </div>
          </Link>
          <button
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#5D4037]/10 bg-white/72 text-[#5D4037] shadow-[0_8px_18px_rgba(93,64,55,0.08)] transition-all active:scale-95"
            aria-label={mobileMenuOpen ? CLOSE_MENU_TEXT : OPEN_MENU_TEXT}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <aside className="hidden md:flex fixed left-0 top-0 z-30 h-full w-72 flex-col p-4">
        <div className="flex h-full flex-col">
          <div className="relative overflow-hidden rounded-[30px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.94)_0%,rgba(255,251,240,0.92)_100%)] px-5 py-5 shadow-[0_16px_36px_rgba(93,64,55,0.12)] backdrop-blur-sm">
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#FFC857] via-[#FFB347] to-[#FFD67E]" />
            <Link href="/admin/stats" className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br from-[#FFC857] to-[#FFB347] text-[22px] shadow-[0_12px_22px_rgba(255,200,87,0.26)]">
                <span aria-hidden="true">?</span>
              </div>
              <div className="min-w-0">
                <p className="truncate text-[24px] font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  {BRAND_TITLE}
                </p>
                <p className="mt-1 text-[11px] font-semibold tracking-[0.16em] text-[#8D6E63]/70">
                  {BRAND_SUBTITLE}
                </p>
              </div>
            </Link>
          </div>

          <nav className="mt-4 flex-1 overflow-y-auto rounded-[30px] border border-[#5D4037]/10 bg-white/80 p-3 shadow-[0_14px_30px_rgba(93,64,55,0.10)] backdrop-blur-sm">
            <div className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8D6E63]/70">
              {NAV_GROUP_TITLE}
            </div>
            <div className="space-y-1.5">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-3 rounded-[22px] border px-4 py-3 transition-all ${
                      isActive
                        ? 'border-[#FFC857]/45 bg-[linear-gradient(135deg,rgba(255,200,87,0.26),rgba(255,245,220,0.98))] text-[#5D4037] shadow-[0_10px_18px_rgba(255,200,87,0.18)]'
                        : 'border-transparent text-[#5D4037]/72 hover:border-[#5D4037]/10 hover:bg-[#5D4037]/5 hover:text-[#5D4037]'
                    }`}
                  >
                    <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${isActive ? 'bg-[#FFC857]/24 text-[#5D4037]' : 'bg-[#5D4037]/6 text-[#8D6E63]'}`}>
                      <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                    </div>
                    <span className="text-[15px] font-medium">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          <div className="mt-4 rounded-[28px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,240,0.92)_100%)] p-4 shadow-[0_14px_30px_rgba(93,64,55,0.10)]">
            <div className="mb-3 flex items-center gap-3 rounded-[22px] bg-[#FFFBF0] px-4 py-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFC857] to-[#FFB347] shadow-[0_10px_18px_rgba(255,200,87,0.22)]">
                <User className="h-[18px] w-[18px] text-white" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8D6E63]/65">{'\u5f53\u524d\u7ba1\u7406\u5458'}</p>
                <p className="truncate text-sm font-semibold text-[#5D4037]" title={username}>
                  {username}
                </p>
              </div>
            </div>

            <button
              onClick={handleRequestLogout}
              className="flex w-full items-center gap-3 rounded-[22px] px-4 py-3 text-[#5D4037]/72 transition-all hover:bg-[#FDECEC] hover:text-[#C65D4A] active:scale-[0.98]"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FDECEC] text-[#C65D4A]">
                <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
              </div>
              <span className="text-sm font-medium">{LOGOUT_TEXT}</span>
            </button>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {mobileMenuOpen && (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden fixed inset-0 top-0 z-40 bg-[#5D4037]/18 backdrop-blur-[2px]"
              aria-label={CLOSE_MENU_TEXT}
            />
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="md:hidden fixed inset-x-3 bottom-3 top-[68px] z-50 overflow-hidden rounded-[28px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(255,251,240,0.96)_100%)] shadow-[0_22px_48px_rgba(93,64,55,0.16)]"
            >
              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#FFC857] via-[#FFB347] to-[#FFD67E]" />
              <nav className="flex h-full flex-col overflow-hidden p-3 pt-4">
                <div className="mb-2 px-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8D6E63]/70">
                  {NAV_GROUP_TITLE}
                </div>
                <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 rounded-[22px] border px-4 py-3 transition-all ${
                          isActive
                            ? 'border-[#FFC857]/45 bg-[linear-gradient(135deg,rgba(255,200,87,0.26),rgba(255,245,220,0.98))] text-[#5D4037] shadow-[0_10px_18px_rgba(255,200,87,0.18)]'
                            : 'border-transparent text-[#5D4037]/72 hover:border-[#5D4037]/10 hover:bg-[#5D4037]/5 hover:text-[#5D4037]'
                        }`}
                      >
                        <div className={`flex h-9 w-9 items-center justify-center rounded-2xl ${isActive ? 'bg-[#FFC857]/24 text-[#5D4037]' : 'bg-[#5D4037]/6 text-[#8D6E63]'}`}>
                          <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                        </div>
                        <span className="text-[15px] font-medium">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>

                <div className="mt-3 rounded-[24px] border border-[#5D4037]/10 bg-white/72 p-3 shadow-[0_12px_28px_rgba(93,64,55,0.08)]">
                  <div className="mb-2 flex items-center gap-3 rounded-[20px] bg-[#FFFBF0] px-3 py-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FFC857] to-[#FFB347] shadow-[0_10px_18px_rgba(255,200,87,0.22)]">
                      <User className="h-[18px] w-[18px] text-white" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#8D6E63]/65">{'\u5f53\u524d\u7ba1\u7406\u5458'}</p>
                      <p className="truncate text-sm font-semibold text-[#5D4037]" title={username}>
                        {username}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={handleRequestLogout}
                    className="flex w-full items-center gap-3 rounded-[20px] px-3 py-3 text-[#5D4037]/72 transition-all hover:bg-[#FDECEC] hover:text-[#C65D4A]"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-[#FDECEC] text-[#C65D4A]">
                      <LogOut className="h-[18px] w-[18px] flex-shrink-0" />
                    </div>
                    <span className="text-sm font-medium">{LOGOUT_TEXT}</span>
                  </button>
                </div>
              </nav>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <LogoutConfirmModal
        isOpen={showLogoutConfirm}
        isLoading={isLoggingOut}
        title={LOGOUT_TITLE}
        description={LOGOUT_DESCRIPTION}
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleConfirmLogout}
      />
    </>
  );
}
