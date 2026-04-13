'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Menu, X } from 'lucide-react';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import { useIsMobile } from '@/hooks/use-mobile';
import { logoutWithCleanup } from '@/lib/auth/logout-client';

interface AdminSidebarProps {
  username: string;
}

interface AdminNavItem {
  href: string;
  label: string;
  desc: string;
  icon: string;
}

interface AdminNavSection {
  key: string;
  label: string;
  items: AdminNavItem[];
}

const BRAND_TITLE = '拾光谣管理';
const BRAND_SUBTITLE = '后台功能导航';
const CURRENT_ADMIN_TEXT = '当前管理员';
const OPEN_MENU_TEXT = '打开菜单';
const CLOSE_MENU_TEXT = '关闭菜单';
const BACK_HOME_TEXT = '返回个人中心';
const LOGOUT_TEXT = '退出登录';
const LOGOUT_TITLE = '确认退出管理后台？';
const LOGOUT_DESCRIPTION = '退出后将清理当前登录会话，需要重新登录才能继续管理内容。';

const navSections: AdminNavSection[] = [
  {
    key: 'overview',
    label: '概览',
    items: [
      { href: '/admin/stats', label: '数据统计', desc: '运营概览', icon: '📊' },
    ],
  },
  {
    key: 'content',
    label: '内容与服务',
    items: [
      { href: '/admin/poses', label: '摆姿管理', desc: '姿势与标签', icon: '📷' },
      { href: '/admin/bookings', label: '预约管理', desc: '预约与城市', icon: '📮' },
      { href: '/admin/schedule', label: '档期管理', desc: '锁档日期', icon: '🗓️' },
      { href: '/admin/gallery', label: '照片墙管理', desc: '公开图集', icon: '🖼️' },
      { href: '/admin/albums', label: '专属空间管理', desc: '返图空间', icon: '💐' },
      { href: '/admin/about', label: '关于设置', desc: '作者信息', icon: 'ℹ️' },
    ],
  },
  {
    key: 'publish',
    label: '发布与配置',
    items: [
      { href: '/admin/web-pages', label: 'Web 页面管理', desc: 'Web 内测 / 上线 / 下线 / 查看', icon: '🧭' },
      { href: '/admin/miniprogram-pages', label: '小程序页面管理', desc: '小程序 内测 / 上线 / 下线 / 查看', icon: '📱' },
      { href: '/admin/releases', label: '发布版本', desc: '安装包发布', icon: '📦' },
    ],
  },
];

function isNavItemActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavItemLink({
  item,
  pathname,
  onClick,
}: {
  item: AdminNavItem;
  pathname: string;
  onClick?: () => void;
}) {
  const active = isNavItemActive(pathname, item.href);

  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={[
        'admin-sidebar-link flex items-center gap-3 rounded-[24px] px-4 py-3 transition-all duration-200',
        active
          ? 'bg-[#FFC857]/22 text-[#5D4037]'
          : 'text-[#5D4037] hover:bg-[#5D4037]/5',
      ].join(' ')}
    >
      <span
        className={[
          'admin-sidebar-link__icon flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-[22px] leading-none',
          active ? 'bg-[#FFC857]/42' : 'bg-[#5D4037]/8',
        ].join(' ')}
        aria-hidden="true"
      >
        {item.icon}
      </span>
      <span className="admin-sidebar-link__main flex min-w-0 flex-1 flex-col justify-center">
        <span className="admin-sidebar-link__title block truncate text-[15px] font-bold leading-[1.3]">{item.label}</span>
        <span className="admin-sidebar-link__desc mt-1 block truncate text-xs leading-[1.25] text-[#5D4037]/60">{item.desc}</span>
      </span>
    </Link>
  );
}

