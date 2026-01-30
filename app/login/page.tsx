'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, Lock } from 'lucide-react';

// 测试账号
const TEST_ACCOUNT = {
  email: 'demo@shiguangyao.com',
  password: 'demo123456'
};

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: TEST_ACCOUNT.email, password: TEST_ACCOUNT.password });
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      // 登录成功，设置登录状态
      localStorage.setItem('isLoggedIn', 'true');
      router.push('/profile');
    }, 800);
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20 relative overflow-hidden">
      {/* 装饰性背景元素 */}
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-20 right-10 w-32 h-32 bg-[#FFC857]/10 rounded-full blur-3xl"
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.3, 0.5, 0.3]
        }}
        transition={{
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
          className="text-center mt-8"
        >
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
