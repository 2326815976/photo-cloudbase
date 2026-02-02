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
    <div className={`fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 ${bgColors[type]} text-[#5D4037] px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 z-50 animate-in slide-in-from-bottom-4 duration-300`}>
      <span className="text-sm font-medium">{message}</span>
      <button onClick={onClose} className="p-1 hover:bg-black/10 rounded-full transition-colors">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
