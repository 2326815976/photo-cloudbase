import type { ReactNode } from 'react';
import PageTopHeader from '@/components/PageTopHeader';
import { joinShellClassNames } from '@/components/shell/classnames';

type PrimaryPageHeaderProps = {
  title: ReactNode;
  badge?: ReactNode;
  className?: string;
};

export default function PrimaryPageHeader({ title, badge, className = '' }: PrimaryPageHeaderProps) {
  return (
    <div
      className={joinShellClassNames(
        'flex-none border-b-2 border-dashed border-[#5D4037]/15 bg-[#FFFBF0]/95 shadow-[0_2px_12px_rgba(93,64,55,0.08)] backdrop-blur-md',
        className
      )}
    >
      <PageTopHeader title={title} badge={badge} />
    </div>
  );
}
