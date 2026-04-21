'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Calendar, Info, LayoutDashboard, Lock, LogOut, Sparkles, User } from 'lucide-react';
import LogoutConfirmModal from '@/components/LogoutConfirmModal';
import MiniProgramRecoveryScreen, { PAGE_LOADING_COPY } from '@/components/MiniProgramRecoveryScreen';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import PrimaryPageShell from '@/components/shell/PrimaryPageShell';
import { createClient } from '@/lib/cloudbase/client';
import { logoutWithCleanup } from '@/lib/auth/logout-client';
import { usePageCenterRuntime } from '@/lib/page-center/runtime-context';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

function isTransientConnectionError(message: string): boolean {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('connect timeout') ||
    normalized.includes('request timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('etimedout') ||
    normalized.includes('esockettimedout') ||
    normalized.includes('network')
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { shellRuntime } = usePageCenterRuntime();
  const { title: managedTitle, subtitle: managedSubtitle } = useManagedPageMeta(
    'profile',
    '我的小天地',
    '📒 管理你的拾光小秘密 📒'
  );
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userPhone, setUserPhone] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authCheckError, setAuthCheckError] = useState('');
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const managedPageMap = useMemo(() => {
    const pageAccessItems = Array.isArray(shellRuntime?.pageAccessItems)
      ? shellRuntime.pageAccessItems
      : [];
    return pageAccessItems.reduce<
      Record<string, { publishState: string; navOrder: number; navText: string; headerTitle: string }>
    >(
      (map, item) => {
        map[item.pageKey] = {
          publishState: String(item.publishState || '').trim(),
          navOrder: Number.isFinite(Number(item.navOrder)) ? Number(item.navOrder) : 99,
          navText: String(item.navText || '').trim(),
          headerTitle: String(item.headerTitle || '').trim(),
        };
        return map;
      },
      {}
    );
  }, [shellRuntime]);

  const resolveVisibleTitle = (pageKey: string, fallbackTitle: string) => {
    const current = managedPageMap[pageKey];
    if (!current || current.publishState !== 'online') {
      return '';
    }
    return current.navText || current.headerTitle || fallbackTitle;
  };

  const resolveVisibleOrder = (pageKey: string, fallbackOrder: number) => {
    const current = managedPageMap[pageKey];
    if (!current || current.publishState !== 'online') {
      return fallbackOrder;
    }
    return Number.isFinite(Number(current.navOrder)) ? Number(current.navOrder) : fallbackOrder;
  };

  const profileMenuItems = useMemo(() => {
    return [
      {
        key: 'profile-edit',
        order: resolveVisibleOrder('profile-edit', 110),
        title: resolveVisibleTitle('profile-edit', '编辑个人资料'),
        description: '修改用户名、手机号、微信号',
        path: '/profile/edit',
        Icon: User,
        iconWrapClassName: 'w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center',
        iconClassName: 'w-5 h-5 text-[#FFC857]',
        buttonClassName:
          'w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all',
        titleClassName: 'text-sm font-medium text-[#5D4037]',
      },
      {
        key: 'profile-bookings',
        order: resolveVisibleOrder('profile-bookings', 120),
        title: resolveVisibleTitle('profile-bookings', '我的预约记录'),
        description: '查看所有约拍记录',
        path: '/profile/bookings',
        Icon: Calendar,
        iconWrapClassName: 'w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center',
        iconClassName: 'w-5 h-5 text-[#FFC857]',
        buttonClassName:
          'w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all',
        titleClassName: 'text-sm font-medium text-[#5D4037]',
      },
      {
        key: 'profile-beta',
        order: resolveVisibleOrder('profile-beta', 130),
        title: resolveVisibleTitle('profile-beta', '内测功能'),
        description: '输入内测码，解锁并进入专属内测页面',
        path: '/profile/beta',
        Icon: Sparkles,
        iconWrapClassName: 'w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center',
        iconClassName: 'w-5 h-5 text-[#FFC857]',
        buttonClassName:
          'w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all',
        titleClassName: 'text-sm font-medium text-[#5D4037]',
      },
      {
        key: 'about',
        order: resolveVisibleOrder('about', 140),
        title: resolveVisibleTitle('about', '关于'),
        description: '查看作者介绍、联系方式',
        path: '/profile/about',
        Icon: Info,
        iconWrapClassName: 'w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center',
        iconClassName: 'w-5 h-5 text-[#FFC857]',
        buttonClassName:
          'w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all',
        titleClassName: 'text-sm font-medium text-[#5D4037]',
      },
      {
        key: 'profile-change-password',
        order: resolveVisibleOrder('profile-change-password', 150),
        title: resolveVisibleTitle('profile-change-password', '修改密码'),
        description: '更新账户安全信息',
        path: '/profile/change-password',
        Icon: Lock,
        iconWrapClassName: 'w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center',
        iconClassName: 'w-5 h-5 text-[#FFC857]',
        buttonClassName:
          'w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all',
        titleClassName: 'text-sm font-medium text-[#5D4037]',
      },
      {
        key: 'profile-delete-account',
        order: resolveVisibleOrder('profile-delete-account', 160),
        title: resolveVisibleTitle('profile-delete-account', '删除账户'),
        description: '永久删除账户和所有数据',
        path: '/profile/delete-account',
        Icon: LogOut,
        iconWrapClassName: 'w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center',
        iconClassName: 'w-5 h-5 text-red-600',
        buttonClassName:
          'w-full bg-white rounded-2xl p-4 shadow-sm border border-[#5D4037]/10 flex items-center gap-3 text-left hover:shadow-md hover:border-red-500/30 transition-all',
        titleClassName: 'text-sm font-medium text-red-600',
      },
    ]
      .filter((item) => item.title)
      .sort((left, right) => {
        if (left.order !== right.order) {
          return left.order - right.order;
        }
        return left.key.localeCompare(right.key, 'zh-CN');
      });
  }, [isAdmin, managedPageMap]);

  const guestMenuItems = useMemo(
    () =>
      [
        {
          key: 'login',
          title: resolveVisibleTitle('login', '登录'),
          path: '/login',
          className:
            'w-full h-12 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px] text-[#5D4037] font-bold transition-all',
        },
        {
          key: 'register',
          title: resolveVisibleTitle('register', '注册'),
          path: '/register',
          className:
            'w-full h-12 rounded-full bg-transparent border-2 border-[#5D4037]/30 text-[#5D4037]/70 font-medium hover:border-[#5D4037]/50 transition-colors',
        },
      ].filter((item) => item.title),
    [managedPageMap]
  );

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      const dbClient = createClient();
      if (!dbClient) {
        setIsLoading(false);
        return;
      }

      const {
        data: { session },
        error: sessionError,
      } = await dbClient.auth.getSession();

      if (sessionError) {
        setAuthCheckError(
          isTransientConnectionError(sessionError.message || '')
            ? '会话服务连接超时，请稍后重试'
            : `会话校验失败：${sessionError.message || '未知错误'}`
        );
        setIsLoading(false);
        return;
      }

      if (session?.user) {
        setIsLoggedIn(true);
        setAuthCheckError('');
        setUserEmail(session.user.email || '');
        setUserPhone(session.user.phone || '');

        // 从数据库profiles表获取用户名
        const { data: profile } = await dbClient
          .from('profiles')
          .select('name, role')
          .eq('id', session.user.id)
          .single();

        setUserName(profile?.name || session.user.phone || '用户');
        setIsAdmin(String(profile?.role || '').toLowerCase() === 'admin');
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <MiniProgramRecoveryScreen
        title={PAGE_LOADING_COPY.title}
        description={PAGE_LOADING_COPY.description}
        className="h-screen"
      />
    );
  }

  if (!isLoggedIn) {
    if (authCheckError) {
      return (
        <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center px-6">
          <div className="max-w-sm w-full bg-white rounded-2xl border border-[#5D4037]/10 p-6 text-center">
            <h2 className="text-lg font-bold text-[#5D4037] mb-2">暂时无法加载账号状态</h2>
            <p className="text-sm text-[#5D4037]/70 mb-5">{authCheckError}</p>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-full bg-[#FFC857] text-[#5D4037] font-bold border border-[#5D4037]/20"
            >
              重新加载
            </button>
          </div>
        </div>
      );
    }

    return (
      <PrimaryPageShell title={managedTitle} badge={managedSubtitle || undefined} className="h-full w-full" contentClassName="min-h-0">
        {/* 手账风页头 */}


        {/* 未登录态 */}
        <PreviewAwareScrollArea className="flex-1 flex flex-col items-center justify-center overflow-y-auto px-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="text-center"
          >
            <Lock className="w-20 h-20 text-[#FFC857] mx-auto mb-6" strokeWidth={1.5} />
            <h2 className="text-lg font-bold text-[#5D4037] mb-2">开启你的专属空间 ✨</h2>
            <p className="text-[#5D4037]/60 mb-8 text-sm">登录后解锁更多功能</p>

            {guestMenuItems.length > 0 && (
              <div className="flex flex-col gap-3 w-full max-w-xs">
                {guestMenuItems.map((item) => (
                  <motion.button
                    key={item.key}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => router.push(item.path)}
                    className={item.className}
                  >
                    {item.title}
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        </PreviewAwareScrollArea>
      </PrimaryPageShell>
    );
  }

  const handleLogoutConfirm = async () => {
    if (isLoggingOut) {
      return;
    }

    setIsLoggingOut(true);
    await logoutWithCleanup();
    setUserEmail('');
    setUserName('');
    setUserPhone('');
    setIsAdmin(false);
    setIsLoggedIn(false);
    setShowLogoutConfirm(false);
    setIsLoggingOut(false);
    router.replace('/login');
  };

  return (
    <PrimaryPageShell title={managedTitle} badge={managedSubtitle || undefined} className="h-full w-full" contentClassName="min-h-0">
      {/* 手账风页头 - 使用弹性布局适配不同屏幕 */}


      {/* 滚动区域 */}
      <PreviewAwareScrollArea className="flex-1 overflow-y-auto px-6 pt-6">
        {/* 身份卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 mb-6"
        >
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#FFC857] via-[#FFB347] to-[#FF9A3C] flex items-center justify-center text-white text-2xl font-bold shadow-md">
              光
            </div>
            <div>
              <h2 className="text-lg font-bold text-[#5D4037]">{userName}</h2>
              {userPhone && (
                <p className="text-sm text-[#5D4037]/60 mt-1">{userPhone}</p>
              )}
            </div>
          </div>
        </motion.div>

        {/* 功能菜单 */}
        <div className="space-y-3">
          {profileMenuItems.map((item, index) => (
            <motion.button
              key={item.key}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + index * 0.05 }}
              whileTap={{ scale: 0.98 }}
              whileHover={{ x: 4 }}
              onClick={() => router.push(item.path)}
              className={item.buttonClassName}
            >
              <div className={item.iconWrapClassName}>
                <item.Icon className={item.iconClassName} />
              </div>
              <div className="flex-1">
                <h3 className={item.titleClassName}>{item.title}</h3>
                <p className="text-xs text-[#5D4037]/50">{item.description}</p>
              </div>
            </motion.button>
          ))}

          {isAdmin && (
            <motion.button
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.25 + profileMenuItems.length * 0.05 }}
              whileTap={{ scale: 0.98 }}
              whileHover={{ x: 4 }}
              onClick={() => router.push('/admin')}
              className="w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all"
            >
              <div className="w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center">
                <LayoutDashboard className="w-5 h-5 text-[#FFC857]" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-medium text-[#5D4037]">后台管理系统</h3>
                <p className="text-xs text-[#5D4037]/50">查看统计、维护系统、管理内容</p>
              </div>
            </motion.button>
          )}

          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            whileTap={{ scale: 0.98 }}
            whileHover={{ x: 4 }}
            onClick={() => setShowLogoutConfirm(true)}
            className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#5D4037]/10 flex items-center gap-3 text-left hover:shadow-md transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#5D4037]/10 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-[#5D4037]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-[#5D4037]">退出登录</h3>
              <p className="text-xs text-[#5D4037]/50">安全退出当前账户</p>
            </div>
          </motion.button>
        </div>
      </PreviewAwareScrollArea>

      <LogoutConfirmModal
        isOpen={showLogoutConfirm}
        isLoading={isLoggingOut}
        title="确认退出登录？"
        description="退出后将清理当前登录会话，下次需重新登录。"
        onClose={() => setShowLogoutConfirm(false)}
        onConfirm={handleLogoutConfirm}
      />
    </PrimaryPageShell>
  );
}
