import type { ReactNode } from 'react';

type PageTopHeaderProps = {
  title: ReactNode;
  badge?: ReactNode;
};

export default function PageTopHeader({ title, badge }: PageTopHeaderProps) {
  return (
    <div className="w-full px-4 pt-[11px] pb-[10px]">
      <div className="flex w-full items-center justify-between gap-3">
        <div className="min-w-0 flex-1 text-left">
          <h1 className="truncate text-xl font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            {title}
          </h1>
        </div>
        {badge ? (
          <div className="inline-flex shrink-0 items-center rounded-full bg-[#FFC857]/24 px-[10px] py-[5px] text-[10px] font-bold leading-none text-[#8D6E63] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
            {badge}
          </div>
        ) : null}
      </div>
    </div>
  );
}
