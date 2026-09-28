'use client';

import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export const MINI_PROGRAM_RECONNECT_COPY = {
  title: '拾光中...',
  description: '重连服务器中，请等待',
} as const;

export const PAGE_LOADING_COPY = {
  title: '拾光中...',
  description: '正在加载页面',
} as const;

type MiniProgramRecoveryScreenProps = {
  title?: string;
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
  const resolvedTitle = String(title || PAGE_LOADING_COPY.title).trim() || PAGE_LOADING_COPY.title;

  return (
    <div
      className={joinClassNames(
        'flex w-full flex-col items-center justify-center bg-[#FFFBF0]',
        className || 'h-screen'
      )}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className={joinClassNames('flex flex-col items-center gap-6', contentClassName)}
      >
        <div className="relative h-24 w-24" aria-hidden="true">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            className="h-24 w-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
          />
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            {icon || <Sparkles className="w-8 h-8 text-[#FFC857]" />}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center"
        >
          <p
            className="text-lg font-medium text-[#5D4037] mb-2"
            style={{ fontFamily: "'ZQKNNY', cursive" }}
          >
            {resolvedTitle}
          </p>
          <p className="text-sm text-[#5D4037]/60">{description}</p>
        </motion.div>
      </motion.div>
    </div>
  );
}
