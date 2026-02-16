'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeft, ShieldAlert, LockKeyhole } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      <button
        onClick={() => router.back()}
        className="absolute left-6 top-6 w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full mx-auto mt-14"
      >
        <div className="bg-white rounded-2xl p-6 border border-[#5D4037]/10 shadow-sm">
          <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mb-4 mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>

          <h1 className="text-2xl font-bold text-[#5D4037] text-center mb-3" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            邮箱找回已下线
          </h1>

          <p className="text-sm text-[#5D4037]/70 leading-relaxed text-center mb-5">
            当前版本已切换为手机号账号体系，不再支持邮箱重置密码。
          </p>

          <div className="rounded-xl bg-[#FFF7E8] border border-[#FFC857]/40 p-4 text-sm text-[#5D4037]/80 leading-relaxed">
            <p className="flex items-start gap-2">
              <LockKeyhole className="w-4 h-4 mt-0.5 text-[#8D6E63] flex-shrink-0" />
              <span>请先使用手机号登录，再到「个人中心 - 修改密码」完成密码更新。</span>
            </p>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={() => router.push('/login')}
              className="flex-1 h-11 rounded-full bg-[#FFC857] border-2 border-[#5D4037] text-[#5D4037] font-bold shadow-[3px_3px_0px_#5D4037] hover:shadow-[1px_1px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px] transition-all"
            >
              去登录
            </button>
            <button
              onClick={() => router.push('/register')}
              className="flex-1 h-11 rounded-full bg-white border-2 border-[#5D4037]/20 text-[#5D4037] font-semibold hover:bg-[#FFFBF0] transition-colors"
            >
              去注册
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
