'use client';

import { forwardRef, useMemo, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { usePageCenterRuntime } from '@/lib/page-center/runtime-context';
import { useWebPreviewMode } from '@/lib/page-center/use-preview-mode';

type PageShellBottomPaddingMode = 'scroll' | 'compact' | 'none';

interface PreviewAwareScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  previewPaddingClassName?: string;
  defaultPaddingClassName?: string;
  bottomPaddingMode?: PageShellBottomPaddingMode;
}

function resolvePageShellBottomPadding(mode: Exclude<PageShellBottomPaddingMode, 'none'>, spacingVisible: boolean) {
  if (mode === 'compact') {
    return spacingVisible
      ? 'calc(56px + env(safe-area-inset-bottom))'
      : 'max(8px, env(safe-area-inset-bottom))';
  }

  return spacingVisible
    ? 'calc(84px + env(safe-area-inset-bottom))'
    : 'max(16px, env(safe-area-inset-bottom))';
}

function usePageShellSpacingVisible() {
  const { isBottomNavVisible, isPreviewMode, shellRuntimeResolved } = usePageCenterRuntime();
  const previewModeFromQuery = useWebPreviewMode();
  const previewMode = isPreviewMode || previewModeFromQuery;

  return shellRuntimeResolved ? isBottomNavVisible : !previewMode;
}

export function usePageShellBottomStyle(mode: PageShellBottomPaddingMode = 'scroll') {
  const spacingVisible = usePageShellSpacingVisible();

  return useMemo<CSSProperties | undefined>(() => {
    if (mode === 'none') {
      return undefined;
    }

    return {
      paddingBottom: resolvePageShellBottomPadding(mode, spacingVisible),
    };
  }, [mode, spacingVisible]);
}

const PreviewAwareScrollArea = forwardRef<HTMLDivElement, PreviewAwareScrollAreaProps>(function PreviewAwareScrollArea({
  children,
  className = '',
  previewPaddingClassName = '',
  defaultPaddingClassName = '',
  bottomPaddingMode = 'scroll',
  style,
  ...rest
}: PreviewAwareScrollAreaProps, ref) {
  const spacingVisible = usePageShellSpacingVisible();
  const bottomPaddingStyle = usePageShellBottomStyle(bottomPaddingMode);
  const paddingClassName = spacingVisible ? defaultPaddingClassName : previewPaddingClassName;
  const mergedClassName = [className, paddingClassName].filter(Boolean).join(' ');
  const mergedStyle = {
    ...(bottomPaddingStyle || {}),
    ...(style || {}),
  };

  return (
    <div ref={ref} className={mergedClassName} style={mergedStyle} {...rest}>
      {children}
    </div>
  );
});

export default PreviewAwareScrollArea;
