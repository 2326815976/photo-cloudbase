'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowLeft, Mail, Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setError('系统配置错误，请稍后重试');
        setIsLoading(false);
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        // 错误信息中文化（不区分大小写）
        const errorMessages: Record<string, string> = {
          'invalid login credentials': '邮箱或密码错误',
          'email not confirmed': '请先验证您的邮箱',
          'email rate limit exceeded': '登录尝试过于频繁，请稍后再试',
        };
        const errorMsg = errorMessages[signInError.message.toLowerCase()] || signInError.message;
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      // 检查邮箱是否已验证
      if (!data.user?.email_confirmed_at) {
        await supabase.auth.signOut();
        setError('请先验证您的邮箱后再登录');
        setIsLoading(false);
        return;
      }

      // 获取用户角色
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', data.user.id)
        .single();

      // 根据角色跳转
      if (profile?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/profile');
      }
      router.refresh();
    } catch (err) {
      setError('登录失败，请稍后重试');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20 relative overflow-hidden">
      {/* 装饰性背景元素 */}
      <motion.div
        animate={shouldReduceMotion ? { scale: 1, opacity: 0.3 } : {
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={shouldReduceMotion ? { duration: 0.2 } : {
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-20 right-10 w-32 h-32 bg-[#FFC857]/10 rounded-full blur-3xl"
      />
      <motion.div
        animate={shouldReduceMotion ? { scale: 1, opacity: 0.3 } : {
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={shouldReduceMotion ? { duration: 0.2 } : {
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 2
        }}
        className="absolute bottom-40 left-10 w-40 h-40 bg-[#FFC857]/10 rounded-full blur-3xl"
      />

      {/* 返回按钮 */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => router.back()}
        className="absolute left-6 top-6 z-10"
      >
        <ArrowLeft className="w-6 h-6 text-[#5D4037]" strokeWidth={2} />
      </motion.button>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 mt-8 relative z-10"
      >
        <div className="inline-block mb-4">
          <div className="w-20 h-20 bg-gradient-to-br from-[#FFC857] to-[#FFB347] rounded-full flex items-center justify-center shadow-lg">
            <span className="text-3xl">✨</span>
          </div>
        </div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
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
        className="flex-1 flex flex-col max-w-md mx-auto w-full relative z-10"
      >
        <div className="space-y-5 mb-8">
          {/* Email 输入框 */}
          <div className="relative">
            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40 z-10" />
            <input
              type="email"
              placeholder="邮箱地址"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40"
              required
            />
          </div>

          {/* Password 输入框 */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40 z-10" />
            <input
              type="password"
              placeholder="密码"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40"
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
            <button
              type="button"
              onClick={() => router.push('/auth/forgot-password')}
              className="text-[#FFC857] font-medium hover:underline"
            >
              忘记密码？
            </button>
          </p>
          <p className="text-sm text-[#5D4037]/60">
            还没有账号？
            <button
              type="button"
              onClick={() => router.push('/signup')}
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
