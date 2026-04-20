'use client';

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import PrimaryPageHeader from '@/components/shell/PrimaryPageHeader';
import { joinShellClassNames } from '@/components/shell/classnames';

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

  return (
    <div className={joinShellClassNames('min-h-[100dvh] bg-[#FFFBF0] flex flex-col', className)}>
      <PrimaryPageHeader title={title} badge={badge} className={headerClassName} />
      <ContentComponent
        {...(contentProps || {})}
        className={joinShellClassNames('flex-1 min-h-0', contentClassName)}
      >
        {children}
      </ContentComponent>
    </div>
  );
}
