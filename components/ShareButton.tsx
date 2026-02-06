'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import { isAndroidApp } from '@/lib/platform';
import { vibrate } from '@/lib/android';
import Toast from '@/components/ui/Toast';

interface ShareButtonProps {
  photo: {
    id: string;
    preview_url: string;
  };
}

export default function ShareButton({ photo }: ShareButtonProps) {
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleShare = async () => {
    const shareData = {
      title: '拾光谣',
      text: '来自拾光谣的美好瞬间 ✨',
      url: window.location.href
    };

    // Android 原生分享
    if (isAndroidApp() && (window as any).AndroidShare) {
      vibrate(30); // 触觉反馈
      (window as any).AndroidShare.shareContent(shareData.text, photo.preview_url);
      return;
    }

    // Web Share API
    if (navigator.share) {
      try {
        vibrate(30); // 触觉反馈
        await navigator.share(shareData);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('分享失败:', err);
        }
      }
      return;
    }

    // 降级：复制链接（使用统一的剪贴板工具，兼容微信浏览器）
    const { setClipboardText } = await import('@/lib/android');
    const success = setClipboardText(window.location.href);
    vibrate(30); // 触觉反馈
    if (success) {
      setToast({ message: '链接已复制到剪贴板 ✨', type: 'success' });
    } else {
      setToast({ message: '复制失败，请重试', type: 'error' });
    }
  };

  return (
    <>
      <button
        onClick={handleShare}
        className="p-2 rounded-full hover:bg-gray-100 transition-colors"
        aria-label="分享"
      >
        <Share2 className="w-5 h-5 text-[#5D4037]" />
      </button>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </>
  );
}
