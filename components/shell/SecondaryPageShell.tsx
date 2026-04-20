'use client';

import type { ComponentPropsWithoutRef, ElementType, ReactNode } from 'react';
import SecondaryPageHeader from '@/components/shell/SecondaryPageHeader';
import { joinShellClassNames } from '@/components/shell/classnames';

type SecondaryPageShellBaseProps = {
  children: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  align?: 'center' | 'left';
  fallbackHref?: string;
  onBack?: () => void;
  rightContent?: ReactNode;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
};

type SecondaryPageShellProps<TContent extends ElementType> = SecondaryPageShellBaseProps & {
  contentAs?: TContent;
  contentProps?: Omit<ComponentPropsWithoutRef<TContent>, 'children' | 'className'>;
};

export default function SecondaryPageShell<TContent extends ElementType = 'div'>({
  children,
  title,
  subtitle,
  align = 'center',
  fallbackHref = '/profile',
  onBack,
  rightContent,
  className = '',
  headerClassName = '',
  contentClassName = '',
  contentAs,
  contentProps,
}: SecondaryPageShellProps<TContent>) {
  const ContentComponent = (contentAs || 'div') as ElementType;

  return (
    <div className={joinShellClassNames('min-h-screen bg-[#FFFBF0] flex flex-col', className)}>
      <SecondaryPageHeader
        title={title}
        subtitle={subtitle}
        align={align}
        fallbackHref={fallbackHref}
        onBack={onBack}
        rightContent={rightContent}
        className={headerClassName}
      />
      <ContentComponent
        {...(contentProps || {})}
        className={joinShellClassNames('flex-1 min-h-0', contentClassName)}
      >
        {children}
      </ContentComponent>
    </div>
  );
}
