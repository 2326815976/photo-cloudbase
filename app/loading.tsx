'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';

function isManagedShellRoute(pathname: string) {
  return (
    pathname === '/' ||
    pathname.startsWith('/album') ||
    pathname.startsWith('/gallery') ||
    pathname.startsWith('/booking') ||
    pathname.startsWith('/profile')
  );
}

function getLoadingCopy(pathname: string) {
  if (pathname.startsWith('/admin/stats')) {
    return { title: '管理台准备中...', description: '正在加载数据统计' };
  }
  if (pathname.startsWith('/admin/poses')) {
    return { title: '管理台准备中...', description: '正在加载摆姿管理' };
  }
  if (pathname.startsWith('/admin/schedule')) {
    return { title: '管理台准备中...', description: '正在加载档期管理' };
  }
  if (pathname.startsWith('/admin/gallery')) {
    return { title: '管理台准备中...', description: '正在加载照片墙管理' };
  }
  if (pathname.startsWith('/admin/albums')) {
    return { title: '管理台准备中...', description: '正在加载返图空间管理' };
  }
  if (pathname.startsWith('/admin/bookings')) {
    return { title: '管理台准备中...', description: '正在加载预约管理' };
  }
  if (pathname.startsWith('/admin/releases')) {
    return { title: '管理台准备中...', description: '正在加载版本管理' };
  }
  if (pathname.startsWith('/admin')) {
    return { title: '管理台准备中...', description: '正在加载管理后台' };
  }

  if (pathname.startsWith('/login')) {
    return { title: '页面准备中...', description: '正在加载登录页面' };
  }
  if (pathname.startsWith('/register') || pathname.startsWith('/signup')) {
    return { title: '页面准备中...', description: '正在加载注册页面' };
  }
  if (isManagedShellRoute(pathname)) {
    return { title: '页面准备中...', description: '正在同步页面配置与内容' };
  }

  return { title: '页面准备中...', description: '正在加载页面内容' };
}

export default function Loading() {
  const pathname = usePathname() || '/';
  const { title, description } = getLoadingCopy(pathname);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-[#FFFBF0]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex flex-col items-center gap-6"
      >
        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="h-24 w-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-8 w-8 text-[#FFC857]" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p className="mb-2 text-lg font-medium text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            {title}
          </p>
          <p className="text-sm text-[#5D4037]/60">{description}</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
