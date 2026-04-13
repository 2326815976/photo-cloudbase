'use client';

import { usePathname } from 'next/navigation';
import MiniProgramRecoveryScreen from '@/components/MiniProgramRecoveryScreen';

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
    return { title: '拾光中...', description: '正在加载登录页面' };
  }
  if (pathname.startsWith('/register') || pathname.startsWith('/signup')) {
    return { title: '拾光中...', description: '正在加载注册页面' };
  }
  if (isManagedShellRoute(pathname)) {
    return { title: '拾光中...', description: '正在同步页面配置与内容' };
  }

  return { title: '拾光中...', description: '正在加载页面内容' };
}

export default function Loading() {
  const pathname = usePathname() || '/';
  const { title, description } = getLoadingCopy(pathname);

  return <MiniProgramRecoveryScreen title={title} description={description} className="h-screen" />;
}
