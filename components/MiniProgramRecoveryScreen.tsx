'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export const MINI_PROGRAM_RECONNECT_COPY = {
  title: '拾光中...',
  description: '重连服务器中，请等待',
} as const;

type MiniProgramRecoveryScreenProps = {
  title: string;
  description: string;
  icon?: ReactNode;
  className?: string;
  contentClassName?: string;
};

function joinClassNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export default function MiniProgramRecoveryScreen({
  title,
  description,
  icon,
  className,
  contentClassName,
}: MiniProgramRecoveryScreenProps) {
  return (
    <div
      className={joinClassNames(
        'flex w-full flex-col items-center justify-center bg-[#FFFBF0]',
        className || 'h-screen'
      )}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut', delay: 0.2 }}
        className={joinClassNames('flex flex-col items-center gap-[9px]', contentClassName)}
      >
        <div className="relative h-24 w-24">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-0 rounded-full border-[5px] border-solid border-[#FFC857]/30 border-t-[#FFC857] box-border"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-3 rounded-full border-[5px] border-solid border-[#5D4037]/20 border-b-[#5D4037] box-border"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {icon || <Sparkles className="h-8 w-8 text-[#FFC857]" strokeWidth={2.25} />}
          </div>
        </div>

        <div className="text-center">
          <p className="mb-[3px] text-[16px] font-extrabold leading-none text-[#5D4037]">{title}</p>
          <p className="text-[12px] leading-[1.4] text-[#5D4037]/60">{description}</p>
        </div>
      </motion.div>
    </div>
  );
}
