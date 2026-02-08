'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Phone, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formData, setFormData] = useState({ phone: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // 记录来源路径（安全验证：仅允许内部路径）
    const from = searchParams.get('from');
    if (from && isValidRedirectPath(from)) {
      localStorage.setItem('login_redirect', from);
    }
  }, [searchParams]);

  // 验证重定向路径是否安全（防止开放重定向攻击）
  const isValidRedirectPath = (path: string): boolean => {
    // 必须以 / 开头（内部路径）
    if (!path.startsWith('/')) return false;
    // 不能包含协议（防止 //evil.com 这样的绕过）
    if (path.includes('://') || path.startsWith('//')) return false;
    // 不能包含反斜杠（防止路径遍历）
    if (path.includes('\\')) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      // 验证手机号格式
      if (!/^1[3-9]\d{9}$/.test(formData.phone)) {
        setError('请输入有效的手机号');
        setIsLoading(false);
        return;
      }

      const supabase = createClient();
      if (!supabase) {
        setError('系统配置错误，请稍后重试');
        setIsLoading(false);
        return;
      }

      // 使用手机号作为邮箱格式登录（与注册时保持一致）
      const email = `${formData.phone}@slogan.app`;

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: formData.password,
      });

      if (signInError) {
        if (signInError.message.toLowerCase().includes('invalid login credentials')) {
          setError('手机号或密码错误');
        } else {
          setError('登录失败，请重试');
        }
        setIsLoading(false);
        return;
      }

      // 检查是否有保存的重定向路径
      const savedRedirect = localStorage.getItem('login_redirect');

      // 获取用户角色
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      // 根据角色和保存的路径跳转
      if (profile?.role === 'admin') {
        if (savedRedirect?.startsWith('/admin')) {
          localStorage.removeItem('login_redirect');
          router.push(savedRedirect);
        } else {
          router.push('/admin');
        }
      } else {
        localStorage.removeItem('login_redirect');
        router.push('/profile');
      }
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
        className="absolute left-6 top-6 w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
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
          欢迎回来 👋
        </h1>
        <p className="text-sm text-[#5D4037]/60">继续你的拾光之旅</p>
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
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              maxLength={11}
              required
            />
          </div>

          {/* Password 输入框 */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="password"
              placeholder="密码"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
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
          <p className="text-sm text-[#5D4037]/60">
            还没有账号？
            <button
              type="button"
              onClick={() => router.push('/register')}
              className="text-[#FFC857] font-medium ml-1 hover:underline"
            >
              去注册
            </button>
          </p>
        </motion.div>
      </motion.form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center">
        <div className="text-[#5D4037]">加载中...</div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
