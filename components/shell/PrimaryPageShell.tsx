'use client';

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import PrimaryPageHeader from '@/components/shell/PrimaryPageHeader';
import SecondaryPageHeader from '@/components/shell/SecondaryPageHeader';
import { joinShellClassNames } from '@/components/shell/classnames';
import { usePageCenterRuntime } from '@/lib/page-center/runtime-context';

type PrimaryPageShellBaseProps = {
  children: ReactNode;
  title: ReactNode;
  badge?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
};

type PrimaryPageShellProps<TContent extends ElementType> = PrimaryPageShellBaseProps & {
  contentAs?: TContent;
  contentProps?: Omit<ComponentPropsWithoutRef<TContent>, 'children' | 'className'>;
};

export default function PrimaryPageShell<TContent extends ElementType = 'div'>({
  children,
  title,
  badge,
  className = '',
  headerClassName = '',
  contentClassName = '',
  contentAs,
  contentProps,
}: PrimaryPageShellProps<TContent>) {
  const ContentComponent = (contentAs || 'div') as ElementType;
  const { isPreviewMode, managedPage } = usePageCenterRuntime();
  const shouldUseSecondaryHeader = isPreviewMode || managedPage?.publishState === 'beta';
  const secondaryHeaderRightContent = badge ? (
    <div className="inline-flex shrink-0 items-center rounded-full bg-[#FFC857]/24 px-[10px] py-[5px] text-[10px] font-bold leading-none text-[#8D6E63] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
      {badge}
    </div>
  ) : null;

  return (
    <div className={joinShellClassNames('flex h-full min-h-0 w-full flex-col bg-[#FFFBF0]', className)}>
      {shouldUseSecondaryHeader ? (
        <SecondaryPageHeader
          title={title}
          align="left"
          rightContent={secondaryHeaderRightContent}
          className={headerClassName}
        />
      ) : (
        <PrimaryPageHeader title={title} badge={badge} className={headerClassName} />
      )}
      <ContentComponent
        {...(contentProps || {})}
        className={joinShellClassNames('flex min-h-0 flex-1 flex-col', contentClassName)}
      >
        {children}
      </ContentComponent>
    </div>
  );
}
