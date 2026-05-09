'use client';

import { useEffect, type Dispatch, type SetStateAction } from 'react';

export function useAutoDismissString(
  value: string,
  setValue: Dispatch<SetStateAction<string>>,
  delay: number = 2800
) {
  useEffect(() => {
    if (!value) {
      return;
    }

    const activeValue = value;
    const timer = window.setTimeout(() => {
      setValue((currentValue) => (currentValue === activeValue ? '' : currentValue));
    }, delay);

    return () => window.clearTimeout(timer);
  }, [delay, setValue, value]);
}
