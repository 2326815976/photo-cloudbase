'use client';

import MaintenanceButton from '../components/MaintenanceButton';

interface StatsClientProps {
  children: React.ReactNode;
}

export default function StatsClient({ children }: StatsClientProps) {
  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题和维护按钮 */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            数据统计 📊
          </h1>
          <p className="text-sm text-[#5D4037]/60">实时查看平台运营数据</p>
        </div>
        <MaintenanceButton />
      </div>

      {/* 统计内容 */}
      {children}
    </div>
  );
}
