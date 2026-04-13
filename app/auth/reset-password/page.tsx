'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, RefreshCcw, ShieldAlert } from 'lucide-react';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';
import { usePageCenterRuntime } from '@/lib/page-center/runtime-context';

function resolveManagedGuestEntry(
  pageAccessItems: Array<{ pageKey: string; publishState: string; navText: string; headerTitle: string }>,
  pageKey: string,
  href: string,
  fallbackLabel: string
) {
  const current = pageAccessItems.find((item) => item.pageKey === pageKey);
  if (!current || current.publishState !== 'online') {
    return null;
  }
  return {
    href,
    label: String(current.navText || current.headerTitle || fallbackLabel).trim() || fallbackLabel,
  };
}

export default function ResetPasswordPage() {
  const router = useRouter();
  const { shellRuntime } = usePageCenterRuntime();
  const { title: managedTitle, subtitle: managedSubtitle } = useManagedPageMeta(
    'reset-password',
    '重置密码',
    '当前版本使用手机号登录后在个人中心完成密码更新'
  );
  const pageAccessItems = useMemo(
    () => (Array.isArray(shellRuntime?.pageAccessItems) ? shellRuntime.pageAccessItems : []),
    [shellRuntime]
  );
  const loginEntry = useMemo(
    () => resolveManagedGuestEntry(pageAccessItems, 'login', '/login', '登录'),
    [pageAccessItems]
  );
  const forgotEntry = useMemo(
    () => resolveManagedGuestEntry(pageAccessItems, 'forgot-password', '/auth/forgot-password', '忘记密码'),
    [pageAccessItems]
  );

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push(loginEntry?.href || '/login');
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      <button
        onClick={handleBack}
        className="icon-button action-icon-btn action-icon-btn--back absolute left-6 top-6"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full mx-auto mt-14"
      >
        <div className="bg-white rounded-2xl p-6 border border-[#5D4037]/10 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-4 mx-auto">
            <RefreshCcw className="w-7 h-7" />
          </div>

          <h1 className="text-2xl font-bold text-[#5D4037] text-center mb-3" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            {managedTitle}
          </h1>

          <p className="text-sm text-[#5D4037]/70 leading-relaxed text-center mb-5">
            {managedSubtitle || '当前版本仅支持手机号登录后在个人中心完成密码更新。'}
          </p>

          <div className="rounded-xl bg-[#FFF7E8] border border-[#FFC857]/40 p-4 text-sm text-[#5D4037]/80 leading-relaxed">
            <p className="flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 mt-0.5 text-[#8D6E63] flex-shrink-0" />
              <span>若你仍无法登录，请返回登录页查看忘记密码说明，或注册新账号后联系管理员处理。</span>
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            {loginEntry && (
              <button
                onClick={() => router.push(loginEntry.href)}
                className="flex-1 h-11 rounded-full bg-[#FFC857] border-2 border-[#5D4037] text-[#5D4037] font-bold shadow-[3px_3px_0px_#5D4037] hover:shadow-[1px_1px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
              >
                {loginEntry.label}
              </button>
            )}
            {forgotEntry && (
              <button
                onClick={() => router.push(forgotEntry.href)}
                className="flex-1 h-11 rounded-full bg-white border-2 border-[#5D4037]/20 text-[#5D4037] font-semibold hover:bg-[#FFFBF0] transition-colors"
              >
                {forgotEntry.label}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
