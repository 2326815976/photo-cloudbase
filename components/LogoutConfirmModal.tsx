'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { LogOut } from 'lucide-react';

interface LogoutConfirmModalProps {
  isOpen: boolean;
  isLoading?: boolean;
  title?: string;
  description?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

export default function LogoutConfirmModal({
  isOpen,
  isLoading = false,
  title = '确认退出登录？',
  description = '退出后需要重新登录才能继续访问账户功能。',
  onClose,
  onConfirm,
}: LogoutConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => {
            if (!isLoading) {
              onClose();
            }
          }}
          className="fixed inset-0 bg-black/50 z-[120] flex items-center justify-center p-6"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <LogOut className="w-8 h-8 text-[#FFC857]" />
              </div>
              <h3 className="text-xl font-bold text-[#5D4037] mb-3">{title}</h3>
              <p className="text-sm text-[#5D4037]/70 leading-relaxed">{description}</p>
            </div>

            <div className="flex gap-3">
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={isLoading}
                onClick={onClose}
                className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors disabled:opacity-60"
              >
                再想想
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.95 }}
                disabled={isLoading}
                onClick={() => {
                  void onConfirm();
                }}
                className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#FFC857] text-[#5D4037] shadow-md hover:shadow-lg transition-all disabled:opacity-60"
              >
                {isLoading ? '退出中...' : '确认退出'}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
