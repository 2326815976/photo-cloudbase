'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export default function Loading() {
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
          <p className="text-lg font-medium text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
            时光中...
          </p>
          <p className="text-sm text-[#5D4037]/60">
            正在加载您的专属空间
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
