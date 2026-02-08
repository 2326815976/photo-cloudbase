'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Lock, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (formData.newPassword !== formData.confirmPassword) {
      setError('两次密码输入不一致');
      return;
    }

    if (formData.newPassword.length < 6) {
      setError('密码长度至少为 6 位');
      return;
    }

    if (formData.currentPassword === formData.newPassword) {
      setError('新密码不能与当前密码相同');
      return;
    }

    setIsLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setError('系统配置错误，请稍后重试');
        setIsLoading(false);
        return;
      }

      // 验证当前密码
      const { data: { user } } = await supabase.auth.getUser();
      if (!user?.email) {
        setError('未找到用户信息');
        setIsLoading(false);
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: formData.currentPassword,
      });

      if (signInError) {
        setError('当前密码错误');
        setIsLoading(false);
        return;
      }

      // 更新密码
      const { error: updateError } = await supabase.auth.updateUser({
        password: formData.newPassword
      });

      if (updateError) {
        const errorMessages: Record<string, string> = {
          'new password should be different from the old password': '新密码不能与旧密码相同',
          'password should be at least 6 characters': '密码长度至少为6位',
        };
        const errorMsg = errorMessages[updateError.message.toLowerCase()] || updateError.message;
        setError(errorMsg);
        setIsLoading(false);
        return;
      }

      setShowSuccess(true);
      setTimeout(() => {
        router.push('/profile');
      }, 2000);
    } catch (err) {
      setError('密码修改失败，请稍后重试');
      setIsLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-24 h-24 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="w-12 h-12 text-[#FFC857]" />
          </motion.div>

          <h1 className="text-2xl font-bold text-[#5D4037] mb-3" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            密码修改成功！✨
          </h1>

          <p className="text-sm text-[#5D4037]/70 mb-6">
            正在返回个人中心...
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      <button
        onClick={() => router.back()}
        className="absolute left-6 top-6 w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 mt-8"
      >
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          修改密码 🔐
        </h1>
        <p className="text-sm text-[#5D4037]/60">请输入当前密码和新密码</p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col max-w-md mx-auto w-full"
      >
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="password"
              placeholder="当前密码"
              value={formData.currentPassword}
              onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="password"
              placeholder="新密码（至少6位）"
              value={formData.newPassword}
              onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="password"
              placeholder="确认新密码"
              value={formData.confirmPassword}
              onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
          </div>

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

        <motion.button
          type="submit"
          disabled={isLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full h-16 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-[#5D4037] font-bold text-lg disabled:opacity-50 transition-all"
        >
          {isLoading ? '修改中...' : '🔐 确认修改'}
        </motion.button>
      </motion.form>
    </div>
  );
}
