'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import {
  getBackendRecoveryState,
  installBackendRecoveryFetch,
  subscribeBackendRecovery,
} from '@/lib/backend-recovery';

type ToastState = {
  type: 'success';
  message: string;
} | null;

export default function BackendRecoveryIndicator() {
  const [backendState, setBackendState] = useState(getBackendRecoveryState);
  const [toast, setToast] = useState<ToastState>(null);
  const [muted, setMuted] = useState(false);
  const previousReconnectingRef = useRef(backendState.backendReconnecting);

  useEffect(() => {
    const restore = installBackendRecoveryFetch();
    const unsubscribe = subscribeBackendRecovery(setBackendState);
    const handleMuteChange = (event: Event) => {
      const nextMuted = Boolean((event as CustomEvent<{ muted?: boolean }>).detail?.muted);
      setMuted(nextMuted);
    };

    window.addEventListener('backend-recovery-indicator', handleMuteChange as EventListener);

    return () => {
      window.removeEventListener('backend-recovery-indicator', handleMuteChange as EventListener);
      unsubscribe();
      restore();
    };
  }, []);

  useEffect(() => {
    const wasReconnecting = previousReconnectingRef.current;
    const isRecovered = wasReconnecting && !backendState.backendReconnecting && backendState.backendReady;

    if (isRecovered) {
      setToast({
        type: 'success',
        message: '服务器已恢复，已自动继续请求',
      });
    }

    previousReconnectingRef.current = backendState.backendReconnecting;
  }, [backendState.backendReady, backendState.backendReconnecting]);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 2500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [toast]);

  return (
    <>
      <AnimatePresence>
        {!muted && backendState.backendReconnecting && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-4 z-[1000] w-[calc(100%-32px)] max-w-md -translate-x-1/2"
          >
            <div className="rounded-2xl border border-[#5D4037]/10 bg-[#FFFBF0]/95 px-4 py-3 shadow-[0_12px_24px_rgba(93,64,55,0.16)] backdrop-blur-md">
              <div className="flex items-center gap-3 text-[#5D4037]">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFC857]/20">
                  <RefreshCw className="h-5 w-5 animate-spin text-[#FFC857]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                    拾光中...
                  </p>
                  <p className="text-xs text-[#5D4037]/70">重连服务器中，请等待</p>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!muted && toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-[calc(68px+env(safe-area-inset-bottom))] left-1/2 z-[1000] -translate-x-1/2"
          >
            <div className="rounded-xl bg-[#A0C4FF] px-4 py-3 text-sm font-medium text-[#5D4037] shadow-lg">
              {toast.message}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
