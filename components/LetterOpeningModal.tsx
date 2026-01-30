'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface LetterOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  letterContent: string;
}

export default function LetterOpeningModal({ isOpen, onClose, letterContent }: LetterOpeningModalProps) {
  const [stage, setStage] = useState<'envelope' | 'opening' | 'letter' | 'closing'>('envelope');

  const handleSealClick = () => {
    setStage('opening');
    setTimeout(() => {
      setStage('letter');
    }, 800);
  };

  const handleClose = () => {
    setStage('closing');
    setTimeout(() => {
      setStage('envelope');
      onClose();
    }, 600);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence mode="wait">
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && stage === 'letter') {
              handleClose();
            }
          }}
        >
          <AnimatePresence mode="wait">
            {stage === 'envelope' && (
              <motion.div
                key="envelope"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{
                  scale: 1,
                  opacity: 1,
                  y: [0, -10, 0]
                }}
                exit={{ scale: 1.2, opacity: 0 }}
                transition={{
                  y: {
                    repeat: Infinity,
                    duration: 3,
                    ease: "easeInOut"
                  }
                }}
                className="relative w-[360px] h-[280px]"
              >
                {/* 信封主体 */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#fdf8ed] to-[#fdf6e3] rounded-2xl shadow-[0_20px_60px_rgba(93,64,55,0.25)] hover:shadow-[0_24px_72px_rgba(93,64,55,0.35)] border border-[#5D4037]/15 transition-shadow duration-300">
                  {/* 信封纹理 */}
                  <div className="absolute inset-0 opacity-30 rounded-2xl" style={{
                    backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(93,64,55,0.02) 10px, rgba(93,64,55,0.02) 20px)`
                  }} />

                  {/* 信封封口盖 */}
                  <div className="absolute top-0 left-0 right-0 h-32 overflow-hidden rounded-t-2xl">
                    <div className="absolute inset-0 bg-gradient-to-b from-[#f5e6d3] to-[#f0ddc0]" />
                    {/* 封口三角形 */}
                    <svg className="absolute top-0 left-0 w-full h-full" viewBox="0 0 360 128" preserveAspectRatio="none">
                      <path d="M0,0 L180,95 L360,0 Z" fill="#e8d5b7" opacity="0.9" />
                      <path d="M0,0 L180,95 L360,0" stroke="#5D4037" strokeWidth="1" opacity="0.1" fill="none" />
                    </svg>
                  </div>

                  {/* 收件人手写字 */}
                  <div className="absolute bottom-16 left-8 right-8 text-center">
                    <p className="text-[#5D4037] text-base mb-2 font-medium" style={{ fontFamily: "'Ma Shan Zheng', cursive" }}>
                      To: 名称
                    </p>
                    <div className="w-full h-px bg-[#5D4037]/10" />
                  </div>

                  {/* 邮票装饰 */}
                  <div className="absolute top-4 right-4 w-12 h-14 bg-white rounded-sm shadow-sm border-2 border-dashed border-[#5D4037]/20 flex items-center justify-center">
                    <span className="text-2xl">📷</span>
                  </div>

                  {/* 手账贴纸装饰 */}
                  <div className="absolute bottom-4 left-4 text-xl opacity-40 rotate-12">✨</div>
                  <div className="absolute top-24 left-5 text-lg opacity-30 -rotate-12">💌</div>
                </div>

                {/* 精致火漆印 */}
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSealClick}
                  className="absolute top-[68px] left-1/2 -translate-x-1/2 w-14 h-14 rounded-full cursor-pointer z-10 group"
                >
                  {/* 火漆印阴影 */}
                  <div className="absolute inset-0 rounded-full bg-[#c41e3a] blur-md opacity-50" />

                  {/* 火漆印主体 */}
                  <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#d32f2f] to-[#b71c1c] shadow-[0_4px_20px_rgba(183,28,28,0.4)] border-2 border-[#8b0000]/30 flex items-center justify-center">
                    {/* 火漆纹理 */}
                    <div className="absolute inset-2 rounded-full border border-[#ff6b6b]/30" />
                    <div className="absolute inset-3 rounded-full border border-[#ff6b6b]/20" />

                    {/* 中心图案 */}
                    <div className="relative text-[#fdf6e3] text-lg drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)] group-hover:scale-110 transition-transform">
                      ✨
                    </div>
                  </div>

                  {/* 点击提示 */}
                  <motion.div
                    animate={{ opacity: [0.5, 1, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -bottom-12 left-1/2 -translate-x-1/2 text-xs text-[#5D4037]/60 whitespace-nowrap"
                    style={{ fontFamily: "'Ma Shan Zheng', cursive" }}
                  >
                    点击拆开
                  </motion.div>
                </motion.button>
              </motion.div>
            )}

            {stage === 'opening' && (
              <motion.div
                key="opening"
                initial={{ scale: 1 }}
                animate={{ scale: 1.2, opacity: 0 }}
                transition={{ duration: 0.8 }}
                className="w-[320px] h-[200px] bg-[#fdf6e3] rounded-lg"
              />
            )}

            {(stage === 'letter' || stage === 'closing') && (
              <motion.div
                key="letter"
                initial={{ y: 100, opacity: 0, scale: 0.9 }}
                animate={stage === 'closing'
                  ? { y: 100, opacity: 0, scale: 0.8, rotate: -5 }
                  : { y: 0, opacity: 1, scale: 1 }
                }
                exit={{ y: -50, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="relative w-[90%] max-w-[500px] max-h-[80vh] bg-[#fffef9] rounded-2xl shadow-2xl overflow-hidden"
                style={{
                  backgroundImage: `repeating-linear-gradient(
                    transparent,
                    transparent 31px,
                    rgba(93, 64, 55, 0.1) 31px,
                    rgba(93, 64, 55, 0.1) 32px
                  )`,
                }}
              >
                {/* 关闭按钮 */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={handleClose}
                  className="absolute top-4 right-4 w-10 h-10 rounded-full bg-[#5D4037]/10 hover:bg-[#5D4037]/20 flex items-center justify-center transition-colors z-10"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </motion.button>

                {/* 信纸内容 */}
                <div className="p-8 pt-16 overflow-y-auto max-h-[80vh]">
                  <div
                    className="text-[#5D4037] leading-loose whitespace-pre-wrap"
                    style={{
                      fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive, sans-serif",
                      fontSize: '1.125rem',
                      lineHeight: '2rem'
                    }}
                  >
                    {letterContent}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
