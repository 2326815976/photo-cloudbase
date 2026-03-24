import type { ElementType, ReactNode } from 'react';
import { createClient } from '@/lib/cloudbase/server';
import {
  Users,
  UserPlus,
  Activity,
  Image,
  Heart,
  MessageCircle,
  Calendar,
  CheckCircle,
  Clock,
  XCircle,
  Camera,
  Tags,
  FolderOpen,
  Eye,
  TrendingUp,
  Package,
} from 'lucide-react';
import MaintenanceButton from '../components/MaintenanceButton';
import { formatDateDisplayUTC8 } from '@/lib/utils/date-helpers';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: ElementType;
  color: string;
  subtitle?: string;
}

interface SectionHeadingProps {
  title: string;
  icon: ElementType;
  note?: string;
}

interface PanelProps {
  children: ReactNode;
  className?: string;
  accentClassName?: string;
}

function StatCard({ title, value, icon: Icon, color, subtitle }: StatCardProps) {
  return (
    <div className="group relative overflow-hidden rounded-[28px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,240,0.92)_100%)] p-5 shadow-[0_12px_28px_rgba(93,64,55,0.10)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_34px_rgba(93,64,55,0.14)]">
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${color}`} />
      <div className="mb-4 flex items-start justify-between gap-3 pt-1">
        <div className={`flex h-12 w-12 items-center justify-center rounded-[18px] bg-gradient-to-br ${color} shadow-[0_10px_20px_rgba(93,64,55,0.12)]`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        {subtitle ? (
          <span className="rounded-full bg-[#5D4037]/6 px-3 py-1 text-[11px] font-semibold leading-none text-[#8D6E63]">
            {subtitle}
          </span>
        ) : null}
      </div>
      <p className="text-sm font-medium text-[#8D6E63]">{title}</p>
      <p className="mt-2 text-[32px] font-bold leading-none text-[#5D4037]">{value}</p>
    </div>
  );
}

function SectionHeading({ title, icon: Icon, note }: SectionHeadingProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#FFC857]/18 text-[#5D4037]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-[22px] font-bold text-[#5D4037] md:text-2xl">{title}</h2>
          {note ? <p className="mt-1 text-sm text-[#8D6E63]">{note}</p> : null}
        </div>
      </div>
    </div>
  );
}

function Panel({ children, className = '', accentClassName = 'from-[#FFC857] via-[#FFB347] to-[#FFD67E]' }: PanelProps) {
  return (
    <div className={`relative overflow-hidden rounded-[28px] border border-[#5D4037]/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(255,251,240,0.92)_100%)] p-5 shadow-[0_12px_28px_rgba(93,64,55,0.10)] ${className}`}>
      <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${accentClassName}`} />
      <div className="pt-1">{children}</div>
    </div>
  );
}

function TrendPanel({
  title,
  rows,
  accentClassName,
  valueClassName,
}: {
  title: string;
  rows: any[];
  accentClassName: string;
  valueClassName: string;
}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return (
    <Panel accentClassName={accentClassName}>
      <h3 className="mb-4 text-lg font-bold text-[#5D4037]">{title}</h3>
      <div className="space-y-2">
        {rows.map((day) => (
          <div key={day.date} className="flex items-center justify-between rounded-2xl border border-[#5D4037]/6 bg-[#FFFBF0]/78 px-4 py-3">
            <span className="text-sm text-[#8D6E63]">{formatDateDisplayUTC8(day.date, { month: 'short', day: 'numeric' })}</span>
            <span className={`text-lg font-bold ${valueClassName}`}>{day.count}</span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export default async function StatsPage() {
  const dbClient = await createClient();
  const { data: stats, error } = await dbClient.rpc('get_admin_dashboard_stats');

  if (error) {
    const errorMessage = typeof error.message === 'string' && error.message.trim() !== '' ? error.message : '\u672a\u77e5\u9519\u8bef';
    const errorCode = typeof error.code === 'string' && error.code.trim() !== '' ? ` (${error.code})` : '';
    console.warn(`\u83b7\u53d6\u7edf\u8ba1\u6570\u636e\u5931\u8d25${errorCode}: ${errorMessage}`);
    return (
      <div className="space-y-6 pb-4 pt-2">
        <Panel accentClassName="from-[#F6B0A7] via-[#F59B8F] to-[#FFD0C9]" className="border-[#F3C7C0]/60 bg-[linear-gradient(180deg,rgba(255,250,249,0.98)_0%,rgba(255,244,242,0.94)_100%)]">
          <p className="text-sm leading-6 text-[#B65B4B]">{'\u83b7\u53d6\u7edf\u8ba1\u6570\u636e\u5931\u8d25\uff0c\u8bf7\u7a0d\u540e\u91cd\u8bd5'}</p>
        </Panel>
      </div>
    );
  }

  const userCards = [
    { title: '\u603b\u7528\u6237\u6570', value: stats?.users?.total || 0, icon: Users, color: 'from-[#FFC857] to-[#FFB347]' },
    { title: '\u666e\u901a\u7528\u6237', value: stats?.users?.regular_users || 0, icon: Users, color: 'from-[#FF9A3C] to-[#FF8C42]' },
    { title: '\u4eca\u65e5\u65b0\u589e', value: stats?.users?.new_today || 0, icon: UserPlus, color: 'from-[#FFB347] to-[#FFA500]' },
    { title: '\u4eca\u65e5\u6d3b\u8dc3', value: stats?.users?.active_today || 0, icon: Activity, color: 'from-[#FFA500] to-[#FF8C00]' },
  ];

  const albumCards = [
    { title: '\u603b\u76f8\u518c\u6570', value: stats?.albums?.total || 0, icon: FolderOpen, color: 'from-[#8B7355] to-[#6D5A4A]' },
    { title: '\u6709\u6548\u7a7a\u95f4', value: Math.max(0, Number(stats?.albums?.total || 0) - Number(stats?.albums?.expired || 0)), icon: FolderOpen, color: 'from-[#9C8063] to-[#8B7355]' },
    { title: '\u4eca\u65e5\u65b0\u589e', value: stats?.albums?.new_today || 0, icon: FolderOpen, color: 'from-[#A0826D] to-[#8B7355]' },
    { title: '\u5df2\u8fc7\u671f', value: stats?.albums?.expired || 0, icon: Clock, color: 'from-[#B8956A] to-[#A0826D]' },
  ];

  const photoCards = [
    { title: '\u603b\u7167\u7247\u6570', value: stats?.photos?.total || 0, icon: Image, color: 'from-[#7B68EE] to-[#6A5ACD]' },
    { title: '\u4eca\u65e5\u65b0\u589e', value: stats?.photos?.new_today || 0, icon: Image, color: 'from-[#9370DB] to-[#8A2BE2]' },
    { title: '\u516c\u5f00\u7167\u7247', value: stats?.photos?.public || 0, icon: Eye, color: 'from-[#BA55D3] to-[#9370DB]', subtitle: '\u7167\u7247\u5899\u5c55\u793a' },
    { title: '\u79c1\u5bc6\u7167\u7247', value: stats?.photos?.private || 0, icon: Image, color: 'from-[#DA70D6] to-[#BA55D3]', subtitle: '\u4e13\u5c5e\u7a7a\u95f4' },
    { title: '\u603b\u6d4f\u89c8\u91cf', value: stats?.photos?.total_views || 0, icon: Eye, color: 'from-[#4169E1] to-[#1E90FF]' },
    { title: '\u603b\u70b9\u8d5e\u6570', value: stats?.photos?.total_likes || 0, icon: Heart, color: 'from-[#FF69B4] to-[#FF1493]' },
    { title: '\u603b\u4e0b\u8f7d\u6570', value: stats?.photos?.total_downloads || 0, icon: Package, color: 'from-[#4DB6AC] to-[#26A69A]' },
    { title: '\u6545\u4e8b\u7167\u7247', value: stats?.photos?.with_story || 0, icon: MessageCircle, color: 'from-[#8D6E63] to-[#6D4C41]', subtitle: `\u9ad8\u4eae ${stats?.photos?.highlighted || 0}` },
  ];

  const bookingCards = [
    { title: '\u603b\u9884\u7ea6\u6570', value: stats?.bookings?.total || 0, icon: Calendar, color: 'from-[#20B2AA] to-[#008B8B]' },
    { title: '\u4eca\u65e5\u65b0\u589e', value: stats?.bookings?.new_today || 0, icon: Calendar, color: 'from-[#48D1CC] to-[#20B2AA]' },
    { title: '\u5f85\u5904\u7406', value: stats?.bookings?.pending || 0, icon: Clock, color: 'from-[#FFA500] to-[#FF8C00]' },
    { title: '\u5df2\u786e\u8ba4', value: stats?.bookings?.confirmed || 0, icon: CheckCircle, color: 'from-[#32CD32] to-[#228B22]' },
    { title: '\u8fdb\u884c\u4e2d', value: stats?.bookings?.in_progress || 0, icon: Activity, color: 'from-[#1E90FF] to-[#4169E1]' },
    { title: '\u5df2\u5b8c\u6210', value: stats?.bookings?.finished || 0, icon: CheckCircle, color: 'from-[#00FA9A] to-[#00FF7F]' },
    { title: '\u5df2\u53d6\u6d88', value: stats?.bookings?.cancelled || 0, icon: XCircle, color: 'from-[#DC143C] to-[#B22222]' },
  ];

  const poseCards = [
    { title: '\u603b\u6446\u59ff\u6570', value: stats?.poses?.total || 0, icon: Camera, color: 'from-[#FF6347] to-[#FF4500]' },
    { title: '\u4eca\u65e5\u65b0\u589e', value: stats?.poses?.new_today || 0, icon: Camera, color: 'from-[#FF7F50] to-[#FF6347]' },
    { title: '\u603b\u6d4f\u89c8\u91cf', value: stats?.poses?.total_views || 0, icon: Eye, color: 'from-[#FFA07A] to-[#FF7F50]' },
    { title: '\u603b\u6807\u7b7e\u6570', value: stats?.poses?.total_tags || 0, icon: Tags, color: 'from-[#FFB6C1] to-[#FFA07A]' },
  ];

  const systemCards = [
    { title: '\u5141\u8bb8\u9884\u7ea6\u57ce\u5e02', value: stats?.system?.total_cities || 0, icon: Package, color: 'from-[#4682B4] to-[#4169E1]' },
    { title: '\u6863\u671f\u9501\u5b9a', value: stats?.system?.total_blackout_dates || 0, icon: Clock, color: 'from-[#5F9EA0] to-[#4682B4]' },
    { title: '\u7248\u672c\u53d1\u5e03', value: stats?.system?.total_releases || 0, icon: Package, color: 'from-[#6495ED] to-[#5F9EA0]' },
  ];

  const bookingTypes = Array.isArray(stats?.bookings?.types) ? stats.bookings.types : [];
  const topTags = Array.isArray(stats?.poses?.top_tags) ? stats.poses.top_tags : [];
  const dailyNewUsers = Array.isArray(stats?.trends?.daily_new_users) ? stats.trends.daily_new_users : [];
  const dailyActiveUsers = Array.isArray(stats?.trends?.daily_active_users) ? stats.trends.daily_active_users : [];
  const dailyNewBookings = Array.isArray(stats?.trends?.daily_new_bookings) ? stats.trends.daily_new_bookings : [];
  const latestVersion = stats?.system?.latest_version;

  return (
    <div className="space-y-6 pb-4 pt-2 md:space-y-7">
      <Panel className="p-6 md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center rounded-full bg-[#FFC857]/16 px-3 py-1 text-[11px] font-semibold tracking-[0.16em] text-[#8D6E63]">{'\u540e\u53f0\u603b\u89c8'}</div>
            <h1 className="text-[34px] font-bold leading-none text-[#5D4037] md:text-[40px]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              {'\u6570\u636e\u7edf\u8ba1'} <span aria-hidden="true">??</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-[#8D6E63] md:text-[15px]">{'\u5b9e\u65f6\u67e5\u770b\u5e73\u53f0\u8fd0\u8425\u6570\u636e\u4e0e\u5173\u952e\u72b6\u6001\uff0c\u9996\u8f6e\u5bf9\u6807\u4f18\u5148\u7edf\u4e00\u4e3b\u5e72\u89c6\u89c9\u3001\u5361\u7247\u5c42\u6b21\u4e0e\u4fe1\u606f\u5206\u7ec4\u3002'}</p>
          </div>
          <MaintenanceButton />
        </div>
      </Panel>

      <section className="space-y-4">
        <SectionHeading title={'\u7528\u6237\u7edf\u8ba1'} icon={Users} note={'\u89c2\u5bdf\u65b0\u589e\u3001\u6d3b\u8dc3\u4e0e\u6574\u4f53\u7528\u6237\u89c4\u6a21'} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{userCards.map((item) => <StatCard key={item.title} {...item} />)}</div>
      </section>

      <section className="space-y-4">
        <SectionHeading title={'\u76f8\u518c\u7edf\u8ba1'} icon={FolderOpen} note={'\u7ba1\u7406\u4e13\u5c5e\u7a7a\u95f4\u7684\u6574\u4f53\u5b58\u91cf\u4e0e\u6709\u6548\u72b6\u6001'} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{albumCards.map((item) => <StatCard key={item.title} {...item} />)}</div>
      </section>

      <section className="space-y-4">
        <SectionHeading title={'\u7167\u7247\u7edf\u8ba1'} icon={Image} note={'\u5bf9\u9f50\u5c0f\u7a0b\u5e8f\u7684\u5361\u7247\u5316\u6570\u636e\u5448\u73b0\u65b9\u5f0f'} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{photoCards.map((item) => <StatCard key={item.title} {...item} />)}</div>
      </section>

      <section className="space-y-4">
        <SectionHeading title={'\u9884\u7ea6\u7edf\u8ba1'} icon={Calendar} note={'\u5feb\u901f\u67e5\u770b\u9884\u7ea6\u5168\u6d41\u8f6c\u72b6\u6001'} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{bookingCards.map((item) => <StatCard key={item.title} {...item} />)}</div>
        {bookingTypes.length > 0 ? (
          <Panel>
            <h3 className="mb-4 text-lg font-bold text-[#5D4037]">{'\u9884\u7ea6\u7c7b\u578b\u5206\u5e03'}</h3>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              {bookingTypes.map((item: any) => (
                <div key={item.type_name} className="rounded-[24px] border border-[#5D4037]/8 bg-[#FFFBF0]/78 px-4 py-4">
                  <p className="text-sm font-medium text-[#5D4037]">{item.type_name}</p>
                  <p className="mt-2 text-[30px] font-bold leading-none text-[#FFC857]">{item.count}</p>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionHeading title={'\u6446\u59ff\u7edf\u8ba1'} icon={Camera} note={'\u5c0f\u7a0b\u5e8f\u6458\u8981\u4fe1\u606f\u98ce\u683c\u7684 Web \u5f3a\u5316\u7248'} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">{poseCards.map((item) => <StatCard key={item.title} {...item} />)}</div>
        {topTags.length > 0 ? (
          <Panel>
            <h3 className="mb-4 text-lg font-bold text-[#5D4037]">{'\u70ed\u95e8\u6807\u7b7e Top 10'}</h3>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
              {topTags.map((tag: any, index: number) => (
                <div key={tag.tag_name} className="flex items-center gap-3 rounded-[22px] border border-[#5D4037]/8 bg-[#FFFBF0]/78 px-3 py-3">
                  <span className="text-lg font-bold text-[#FFC857]">#{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#5D4037]">{tag.tag_name}</p>
                    <p className="mt-1 text-xs text-[#8D6E63]">{tag.usage_count} {'\u6b21'}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        ) : null}
      </section>

      <section className="space-y-4">
        <SectionHeading title={'\u7cfb\u7edf\u7edf\u8ba1'} icon={Package} note={'\u57ce\u5e02\u3001\u6863\u671f\u4e0e\u7248\u672c\u4fe1\u606f\u4e00\u5c4f\u63a7\u89c8'} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{systemCards.map((item) => <StatCard key={item.title} {...item} />)}</div>
        {latestVersion ? (
          <Panel>
            <h3 className="mb-4 text-lg font-bold text-[#5D4037]">{'\u6700\u65b0\u7248\u672c'}</h3>
            <div className="flex flex-col gap-4 rounded-[24px] border border-[#5D4037]/8 bg-[#FFFBF0]/78 p-4 md:flex-row md:items-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-[20px] bg-[#FFC857]/18 text-[#5D4037]"><Package className="h-7 w-7 text-[#FFC857]" /></div>
              <div>
                <p className="text-sm text-[#8D6E63]">{'\u7248\u672c\u53f7'}</p>
                <p className="text-xl font-bold text-[#5D4037]">{typeof latestVersion === 'string' ? latestVersion : latestVersion.version}</p>
              </div>
              {typeof latestVersion !== 'string' ? (
                <>
                  <div>
                    <p className="text-sm text-[#8D6E63]">{'\u5e73\u53f0'}</p>
                    <p className="text-lg font-medium text-[#5D4037]">{latestVersion.platform}</p>
                  </div>
                  <div className="md:ml-auto">
                    <p className="text-sm text-[#8D6E63]">{'\u53d1\u5e03\u65f6\u95f4'}</p>
                    <p className="text-sm text-[#5D4037]">{formatDateDisplayUTC8(latestVersion.created_at)}</p>
                  </div>
                </>
              ) : null}
            </div>
          </Panel>
        ) : null}
      </section>

      {(dailyNewUsers.length > 0 || dailyActiveUsers.length > 0 || dailyNewBookings.length > 0) ? (
        <section className="space-y-4">
          <SectionHeading title={'\u6700\u8fd17\u5929\u8d8b\u52bf'} icon={TrendingUp} note={'\u8d70\u52bf\u5361\u7247\u5bf9\u9f50\u5c0f\u7a0b\u5e8f\u7684\u6e29\u6696\u7ec4\u7248'} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <TrendPanel title={'\u65b0\u589e\u7528\u6237'} rows={dailyNewUsers} accentClassName="from-[#FFC857] via-[#FFB347] to-[#FFD67E]" valueClassName="text-[#FFC857]" />
            <TrendPanel title={'\u6d3b\u8dc3\u7528\u6237'} rows={dailyActiveUsers} accentClassName="from-[#FFB347] via-[#FFA76C] to-[#FFD6A4]" valueClassName="text-[#FFB347]" />
            <TrendPanel title={'\u65b0\u589e\u9884\u7ea6'} rows={dailyNewBookings} accentClassName="from-[#48D1CC] via-[#20B2AA] to-[#8FEAE5]" valueClassName="text-[#20B2AA]" />
          </div>
        </section>
      ) : null}
    </div>
  );
}
