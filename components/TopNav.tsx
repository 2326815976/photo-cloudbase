'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { ArrowLeftCircle } from 'lucide-react';

interface TopNavProps {
  title: string;
  showBack?: boolean;
  onBack?: () => void;
}

export default function TopNav({ title, showBack = false, onBack }: TopNavProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      router.back();
    }
  };

  return (
    <div className="flex-none h-[44px] flex items-center justify-center px-4 relative bg-[#FFFBF0]/80 backdrop-blur-sm">
      {showBack && (
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={handleBack}
          className="absolute left-4 top-1/2 -translate-y-1/2"
        >
          <ArrowLeftCircle className="w-7 h-7 text-[#FFC857]" strokeWidth={2} />
        </motion.button>
      )}

      <h1
        className="text-lg font-bold text-[#5D4037]"
        style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}
      >
        {title}
      </h1>
    </div>
  );
}
