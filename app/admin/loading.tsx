'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function AdminLoading() {
  return (
    <div className="min-h-[calc(100vh-8rem)] md:min-h-[calc(100vh-5rem)] flex items-center justify-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35 }}
        className="w-full max-w-md rounded-3xl border border-[#5D4037]/10 bg-white/90 backdrop-blur-sm p-8 shadow-[0_12px_32px_rgba(93,64,55,0.10)]"
      >
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 2.8, repeat: Infinity, ease: 'linear' }}
              className="w-20 h-20 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 1.9, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-2.5 rounded-full border-4 border-[#5D4037]/15 border-b-[#5D4037]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-7 h-7 text-[#FFC857]" />
            </div>
          </div>

          <div>
            <p className="text-xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              管理台准备中...
            </p>
            <p className="text-sm text-[#5D4037]/60">正在载入数据和配置，请稍候</p>
          </div>

          <div className="w-full h-2 rounded-full bg-[#5D4037]/8 overflow-hidden">
            <motion.div
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="h-full w-1/2 bg-gradient-to-r from-[#FFC857] to-[#FFB347]"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
