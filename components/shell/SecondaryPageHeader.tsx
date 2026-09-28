'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { joinShellClassNames } from '@/components/shell/classnames';

type SecondaryPageHeaderAlign = 'center' | 'left';

type SecondaryPageHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  align?: SecondaryPageHeaderAlign;
  fallbackHref?: string;
  onBack?: () => void;
  rightContent?: ReactNode;
  className?: string;
};

export default function SecondaryPageHeader({
  title,
  subtitle,
  align = 'center',
  fallbackHref = '/profile',
  onBack,
  rightContent,
  className = '',
}: SecondaryPageHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (typeof onBack === 'function') {
      onBack();
      return;
    }

    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  };

  if (align === 'left') {
    return (
      <div
        className={joinShellClassNames(
          'flex-none border-b-2 border-dashed border-[#5D4037]/15 bg-[#FFFBF0]/95 shadow-[0_2px_12px_rgba(93,64,55,0.08)] backdrop-blur-md',
          className
        )}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={handleBack}
            className="icon-button action-icon-btn action-icon-btn--back"
            aria-label="返回"
          >
            <ArrowLeft className="h-5 w-5 text-[#5D4037]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1
              className="truncate text-2xl font-bold leading-none text-[#5D4037]"
              style={{ fontFamily: "'ZQKNNY', cursive" }}
            >
              {title}
            </h1>
            {subtitle ? <p className="mt-2 text-sm text-[#5D4037]/60">{subtitle}</p> : null}
          </div>
          {rightContent ? <div className="shrink-0">{rightContent}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={joinShellClassNames(
        'flex-none px-4 pt-8 pb-6 sm:px-6 md:px-8 sm:pt-12 sm:pb-8',
        className
      )}
    >
      <div className="relative">
        <button
          type="button"
          onClick={handleBack}
          className="icon-button action-icon-btn action-icon-btn--back absolute left-0 top-0"
          aria-label="返回"
        >
          <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
        </button>

        {rightContent ? <div className="absolute right-0 top-0">{rightContent}</div> : null}

        <div className="mx-auto flex max-w-md flex-col items-center text-center">
          <h1
            className="text-3xl font-bold text-[#5D4037]"
            style={{ fontFamily: "'ZQKNNY', cursive" }}
          >
            {title}
          </h1>
          {subtitle ? <p className="mt-2 text-sm text-[#5D4037]/60">{subtitle}</p> : null}
        </div>
      </div>
    </div>
  );
}
