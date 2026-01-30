'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Calendar, Lock, LogOut } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

export default function ProfilePage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient();
      if (!supabase) {
        setIsLoading(false);
        return;
      }

      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        setIsLoggedIn(true);
        setUserEmail(session.user.email || '');
        setUserName(session.user.user_metadata?.name || session.user.email?.split('@')[0] || '用户');
      }

      setIsLoading(false);
    };

    checkAuth();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#FFFBF0]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex flex-col h-full w-full">
        {/* 手账风页头 */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
        >
          <div className="px-4 py-3 flex items-center justify-between gap-2">
            <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>我的小天地</h1>
            <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
              <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">📒 管理你的拾光小秘密 📒</p>
            </div>
          </div>
        </motion.div>

        {/* 未登录态 */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="text-center"
          >
            <Lock className="w-20 h-20 text-[#FFC857] mx-auto mb-6" strokeWidth={1.5} />
            <h2 className="text-lg font-bold text-[#5D4037] mb-2">开启你的专属空间 ✨</h2>
            <p className="text-[#5D4037]/60 mb-8 text-sm">登录后解锁更多功能</p>

            <div className="flex flex-col gap-3 w-full max-w-xs">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/login')}
                className="w-full h-12 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px] text-[#5D4037] font-bold transition-all"
              >
                立即登录
              </motion.button>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/signup')}
                className="w-full h-12 rounded-full bg-transparent border-2 border-[#5D4037]/30 text-[#5D4037]/70 font-medium hover:border-[#5D4037]/50 transition-colors"
              >
                注册账号
              </motion.button>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>我的小天地</h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">📒 管理你的拾光小秘密 📒</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20">
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
              <p className="text-xs text-[#5D4037]/50">{userEmail}</p>
            </div>
          </div>
        </motion.div>

        {/* 功能菜单 */}
        <div className="space-y-3">
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
            whileTap={{ scale: 0.98 }}
            whileHover={{ x: 4 }}
            className="w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-[#FFC857]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-[#5D4037]">我的预约记录</h3>
              <p className="text-xs text-[#5D4037]/50">查看所有约拍记录</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
            whileTap={{ scale: 0.98 }}
            whileHover={{ x: 4 }}
            className="w-full bg-white rounded-2xl p-4 shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 flex items-center gap-3 text-left transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center">
              <Lock className="w-5 h-5 text-[#FFC857]" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-[#5D4037]">修改密码</h3>
              <p className="text-xs text-[#5D4037]/50">更新账户安全信息</p>
            </div>
          </motion.button>

          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            whileTap={{ scale: 0.98 }}
            whileHover={{ x: 4 }}
            onClick={async () => {
              const supabase = createClient();
              if (supabase) {
                await supabase.auth.signOut();
              }
              setIsLoggedIn(false);
              router.push('/login');
            }}
            className="w-full bg-white rounded-2xl p-4 shadow-sm border border-[#5D4037]/10 flex items-center gap-3 text-left hover:shadow-md hover:border-red-500/30 transition-all"
          >
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-red-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium text-red-600">退出登录</h3>
              <p className="text-xs text-[#5D4037]/50">安全退出当前账户</p>
            </div>
          </motion.button>
        </div>
      </div>
    </div>
  );
}
