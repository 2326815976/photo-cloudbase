'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';
import { isAndroidApp } from '@/lib/platform';

interface DonationModalProps {
  isOpen: boolean;
  onClose: () => void;
  qrCodeUrl: string;
}

export default function DonationModal({ isOpen, onClose, qrCodeUrl }: DonationModalProps) {
  const [isAndroid, setIsAndroid] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    setIsAndroid(isAndroidApp());
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleDownload = async () => {
    try {
      // Android原生下载
      if (isAndroid && (window as any).AndroidPhotoDownload?.downloadPhoto) {
        (window as any).AndroidPhotoDownload.downloadPhoto(qrCodeUrl, '赞赏码.png');
        setToast({ message: '赞赏码保存成功 💝', type: 'success' });
        return;
      }

      // Web降级方案
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = '赞赏码.png';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setToast({ message: '赞赏码保存成功 💝', type: 'success' });
    } catch (error) {
      console.error('下载失败:', error);
      setToast({ message: '保存失败，请重试', type: 'error' });
    }
  };

  // Android: 使用简化的CSS动画
  if (isAndroid && isOpen) {
    return (
      <>
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-300"
        />

        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
          <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full pointer-events-auto overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
            {/* 便利贴胶带效果 */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#FFC857]/40 backdrop-blur-sm rounded-sm shadow-sm rotate-[-1deg] z-10" />

            {/* 关闭按钮 */}
            <button
              onClick={onClose}
              className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
            >
              <X className="action-icon-svg" />
            </button>

            {/* 内容区域 */}
            <div className="p-6 pt-8">
              <h3 className="text-2xl font-bold text-[#5D4037] mb-3 text-center" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                ✨ 留下一份心意？
              </h3>

              <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-6 text-center">
                如果这些照片让你感到满意，不妨留下一份小小的心意~ 💝
                你的支持就像 <span className="font-bold text-[#FFC857]">【魔法星尘】</span>，
                会让更多美好的瞬间被记录和分享！✨
              </p>

              {/* 赞赏码图片 */}
              <div className="relative mb-6">
                <div className="bg-gradient-to-br from-[#FFFBF0] to-[#FFF5E1] rounded-2xl p-4 shadow-inner">
                  <img
                    src={qrCodeUrl}
                    alt="赞赏码"
                    className="w-full h-auto rounded-xl shadow-md"
                  />
                </div>
              </div>

              {/* 保存按钮 */}
              <button
                onClick={handleDownload}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FFC857] px-5 text-[15px] font-semibold leading-none text-[#5D4037] shadow-[0_10px_24px_rgba(255,200,87,0.24)] hover:shadow-[0_12px_28px_rgba(255,200,87,0.3)] active:scale-[0.98] transition-all"
              >
                <Download className="w-5 h-5" />
                保存赞赏码
              </button>
            </div>
          </div>
        </div>

        {/* Toast 提示 */}
        {toast && (
          <div className="fixed bottom-6 right-6 z-[10000] animate-in slide-in-from-bottom-4 duration-300">
            <div className={`px-6 py-3 rounded-full shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-500 text-white'
                : 'bg-red-500 text-white'
            }`}>
              {toast.message}
            </div>
          </div>
        )}
      </>
    );
  }

  // Web/iOS: 使用Framer Motion动画
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", duration: 0.5 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div className="relative bg-white rounded-3xl shadow-2xl max-w-md w-full pointer-events-auto overflow-hidden">
              {/* 便利贴胶带效果 */}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-24 h-6 bg-[#FFC857]/40 backdrop-blur-sm rounded-sm shadow-sm rotate-[-1deg] z-10" />

              {/* 关闭按钮 */}
              <button
                onClick={onClose}
                className="icon-button action-icon-btn action-icon-btn--close absolute top-3 right-3 z-20"
              >
                <X className="action-icon-svg" />
              </button>

              {/* 内容区域 */}
              <div className="p-6 pt-8">
                <h3 className="text-2xl font-bold text-[#5D4037] mb-3 text-center" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  ✨ 留下一份心意？
                </h3>

                <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-6 text-center">
                  如果这些照片让你感到满意，不妨留下一份小小的心意~ 💝
                  你的支持就像 <span className="font-bold text-[#FFC857]">【魔法星尘】</span>，
                  会让更多美好的瞬间被记录和分享！✨
                </p>

                {/* 赞赏码图片 */}
                <div className="relative mb-6">
                  <div className="bg-gradient-to-br from-[#FFFBF0] to-[#FFF5E1] rounded-2xl p-4 shadow-inner">
                    <img
                      src={qrCodeUrl}
                      alt="赞赏码"
                      className="w-full h-auto rounded-xl shadow-md"
                    />
                  </div>
                </div>

                {/* 保存按钮 */}
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDownload}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FFC857] px-5 text-[15px] font-semibold leading-none text-[#5D4037] shadow-[0_10px_24px_rgba(255,200,87,0.24)] hover:shadow-[0_12px_28px_rgba(255,200,87,0.3)] active:scale-[0.98] transition-all"
                >
                  <Download className="w-5 h-5" />
                  保存赞赏码
                </motion.button>
              </div>
            </div>
          </motion.div>
        </>
      )}

      {/* Toast 提示 */}
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 50 }}
          className="fixed bottom-6 right-6 z-[10000]"
        >
          <div className={`px-6 py-3 rounded-full shadow-lg ${
            toast.type === 'success'
              ? 'bg-green-500 text-white'
              : 'bg-red-500 text-white'
          }`}>
            {toast.message}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
