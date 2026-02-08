'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { X, Sparkles } from 'lucide-react';

interface LetterOpeningModalProps {
  isOpen: boolean;
  onClose: () => void;
  letterContent: string;
  recipientName?: string;
}

export default function LetterOpeningModal({ isOpen, onClose, letterContent, recipientName = '拾光者' }: LetterOpeningModalProps) {
  const [stage, setStage] = useState<'envelope' | 'opening' | 'letter' | 'closing'>('envelope');
  const shouldReduceMotion = useReducedMotion();
  const timeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const addTimeout = (handler: () => void, delay: number) => {
    const timeoutId = setTimeout(handler, delay);
    timeoutsRef.current.push(timeoutId);
  };

  useEffect(() => {
    return () => {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      timeoutsRef.current.forEach(clearTimeout);
      timeoutsRef.current = [];
      setStage('envelope');
    }
  }, [isOpen]);

  const handleSealClick = () => {
    setStage('opening');
    addTimeout(() => {
      setStage('letter');
    }, 800);
  };

  const handleClose = () => {
    setStage('closing');
    addTimeout(() => {
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
                animate={shouldReduceMotion ? { scale: 1, opacity: 1, y: 0 } : {
                  scale: 1,
                  opacity: 1,
                  y: [0, -8, 0]
                }}
                exit={{ scale: 1.2, opacity: 0 }}
                transition={shouldReduceMotion ? { duration: 0.2 } : {
                  y: {
                    repeat: Infinity,
                    duration: 3,
                    ease: "easeInOut"
                  }
                }}
                className="relative w-80 h-52 cursor-pointer group"
              >
                {/* 信封主体 - 手工棉纸质感 */}
                <div className="absolute inset-0 rounded-xl shadow-2xl group-hover:shadow-[0_24px_60px_-12px_rgba(93,64,55,0.35)] transition-all duration-300 overflow-hidden"
                  style={{
                    background: 'radial-gradient(ellipse at center, #fdfbf7 0%, #f9f6f0 50%, #f5f0e8 100%)'
                  }}
                >
                  {/* 内缝线装饰 */}
                  <div className="absolute inset-2 border-2 border-dashed border-[#e6d5b8] rounded-lg pointer-events-none" />

                  {/* 纸张纹理 */}
                  <div className="absolute inset-0 opacity-[0.08]" style={{
                    backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`
                  }} />

                  {/* 信封盖子 - 三角形折页 */}
                  <div className="absolute top-0 left-0 w-full h-32 z-10" style={{
                    background: 'linear-gradient(to bottom, #f7f1e3 0%, #f0e8d8 100%)',
                    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
                    boxShadow: '0 4px 12px rgba(93, 64, 55, 0.15)'
                  }} />

                  {/* 右上角邮票 */}
                  <div className="absolute top-4 right-4 w-12 h-14 bg-white border-4 border-dotted border-[#e0e0e0] shadow-sm flex items-center justify-center z-20 transform rotate-6">
                    <span className="text-2xl">📷</span>
                  </div>

                  {/* 邮戳装饰 */}
                  <div className="absolute top-6 right-20 w-8 h-8 rounded-full border-2 border-dashed border-[#d0d0d0]/40 z-20" />

                  {/* 底部文字区域 - 修复重叠 */}
                  <div className="absolute bottom-8 left-0 right-0 flex flex-col items-center gap-3 z-0">
                    <p className="text-xl text-[#5D4037] font-medium tracking-wide" style={{ fontFamily: "'Letter Font', cursive" }}>
                      To: {recipientName}
                    </p>
                    <div className="w-32 h-px bg-gradient-to-r from-transparent via-[#5D4037]/20 to-transparent" />
                  </div>

                  {/* 装饰贴纸 */}
                  <div className="absolute bottom-4 left-4 text-lg opacity-25 rotate-12">✨</div>
                </div>

                {/* 火漆印 - 果冻宝石感 */}
                <motion.div
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSealClick}
                  className="absolute top-[64px] left-1/2 -translate-x-1/2 w-14 h-14 z-20"
                >
                  <div
                    className="w-full h-full rounded-full bg-gradient-to-br from-[#ef5350] to-[#b71c1c] shadow-lg flex items-center justify-center border border-[#b71c1c]/50 transition-transform"
                    style={{
                      boxShadow: 'inset 0 2px 4px rgba(255, 255, 255, 0.4), 0 6px 16px rgba(183, 28, 28, 0.5)'
                    }}
                  >
                    <Sparkles className="text-white/90 w-6 h-6" />
                  </div>
                </motion.div>

                {/* 点击提示 - 底部独立 */}
                <motion.p
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: [0.5, 1, 0.5] }}
                  transition={shouldReduceMotion ? { duration: 0.2 } : { duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] text-[#8d6e63]/60 tracking-widest whitespace-nowrap"
                  style={{ fontFamily: "'Letter Font', cursive" }}
                >
                  轻触拆封开启回忆
                </motion.p>
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
                      fontFamily: "'Letter Font', cursive, sans-serif",
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