function NavSectionList({
  sections,
  pathname,
  onItemClick,
}: {
  sections: AdminNavSection[];
  pathname: string;
  onItemClick?: () => void;
}) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.key}>
          <p className="px-4 pb-2 text-[11px] font-semibold tracking-[0.18em] text-[#5D4037]/50">
            {section.label}
          </p>
          <div className="space-y-1.5">
            {section.items.map((item) => (
              <NavItemLink
                key={item.href}
                item={item}
                pathname={pathname}
                onClick={onItemClick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function SidebarFooter({
  username,
  onRequestLogout,
  onAfterNavigate,
}: {
  username: string;
  onRequestLogout: () => void;
  onAfterNavigate?: () => void;
}) {
  return (
    <div className="admin-sidebar-footer border-t border-[#5D4037]/10 bg-[#FFFBF0] px-4 py-4">
      <div className="admin-sidebar-user mb-4 flex items-center gap-3 rounded-[22px] border border-[#5D4037]/12 bg-white px-4 py-3 shadow-[0_6px_16px_rgba(93,64,55,0.06)]">
        <div className="admin-sidebar-user__avatar flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFC857_0%,#FFB347_100%)] text-lg shadow-[0_8px_18px_rgba(255,184,71,0.24)]">
          <span aria-hidden="true">👩</span>
        </div>
        <div className="admin-sidebar-user__main min-w-0 flex-1">
          <p className="admin-sidebar-user__label text-[11px] font-semibold tracking-[0.16em] text-[#5D4037]/56">{CURRENT_ADMIN_TEXT}</p>
          <p className="admin-sidebar-user__name mt-1 truncate text-sm font-bold text-[#5D4037]" title={username}>
            {username}
          </p>
        </div>
      </div>

      <Link
        href="/profile"
        onClick={onAfterNavigate}
        className="admin-sidebar-home-btn mb-2 flex h-11 w-full items-center justify-center rounded-[18px] border border-[#5D4037]/8 bg-[#EBE6DD] text-sm font-bold text-[#5D4037] transition-opacity hover:opacity-90 active:scale-[0.98]"
      >
        {BACK_HOME_TEXT}
      </Link>

      <button
        type="button"
        onClick={onRequestLogout}
        className="admin-sidebar-logout-btn flex h-11 w-full items-center justify-center rounded-[18px] border border-[#DC2626]/10 bg-[#F3DBD2] text-sm font-bold text-[#DC2626] transition-opacity hover:opacity-90 active:scale-[0.98]"
      >
        {LOGOUT_TEXT}
      </button>
    </div>
  );
}

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
    document.body.style.overflow = mobileMenuOpen ? 'hidden' : 'unset';
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
      <div className="admin-mobile-topbar fixed inset-x-0 top-0 z-50 border-b border-[#5D4037]/12 bg-[#FFFBF0] md:hidden">
        <div className="admin-mobile-topbar__inner flex h-16 items-center gap-4 px-4">
          <button
            type="button"
            onClick={() => setMobileMenuOpen((value) => !value)}
            className="admin-mobile-topbar__menu-btn flex h-11 w-11 flex-none items-center justify-center rounded-[20px] bg-[#5D4037]/8 text-[#5D4037] transition-transform active:scale-95"
            aria-label={mobileMenuOpen ? CLOSE_MENU_TEXT : OPEN_MENU_TEXT}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <Link href="/admin/stats" className="admin-mobile-topbar__brand flex min-w-0 flex-1 items-center gap-3">
            <div className="admin-mobile-topbar__logo flex h-11 w-11 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFC857_0%,#FFB347_100%)] text-xl shadow-[0_8px_20px_rgba(255,184,71,0.35)]">
              <span aria-hidden="true">✨</span>
            </div>
            <div className="admin-mobile-topbar__brand-main min-w-0">
              <p className="admin-mobile-topbar__title truncate text-[17px] font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                {BRAND_TITLE}
              </p>
              <p className="admin-mobile-topbar__subtitle mt-1 truncate text-[10px] font-semibold tracking-[0.16em] text-[#5D4037]/60">
                {BRAND_SUBTITLE}
              </p>
            </div>
          </Link>
        </div>
      </div>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 flex-col border-r border-[#5D4037]/12 bg-[#FFFBF0] md:flex">
        <div className="flex h-20 items-center border-b border-[#5D4037]/12 px-6">
          <Link href="/admin/stats" className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#FFC857_0%,#FFB347_100%)] text-[22px] shadow-[0_8px_20px_rgba(255,184,71,0.35)]">
              <span aria-hidden="true">✨</span>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[24px] font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                {BRAND_TITLE}
              </p>
              <p className="mt-1 truncate text-[11px] font-semibold tracking-[0.16em] text-[#5D4037]/60">
                {BRAND_SUBTITLE}
              </p>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <NavSectionList sections={navSections} pathname={pathname} />
        </nav>

        <SidebarFooter username={username} onRequestLogout={handleRequestLogout} />
      </aside>

      <AnimatePresence>
        {mobileMenuOpen ? (
          <>
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="admin-mobile-drawer-mask fixed inset-0 top-16 z-40 bg-black/30 md:hidden"
              aria-label={CLOSE_MENU_TEXT}
              onClick={() => setMobileMenuOpen(false)}
            />

            <motion.div
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="admin-mobile-drawer fixed bottom-0 left-0 top-16 z-50 flex w-[320px] max-w-[82vw] flex-col border-r border-[#5D4037]/12 bg-[#FFFBF0] shadow-[18px_0_40px_rgba(15,23,42,0.2)] md:hidden"
            >
              <nav className="flex-1 overflow-y-auto px-3 py-4">
                <NavSectionList
                  sections={navSections}
                  pathname={pathname}
                  onItemClick={() => setMobileMenuOpen(false)}
                />
              </nav>

              <SidebarFooter
                username={username}
                onRequestLogout={handleRequestLogout}
                onAfterNavigate={() => setMobileMenuOpen(false)}
              />
            </motion.div>
          </>
        ) : null}
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

