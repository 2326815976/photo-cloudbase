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
  const [stage, setStage] = useState<'envelope' | 'opening' | 'letter'>('envelope');

  const handleSealClick = () => {
    setStage('opening');
    setTimeout(() => {
      setStage('letter');
    }, 800);
  };

  const handleClose = () => {
    setStage('envelope');
    onClose();
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
                className="relative w-[320px] h-[200px]"
              >
                {/* 信封主体 */}
                <div className="absolute inset-0 bg-[#fdf6e3] rounded-lg shadow-2xl border-2 border-[#5D4037]/20">
                  {/* 信封封口 */}
                  <div className="absolute top-0 left-0 right-0 h-24 bg-[#f5e6d3] rounded-t-lg border-b-2 border-[#5D4037]/10" />

                  {/* 信封三角形封口装饰 */}
                  <div
                    className="absolute top-0 left-1/2 -translate-x-1/2 w-0 h-0"
                    style={{
                      borderLeft: '160px solid transparent',
                      borderRight: '160px solid transparent',
                      borderTop: '80px solid #e8d5b7',
                    }}
                  />
                </div>

                {/* 火漆印 */}
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleSealClick}
                  className="absolute top-16 left-1/2 -translate-x-1/2 w-16 h-16 rounded-full bg-[#c41e3a] shadow-lg flex items-center justify-center cursor-pointer z-10"
                >
                  <div className="text-[#fdf6e3] text-2xl font-serif">✨</div>
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

            {stage === 'letter' && (
              <motion.div
                key="letter"
                initial={{ y: 100, opacity: 0, scale: 0.9 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
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
