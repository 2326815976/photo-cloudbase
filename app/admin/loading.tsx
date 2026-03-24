'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

const LOADING_TITLE = '\u7ba1\u7406\u53f0\u51c6\u5907\u4e2d...';
const LOADING_DESC = '\u6b63\u5728\u8f7d\u5165\u6570\u636e\u4e0e\u914d\u7f6e\uff0c\u8bf7\u7a0d\u5019';

export default function AdminLoading() {
  return (
    <div className="flex min-h-[calc(100vh-7rem)] items-center justify-center py-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35 }}
        className="relative w-full max-w-md overflow-hidden rounded-[32px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,240,0.92)_100%)] p-8 shadow-[0_18px_42px_rgba(93,64,55,0.14)] backdrop-blur-sm"
      >
        <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#FFC857] via-[#FFB347] to-[#FFD67E]" />
        <div className="flex flex-col items-center gap-6 text-center">
          <div className="relative h-24 w-24">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-0 rounded-full border-[5px] border-[#FFC857]/30 border-t-[#FFC857]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
              className="absolute inset-[12px] rounded-full border-[5px] border-[#5D4037]/18 border-b-[#5D4037]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFFBF0] shadow-[0_6px_18px_rgba(93,64,55,0.08)]">
                <Sparkles className="h-6 w-6 text-[#FFC857]" />
              </div>
            </div>
          </div>

          <div>
            <p className="mb-2 text-[24px] font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              {LOADING_TITLE}
            </p>
            <p className="text-sm leading-6 text-[#5D4037]/62">{LOADING_DESC}</p>
          </div>

          <div className="h-2 w-full overflow-hidden rounded-full bg-[#5D4037]/8">
            <motion.div
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
              className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#FFC857] via-[#FFB347] to-[#FFD67E]"
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
