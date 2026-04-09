'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, type = 'info', onClose, duration = 3000 }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const bgColors = {
    success: 'bg-[#A0C4FF]',
    error: 'bg-[#FFADAD]',
    info: 'bg-[#FFC857]'
  };

  return (
    <div
      className={`fixed left-1/2 z-50 flex max-w-[calc(100vw-16px)] -translate-x-1/2 items-center gap-1.5 rounded-[20px] ${bgColors[type]} px-3 py-2 text-[#5D4037] shadow-lg animate-in slide-in-from-bottom-4 duration-300`}
      style={{ bottom: 'var(--app-shell-floating-offset, calc(68px + env(safe-area-inset-bottom)))' }}
    >
      <span className="max-w-[calc(100vw-64px)] whitespace-nowrap text-[13px] font-medium leading-none">{message}</span>
      <button onClick={onClose} className="icon-button flex h-5 w-5 items-center justify-center rounded-full transition-colors hover:bg-black/10">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
