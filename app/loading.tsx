'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { usePathname } from 'next/navigation';

function getLoadingMessage(pathname: string) {
  if (pathname.startsWith('/admin/stats')) return '正在加载数据统计';
  if (pathname.startsWith('/admin/poses')) return '正在加载摆姿管理';
  if (pathname.startsWith('/admin/schedule')) return '正在加载档期管理';
  if (pathname.startsWith('/admin/gallery')) return '正在加载照片墙管理';
  if (pathname.startsWith('/admin/albums')) return '正在加载返图空间管理';
  if (pathname.startsWith('/admin/bookings')) return '正在加载预约管理';
  if (pathname.startsWith('/admin/releases')) return '正在加载版本管理';
  if (pathname.startsWith('/admin')) return '正在加载管理后台';

  if (pathname.startsWith('/album/')) return '正在加载专属空间';
  if (pathname.startsWith('/album')) return '正在加载返图空间';
  if (pathname.startsWith('/gallery')) return '正在加载照片墙';
  if (pathname.startsWith('/booking')) return '正在加载约拍信息';

  if (pathname.startsWith('/profile/bookings')) return '正在加载预约记录';
  if (pathname.startsWith('/profile/edit')) return '正在加载个人资料';
  if (pathname.startsWith('/profile/change-password')) return '正在加载密码设置';
  if (pathname.startsWith('/profile/delete-account')) return '正在加载账号安全';
  if (pathname.startsWith('/profile')) return '正在加载我的页面';

  if (pathname.startsWith('/login')) return '正在加载登录页面';
  if (pathname.startsWith('/register') || pathname.startsWith('/signup')) return '正在加载注册页面';
  if (pathname === '/') return '正在加载首页内容';

  return '正在加载页面内容';
}

export default function Loading() {
  const pathname = usePathname() || '/';
  const loadingMessage = getLoadingMessage(pathname);

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="flex flex-col items-center gap-6"
      >
        {/* 时光中动画 */}
        <div className="relative">
          {/* 外圈旋转 */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
          />
          {/* 内圈反向旋转 */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
          />
          {/* 中心图标 */}
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-8 h-8 text-[#FFC857]" />
          </div>
        </div>

        {/* 加载文字 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p className="text-lg font-medium text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            时光中...
          </p>
          <p className="text-sm text-[#5D4037]/60">
            {loadingMessage}
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
