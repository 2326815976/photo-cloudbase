'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, ArrowLeft, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

export default function DeleteAccountPage() {
  const router = useRouter();
  const { title: managedTitle } = useManagedPageMeta('profile-delete-account', '删除账户');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [postDeleteWarning, setPostDeleteWarning] = useState('');

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/profile');
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch('/api/delete-account', {
        method: 'POST',
      });
      const data = await response.json();

      if (!response.ok) {
        setError(String(data?.error || '').trim() || '删除失败，请稍后重试');
        setIsDeleting(false);
        return;
      }

      setPostDeleteWarning(String(data?.warning || '').trim());

      const dbClient = createClient();
      if (dbClient) {
        await dbClient.auth.signOut();
      }

      setShowSuccess(true);
      setIsDeleting(false);
      window.setTimeout(() => {
        router.push('/');
      }, 2600);
    } catch {
      setError('系统错误，请稍后重试');
      setIsDeleting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-4 sm:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.15, type: 'spring' }}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-[#FFC857]" />
          </motion.div>

          <h1
            className="text-xl sm:text-2xl font-bold text-[#5D4037] mb-3"
            style={{ fontFamily: "'ZQKNNY', cursive" }}
          >
            账户已删除
          </h1>

          <p className="text-sm text-[#5D4037]/70 mb-6">
            你的账户与相关资料已清理完成，正在返回首页。
          </p>

          {postDeleteWarning ? (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              {postDeleteWarning}
            </p>
          ) : null}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col overflow-hidden">
      <div className="flex-none px-4 sm:px-6 md:px-8 pt-8 sm:pt-12">
        <button
          type="button"
          onClick={handleBack}
          className="icon-button action-icon-btn action-icon-btn--back absolute left-4 sm:left-6 top-4 sm:top-6"
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
          <p className="text-sm text-[#5D4037]/60">这是一个需要谨慎确认的操作</p>
        </motion.div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 pb-24 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="max-w-md mx-auto w-full"
        >
          <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#5D4037]/10 mb-4 sm:mb-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-[#5D4037] mb-3 sm:mb-4 text-center">
              温馨提醒
            </h3>

            <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-[#5D4037]/70 leading-relaxed">
              <p>
                删除账户后，与你账号绑定的个人资料和相关记录会被一并清理。
              </p>
              <ul className="list-none space-y-1.5 sm:space-y-2 pl-3 sm:pl-4">
                <li>账号将无法继续登录</li>
                <li>个人资料会被清空</li>
                <li>已保存的关联数据将不可恢复</li>
                <li>
                  该操作 <span className="font-bold text-red-500">无法撤销</span>
                </li>
              </ul>
              <p className="pt-1 sm:pt-2">
                如果你只是暂时离开，建议优先选择退出登录，而不是直接删除账户。
              </p>
            </div>
          </div>

          <AnimatePresence>
            {error ? (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-3 text-xs sm:text-sm text-red-600 text-center mb-4"
              >
                {error}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {!showConfirm ? (
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowConfirm(true)}
              className="w-[calc(100%+16px)] -mx-2 h-14 sm:h-16 rounded-full bg-red-500 border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-white font-bold text-base sm:text-lg transition-all"
            >
              我已了解风险，继续删除
            </motion.button>
          ) : (
            <div className="space-y-3">
              <motion.div
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#FFC857]/20 rounded-2xl p-3 sm:p-4 text-center mb-3 sm:mb-4"
              >
                <p className="text-xs sm:text-sm font-bold text-[#5D4037]">
                  确认继续删除当前账户吗？
                </p>
              </motion.div>

              <div className="flex gap-2 sm:gap-3">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-3 sm:px-4 py-3 sm:py-4 rounded-full text-xs sm:text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors"
                >
                  再想想
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-3 sm:px-4 py-3 sm:py-4 rounded-full text-xs sm:text-sm font-medium bg-red-500 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isDeleting ? '删除中...' : '确认删除'}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
