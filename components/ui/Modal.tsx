'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { ReactNode, useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { isAndroidApp } from '@/lib/platform';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}

export default function Modal({ isOpen, onClose, children, className }: ModalProps) {
  const [isAndroid, setIsAndroid] = useState(false);

  useEffect(() => {
    setIsAndroid(isAndroidApp());
  }, []);

  // Android: 使用纯 CSS 动画
  if (isAndroid) {
    return (
      <>
        {isOpen && (
          <>
            <div
              onClick={onClose}
              className="fixed inset-0 bg-black/50 z-40 animate-in fade-in duration-200"
            />
            <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
              <div
                className={cn(
                  'bg-card rounded-2xl border-2 border-border-light shadow-[0_20px_60px_rgba(93,64,55,0.25)]',
                  'max-w-lg w-full max-h-[90vh] overflow-y-auto',
                  'relative',
                  'animate-in fade-in zoom-in-95 slide-in-from-bottom-4 duration-300',
                  className
                )}
              >
                <button
                  onClick={onClose}
                  className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent/20 transition-colors"
                >
                  <X className="w-5 h-5 text-foreground" />
                </button>
                {children}
              </div>
            </div>
          </>
        )}
      </>
    );
  }

  // Web/iOS: 使用 Framer Motion
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-40"
          />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className={cn(
                'bg-card rounded-2xl border-2 border-border-light shadow-[0_20px_60px_rgba(93,64,55,0.25)]',
                'max-w-lg w-full max-h-[90vh] overflow-y-auto',
                'relative',
                className
              )}
            >
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-accent/20 transition-colors"
              >
                <X className="w-5 h-5 text-foreground" />
              </button>
              {children}
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
