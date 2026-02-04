'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 注册页面重定向
 * 此页面已废弃，所有注册请求将重定向到 /register
 * 保留此文件以兼容旧链接和书签
 */
export default function SignupRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // 立即重定向到主注册页面
    router.replace('/register');
  }, [router]);

  // 显示简单的加载提示
  return (
    <div className="min-h-screen bg-[#FFFBF0] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-[#5D4037]/60">正在跳转到注册页面...</p>
      </div>
    </div>
  );
}
