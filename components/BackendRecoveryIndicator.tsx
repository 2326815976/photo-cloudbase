'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import MiniProgramRecoveryScreen, { MINI_PROGRAM_RECONNECT_COPY } from '@/components/MiniProgramRecoveryScreen';
import { useBackendRecoveryState } from '@/lib/hooks/useBackendRecoveryState';

export default function BackendRecoveryIndicator({ enabled = true }: { enabled?: boolean }) {
  const backendState = useBackendRecoveryState();
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    const handleMuteChange = (event: Event) => {
      const nextMuted = Boolean((event as CustomEvent<{ muted?: boolean }>).detail?.muted);
      setMuted(nextMuted);
    };

    window.addEventListener('backend-recovery-indicator', handleMuteChange as EventListener);

    return () => {
      window.removeEventListener('backend-recovery-indicator', handleMuteChange as EventListener);
    };
  }, []);

  return (
    <AnimatePresence>
      {enabled && !muted && backendState.backendReconnecting && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed inset-0 z-[1000] bg-[#FFFBF0]"
        >
          <MiniProgramRecoveryScreen
            title={MINI_PROGRAM_RECONNECT_COPY.title}
            description={MINI_PROGRAM_RECONNECT_COPY.description}
            className="h-[100dvh]"
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
