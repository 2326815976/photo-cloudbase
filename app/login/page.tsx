'use client';

import { useState, useEffect, Suspense, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Phone, Lock, Eye, EyeOff } from 'lucide-react';
import MiniProgramRecoveryScreen from '@/components/MiniProgramRecoveryScreen';
import { clampChinaMobileInput, isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';
import { createClient } from '@/lib/cloudbase/client';
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

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shellRuntime } = usePageCenterRuntime();
  const { title: managedTitle, subtitle: managedSubtitle } = useManagedPageMeta(
    'login',
    '登录',
    '继续你的拾光之旅'
  );
  const [formData, setFormData] = useState({ phone: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const pageAccessItems = useMemo(
    () => (Array.isArray(shellRuntime?.pageAccessItems) ? shellRuntime.pageAccessItems : []),
    [shellRuntime]
  );
  const registerEntry = useMemo(() => {
    return resolveManagedGuestEntry(pageAccessItems, 'register', '/register', '注册');
  }, [pageAccessItems]);
  const isValidRedirectPath = (path: string): boolean => {
    if (!path.startsWith('/')) return false;
    if (path.includes('://') || path.startsWith('//')) return false;
    if (path.includes('\\')) return false;
    return true;
  };

  useEffect(() => {
    const from = searchParams.get('from');
    if (from && isValidRedirectPath(from)) {
      localStorage.setItem('login_redirect', from);
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const normalizedPhone = normalizeChinaMobile(formData.phone);

      if (!isValidChinaMobile(normalizedPhone)) {
        setError('请输入有效的手机号');
        setIsLoading(false);
        return;
      }

      const dbClient = createClient();
      const { data, error: loginError } = await dbClient.auth.signInWithPassword({
        phone: normalizedPhone,
        password: formData.password,
      });

      if (loginError || !data?.user) {
        const rawMessage = String(loginError?.message ?? '').trim();
        const normalizedMessage = rawMessage.toLowerCase();

        if (normalizedMessage.includes('invalid login credentials')) {
          setError('手机号或密码错误');
        } else if (
          normalizedMessage.includes('timeout') ||
          normalizedMessage.includes('timed out') ||
          normalizedMessage.includes('connect') ||
          normalizedMessage.includes('network') ||
          rawMessage.includes('连接')
        ) {
          setError('服务连接超时，请稍后重试');
        } else if (rawMessage) {
          setError(`登录失败：${rawMessage}`);
        } else {
          setError('登录失败，请重试');
        }
        setIsLoading(false);
        return;
      }

      const storedRedirect =
        typeof window !== 'undefined' ? String(localStorage.getItem('login_redirect') || '').trim() : '';
      const redirectTarget = isValidRedirectPath(storedRedirect) ? storedRedirect : '/profile';

      localStorage.removeItem('login_redirect');
      if (typeof window !== 'undefined') {
        window.location.replace(redirectTarget);
        return;
      }

      router.replace(redirectTarget);
      router.refresh();
    } catch (err) {
      setError('登录失败，请稍后重试');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      {/* 返回按钮 */}
      <button
        onClick={() => router.back()}
        className="icon-button action-icon-btn action-icon-btn--back absolute left-6 top-6"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 mt-8"
      >
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          {managedTitle}
        </h1>
        <p className="text-sm text-[#5D4037]/60">{managedSubtitle || '继续你的拾光之旅'}</p>
      </motion.div>

      {/* 表单 */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col max-w-md mx-auto w-full"
      >
        <div className="space-y-4 mb-6">
          {/* 手机号输入框 */}
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="tel"
              placeholder="手机号"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: clampChinaMobileInput(e.target.value) })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              maxLength={11}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel"
              required
            />
          </div>

          {/* Password 输入框 */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="密码"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full h-14 pl-12 pr-12 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5D4037]/40 hover:text-[#5D4037] transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          {/* 错误提示 */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 提交按钮 */}
        <motion.button
          type="submit"
          disabled={isLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full h-16 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-[#5D4037] font-bold text-lg disabled:opacity-50 transition-all"
        >
          {isLoading ? '解锁中...' : '🔑 解锁空间'}
        </motion.button>

        {/* 底部链接 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8 space-y-3"
        >
          {registerEntry && (
            <p className="text-sm text-[#5D4037]/60">
              还没有账号？
              <button
                type="button"
                onClick={() => router.push(registerEntry.href)}
                className="text-[#FFC857] font-medium ml-1 hover:underline"
              >
                {registerEntry.label}
              </button>
            </p>
          )}
        </motion.div>
      </motion.form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <MiniProgramRecoveryScreen title="拾光中..." description="正在加载登录页面" className="min-h-screen" />
    }>
      <LoginForm />
    </Suspense>
  );
}
