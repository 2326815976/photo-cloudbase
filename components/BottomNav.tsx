'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Home, Image, Info, Lock, User } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { vibrate } from '@/lib/android';
import { isAndroidApp } from '@/lib/platform';
import type { WebShellRuntime } from '@/lib/page-center/config';

interface BottomNavProps {
  hidden?: boolean;
  runtime?: WebShellRuntime | null;
  isAuthenticated?: boolean;
}

const ICON_COMPONENT_MAP: Record<string, typeof User> = {
  home: Home,
  album: Lock,
  gallery: Image,
  booking: Calendar,
  profile: User,
  about: Info,
};


function isNavItemActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function BottomNav({ hidden = false, runtime = null, isAuthenticated = false }: BottomNavProps) {
  const pathname = usePathname() || '/';
  const shouldReduceMotion = useReducedMotion();
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(isAndroidApp());
  }, []);

  const navItems = useMemo(() => {
    const runtimeItems = runtime && Array.isArray(runtime.navItems)
      ? runtime.navItems.map((item) => ({
          href: item.href,
          label: isAuthenticated ? item.label : item.guestLabel || item.label,
          iconKey: item.iconKey,
        }))
      : [];
    return runtimeItems.map((item) => ({
      ...item,
      icon: ICON_COMPONENT_MAP[item.iconKey] || User,
    }));
  }, [isAuthenticated, runtime]);

  const useScrollableLayout = navItems.length > 5;

  const handleNavClick = () => {
    if (typeof document !== 'undefined') {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement) {
        activeElement.blur();
      }
      document.getSelection?.()?.removeAllRanges();
    }
    vibrate(30);
  };

  if (hidden || !runtime || navItems.length === 0) {
    return null;
  }

  if (isAndroid) {
    return (
      <nav style={{ height: 'var(--app-shell-nav-height, calc(68px + env(safe-area-inset-bottom)))' }} className="absolute bottom-0 left-0 z-50 w-full border-t-2 border-dashed border-[#5D4037]/15 bg-[#FFFBF0]/95 shadow-[0_-2px_12px_rgba(93,64,55,0.08)] backdrop-blur-md">
        <div
          className={[
            'h-full pb-[max(8px,env(safe-area-inset-bottom))]',
            useScrollableLayout
              ? 'flex items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
              : 'flex justify-around items-center px-4',
          ].join(' ')}
        >
          {navItems.map((item) => {
            const isActive = isNavItemActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={useScrollableLayout ? 'flex-none min-w-[68px] px-1' : 'flex-1'}
                onClick={handleNavClick}
              >
                <div
                  className={`flex flex-col items-center gap-1 transition-all relative active:scale-90 ${
                    isActive ? 'text-[#FFC857] scale-105' : 'text-[#5D4037]/60'
                  }`}
                >
                  {isActive ? (
                    <div className="absolute -top-1 w-14 h-14 bg-[#FFC857]/30 rounded-full blur-lg animate-in fade-in duration-300" />
                  ) : null}
                  <div className={`relative ${isActive ? 'animate-bounce' : ''}`}>
                    <Icon
                      className={`w-6 h-6 ${isActive ? 'fill-[#FFC857] drop-shadow-[0_2px_4px_rgba(255,200,87,0.3)]' : ''}`}
                      strokeWidth={isActive ? 2.5 : 2}
                    />
                  </div>
                  <span className={`max-w-[64px] truncate text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{item.label}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav style={{ height: 'var(--app-shell-nav-height, calc(68px + env(safe-area-inset-bottom)))' }} className="absolute bottom-0 left-0 z-50 w-full border-t-2 border-dashed border-[#5D4037]/15 bg-[#FFFBF0]/95 shadow-[0_-2px_12px_rgba(93,64,55,0.08)] backdrop-blur-md">
      <div
        className={[
          'h-full pb-[max(8px,env(safe-area-inset-bottom))]',
          useScrollableLayout
            ? 'flex items-center gap-1 overflow-x-auto px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden'
            : 'flex justify-around items-center px-4',
        ].join(' ')}
      >
        {navItems.map((item) => {
          const isActive = isNavItemActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={useScrollableLayout ? 'flex-none min-w-[68px] px-1' : 'flex-1'}
              onClick={handleNavClick}
            >
              <motion.div
                whileTap={shouldReduceMotion ? undefined : { scale: 0.9 }}
                animate={isActive && !shouldReduceMotion ? { scale: 1.05 } : { scale: 1 }}
                transition={shouldReduceMotion ? { duration: 0 } : { type: 'spring', stiffness: 400, damping: 17 }}
                className={`flex flex-col items-center gap-1 transition-colors relative ${
                  isActive ? 'text-[#FFC857]' : 'text-[#5D4037]/60'
                }`}
              >
                {isActive ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="absolute -top-1 w-14 h-14 bg-[#FFC857]/30 rounded-full blur-lg"
                  />
                ) : null}
                <motion.div
                  animate={isActive && !shouldReduceMotion ? { y: [0, -3, 0] } : { y: 0 }}
                  transition={shouldReduceMotion ? { duration: 0 } : { duration: 0.5, ease: 'easeOut' }}
                  className="relative"
                >
                  <Icon
                    className={`w-6 h-6 ${isActive ? 'fill-[#FFC857] drop-shadow-[0_2px_4px_rgba(255,200,87,0.3)]' : ''}`}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                </motion.div>
                <span className={`max-w-[64px] truncate text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{item.label}</span>
              </motion.div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
