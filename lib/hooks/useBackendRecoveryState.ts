'use client';

import { useEffect, useState } from 'react';
import { getBackendRecoveryState, subscribeBackendRecovery } from '@/lib/backend-recovery';

export function useBackendRecoveryState() {
  const [backendState, setBackendState] = useState(getBackendRecoveryState);

  useEffect(() => {
    return subscribeBackendRecovery(setBackendState);
  }, []);

  return backendState;
}
