'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, AlertTriangle, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function DeleteAccountPage() {
  const router = useRouter();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      const response = await fetch('/api/delete-account', {
        method: 'POST',
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '删除失败，请稍后重试');
        setIsDeleting(false);
        return;
      }

      // 删除成功，清除本地session
      const supabase = createClient();
      if (supabase) {
        await supabase.auth.signOut();
      }

      setShowSuccess(true);
      setTimeout(() => {
        router.push('/');
      }, 3000);
    } catch (err) {
      setError('系统错误，请稍后重试');
      setIsDeleting(false);
    }
  };

  if (showSuccess) {
    return (
      <div className="min-h-screen bg-[#FFFBF0] flex flex-col items-center justify-center px-4 sm:px-8 py-20">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full text-center"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: 'spring' }}
            className="w-20 h-20 sm:w-24 sm:h-24 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-6"
          >
            <CheckCircle className="w-10 h-10 sm:w-12 sm:h-12 text-[#FFC857]" />
          </motion.div>

          <h1 className="text-xl sm:text-2xl font-bold text-[#5D4037] mb-3" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            再见啦，小伙伴！👋
          </h1>

          <p className="text-sm text-[#5D4037]/70 mb-6">
            你的账户已经安全删除，所有数据都已清空。<br />
            期待未来某天能再次相遇~ ✨
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#FFFBF0] flex flex-col overflow-hidden">
      {/* 固定标题区域 */}
      <div className="flex-none px-4 sm:px-6 md:px-8 pt-8 sm:pt-12">
        <button
          onClick={() => router.back()}
          className="absolute left-4 sm:left-6 top-4 sm:top-6 w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
        </button>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12 mt-8"
        >
          <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            删除账户 🗑️
          </h1>
          <p className="text-sm text-[#5D4037]/60">这是一个需要慎重考虑的决定</p>
        </motion.div>
      </div>

      {/* 可滚动内容区域 */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-8 pb-24 sm:pb-32">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="max-w-md mx-auto w-full"
        >
          {/* 警告卡片 */}
          <div className="bg-white rounded-2xl p-4 sm:p-6 shadow-sm border border-[#5D4037]/10 mb-4 sm:mb-6">
            <div className="w-14 h-14 sm:w-16 sm:h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-3 sm:mb-4">
              <AlertTriangle className="w-7 h-7 sm:w-8 sm:h-8 text-red-500" />
            </div>

            <h3 className="text-base sm:text-lg font-bold text-[#5D4037] mb-3 sm:mb-4 text-center">
              ⚠️ 温馨提醒
            </h3>

            <div className="space-y-2 sm:space-y-3 text-xs sm:text-sm text-[#5D4037]/70 leading-relaxed">
              <p>
                亲爱的小伙伴，删除账户就像是把你的 <span className="font-bold text-[#FFC857]">拾光小秘密</span> 全部装进时光机，然后按下"永久消失"按钮 🚀
              </p>
              <p>
                这意味着：
              </p>
              <ul className="list-none space-y-1.5 sm:space-y-2 pl-3 sm:pl-4">
                <li>📸 所有珍藏的照片会消失不见</li>
                <li>📅 所有预约记录会烟消云散</li>
                <li>👤 你的账户信息会彻底清空</li>
                <li>⏰ 这个操作 <span className="font-bold text-red-500">无法撤销</span></li>
              </ul>
              <p className="pt-1 sm:pt-2">
                💡 如果只是想暂时休息一下，可以选择"退出登录"哦~ 这样你的数据仍然存在，随时欢迎你回来！✨
              </p>
            </div>
          </div>

          {/* 错误提示 */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-3 text-xs sm:text-sm text-red-600 text-center mb-4"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* 操作按钮 */}
          {!showConfirm ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowConfirm(true)}
              className="w-full h-14 sm:h-16 rounded-full bg-red-500 border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-white font-bold text-base sm:text-lg transition-all"
            >
              我已了解风险，继续删除
            </motion.button>
          ) : (
            <div className="space-y-3">
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-[#FFC857]/20 rounded-2xl p-3 sm:p-4 text-center mb-3 sm:mb-4"
              >
                <p className="text-xs sm:text-sm font-bold text-[#5D4037]">
                  🤔 真的要说再见了吗？
                </p>
              </motion.div>

              <div className="flex gap-2 sm:gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowConfirm(false)}
                  className="flex-1 px-3 sm:px-4 py-3 sm:py-4 rounded-full text-xs sm:text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors"
                >
                  再想想
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 px-3 sm:px-4 py-3 sm:py-4 rounded-full text-xs sm:text-sm font-medium bg-red-500 text-white shadow-md hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {isDeleting ? '删除中...' : '🗑️ 确认删除'}
                </motion.button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
