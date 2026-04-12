'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, CheckCircle, Eye, EyeOff, Lock } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

const PASSWORD_ERROR_MAP: Record<string, string> = {
  'new password should be different from the old password': '新密码不能与当前密码相同',
  'password should be at least 6 characters': '密码长度至少为 6 位',
  'current password is required': '请输入当前密码',
  'current password is incorrect': '当前密码错误',
  'not authenticated': '请先登录后再试',
};

function resolvePasswordErrorMessage(message: string) {
  const normalized = String(message || '').trim().toLowerCase();
  return PASSWORD_ERROR_MAP[normalized] || String(message || '').trim() || '密码修改失败，请稍后重试';
}

export default function ChangePasswordPage() {
  const router = useRouter();
  const { title: managedTitle } = useManagedPageMeta('profile-change-password', '修改密码');
  const [formData, setFormData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/profile');
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      const dbClient = createClient();
      if (!dbClient) {
        setError('服务初始化失败，请刷新后重试');
        setIsLoading(false);
        return;
      }

      const {
        data: { user },
      } = await dbClient.auth.getUser();

      if (!user) {
        setError('请先登录');
        setIsLoading(false);
        router.push('/login');
        return;
      }

      const { error: updateError } = await dbClient.auth.updateUser({
        currentPassword: formData.currentPassword,
        password: formData.newPassword,
      });

      if (updateError) {
        setError(resolvePasswordErrorMessage(updateError.message));
        setIsLoading(false);
        return;
      }

      setShowSuccess(true);
      setIsLoading(false);
      window.setTimeout(() => {
        router.push('/login');
      }, 1800);
    } catch {
      setError('密码修改失败，请稍后重试');
      setIsLoading(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring' }}
            className="w-24 h-24 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="w-12 h-12 text-[#FFC857]" />
          </motion.div>

          <h1
            className="text-2xl font-bold text-[#5D4037] mb-3"
            style={{ fontFamily: "'ZQKNNY', cursive" }}
          >
            密码修改成功
          </h1>

          <p className="text-sm text-[#5D4037]/70">正在跳转到登录页，请重新登录...</p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      <button
        type="button"
        onClick={handleBack}
        className="icon-button action-icon-btn action-icon-btn--back absolute left-6 top-6"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 mt-8"
      >
        <h1
          className="text-3xl font-bold text-[#5D4037] mb-2"
          style={{ fontFamily: "'ZQKNNY', cursive" }}
        >
          {managedTitle}
        </h1>
        <p className="text-sm text-[#5D4037]/60">请输入当前密码和新密码</p>
      </motion.div>

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        onSubmit={handleSubmit}
        className="flex-1 flex flex-col max-w-md mx-auto w-full"
      >
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type={showCurrentPassword ? 'text' : 'password'}
              placeholder="当前密码"
              value={formData.currentPassword}
              onChange={(event) =>
                setFormData((current) => ({ ...current, currentPassword: event.target.value }))
              }
              className="w-full h-14 pl-12 pr-12 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowCurrentPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5D4037]/40 hover:text-[#5D4037] transition-colors"
            >
              {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type={showNewPassword ? 'text' : 'password'}
              placeholder="新密码（至少 6 位）"
              value={formData.newPassword}
              onChange={(event) =>
                setFormData((current) => ({ ...current, newPassword: event.target.value }))
              }
              className="w-full h-14 pl-12 pr-12 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5D4037]/40 hover:text-[#5D4037] transition-colors"
            >
              {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type={showConfirmPassword ? 'text' : 'password'}
              placeholder="确认新密码"
              value={formData.confirmPassword}
              onChange={(event) =>
                setFormData((current) => ({ ...current, confirmPassword: event.target.value }))
              }
              className="w-full h-14 pl-12 pr-12 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((current) => !current)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5D4037]/40 hover:text-[#5D4037] transition-colors"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center"
              >
                {error}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <motion.button
          type="submit"
          disabled={isLoading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full h-16 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-[#5D4037] font-bold text-lg disabled:opacity-50 transition-all"
        >
          {isLoading ? '修改中...' : '确认修改'}
        </motion.button>
      </motion.form>
    </div>
  );
}
