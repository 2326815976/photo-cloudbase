import { createClient } from '@/lib/cloudbase/server';
import {
  Users, UserPlus, Activity, Image, Heart, MessageCircle,
  Calendar, CheckCircle, Clock, XCircle, Camera, Tags,
  FolderOpen, Eye, TrendingUp, Package
} from 'lucide-react';
import MaintenanceButton from '../components/MaintenanceButton';
import { formatDateDisplayUTC8 } from '@/lib/utils/date-helpers';

interface StatCardProps {
  title: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}

function StatCard({ title, value, icon: Icon, color, subtitle }: StatCardProps) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
      </div>
      <div>
        <p className="text-sm text-[#5D4037]/60 mb-1">{title}</p>
        <p className="text-3xl font-bold text-[#5D4037]">{value}</p>
        {subtitle && <p className="text-xs text-[#5D4037]/50 mt-1">{subtitle}</p>}
      </div>
    </div>
  );
}

export default async function StatsPage() {
  const dbClient = await createClient();

  // 调用新的统计 RPC 函数
  const { data: stats, error } = await dbClient.rpc('get_admin_dashboard_stats');

  if (error) {
    const errorMessage = typeof error.message === 'string' && error.message.trim() !== ''
      ? error.message
      : '未知错误';
    const errorCode = typeof error.code === 'string' && error.code.trim() !== ''
      ? ` (${error.code})`
      : '';
    console.warn(`获取统计数据失败${errorCode}: ${errorMessage}`);
    return (
      <div className="space-y-6 pt-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-600">获取统计数据失败，请稍后重试</p>
        </div>
      </div>
    );
  }

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

      {/* 用户统计 */}
      <section>
        <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
          <Users className="w-5 h-5" />
          用户统计
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总用户数"
            value={stats?.users?.total || 0}
            icon={Users}
            color="from-[#FFC857] to-[#FFB347]"
          />
          <StatCard
            title="普通用户"
            value={stats?.users?.regular_users || 0}
            icon={Users}
            color="from-[#FF9A3C] to-[#FF8C42]"
          />
          <StatCard
            title="今日新增"
            value={stats?.users?.new_today || 0}
            icon={UserPlus}
            color="from-[#FFB347] to-[#FFA500]"
          />
          <StatCard
            title="今日活跃"
            value={stats?.users?.active_today || 0}
            icon={Activity}
            color="from-[#FFA500] to-[#FF8C00]"
          />
        </div>
      </section>

      {/* 相册统计 */}
      <section>
        <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
          <FolderOpen className="w-5 h-5" />
          相册统计
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总相册数"
            value={stats?.albums?.total || 0}
            icon={FolderOpen}
            color="from-[#8B7355] to-[#6D5A4A]"
          />
          <StatCard
            title="有效空间"
            value={Math.max(0, Number(stats?.albums?.total || 0) - Number(stats?.albums?.expired || 0))}
            icon={FolderOpen}
            color="from-[#9C8063] to-[#8B7355]"
          />
          <StatCard
            title="今日新增"
            value={stats?.albums?.new_today || 0}
            icon={FolderOpen}
            color="from-[#A0826D] to-[#8B7355]"
          />
          <StatCard
            title="已过期"
            value={stats?.albums?.expired || 0}
            icon={Clock}
            color="from-[#B8956A] to-[#A0826D]"
          />
        </div>
      </section>

      {/* 照片统计 */}
      <section>
        <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
          <Image className="w-5 h-5" />
          照片统计
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总照片数"
            value={stats?.photos?.total || 0}
            icon={Image}
            color="from-[#7B68EE] to-[#6A5ACD]"
          />
          <StatCard
            title="今日新增"
            value={stats?.photos?.new_today || 0}
            icon={Image}
            color="from-[#9370DB] to-[#8A2BE2]"
          />
          <StatCard
            title="公开照片"
            value={stats?.photos?.public || 0}
            icon={Eye}
            color="from-[#BA55D3] to-[#9370DB]"
            subtitle="照片墙展示"
          />
          <StatCard
            title="私密照片"
            value={stats?.photos?.private || 0}
            icon={Image}
            color="from-[#DA70D6] to-[#BA55D3]"
            subtitle="专属空间"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <StatCard
            title="总浏览量"
            value={stats?.photos?.total_views || 0}
            icon={Eye}
            color="from-[#4169E1] to-[#1E90FF]"
          />
          <StatCard
            title="总点赞数"
            value={stats?.photos?.total_likes || 0}
            icon={Heart}
            color="from-[#FF69B4] to-[#FF1493]"
          />
          <StatCard
            title="总下载数"
            value={stats?.photos?.total_downloads || 0}
            icon={Package}
            color="from-[#4DB6AC] to-[#26A69A]"
          />
          <StatCard
            title="故事照片"
            value={stats?.photos?.with_story || 0}
            icon={MessageCircle}
            color="from-[#8D6E63] to-[#6D4C41]"
            subtitle={`高亮 ${stats?.photos?.highlighted || 0}`}
          />
        </div>
      </section>

      {/* 预约统计 */}
      <section>
        <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          预约统计
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总预约数"
            value={stats?.bookings?.total || 0}
            icon={Calendar}
            color="from-[#20B2AA] to-[#008B8B]"
          />
          <StatCard
            title="今日新增"
            value={stats?.bookings?.new_today || 0}
            icon={Calendar}
            color="from-[#48D1CC] to-[#20B2AA]"
          />
          <StatCard
            title="待处理"
            value={stats?.bookings?.pending || 0}
            icon={Clock}
            color="from-[#FFA500] to-[#FF8C00]"
          />
          <StatCard
            title="已确认"
            value={stats?.bookings?.confirmed || 0}
            icon={CheckCircle}
            color="from-[#32CD32] to-[#228B22]"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-4">
          <StatCard
            title="进行中"
            value={stats?.bookings?.in_progress || 0}
            icon={Activity}
            color="from-[#1E90FF] to-[#4169E1]"
          />
          <StatCard
            title="已完成"
            value={stats?.bookings?.finished || 0}
            icon={CheckCircle}
            color="from-[#00FA9A] to-[#00FF7F]"
          />
          <StatCard
            title="已取消"
            value={stats?.bookings?.cancelled || 0}
            icon={XCircle}
            color="from-[#DC143C] to-[#B22222]"
          />
        </div>

        {/* 预约类型分布 */}
        {stats?.bookings?.types && stats.bookings.types.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 mt-4">
            <h3 className="text-lg font-bold text-[#5D4037] mb-4">预约类型分布</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.bookings.types.map((type: any) => (
                <div key={type.type_name} className="flex items-center justify-between p-4 bg-[#FFFBF0] rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-[#5D4037]">{type.type_name}</p>
                    <p className="text-2xl font-bold text-[#FFC857] mt-1">{type.count}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 摆姿统计 */}
      <section>
        <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
          <Camera className="w-5 h-5" />
          摆姿统计
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="总摆姿数"
            value={stats?.poses?.total || 0}
            icon={Camera}
            color="from-[#FF6347] to-[#FF4500]"
          />
          <StatCard
            title="今日新增"
            value={stats?.poses?.new_today || 0}
            icon={Camera}
            color="from-[#FF7F50] to-[#FF6347]"
          />
          <StatCard
            title="总浏览量"
            value={stats?.poses?.total_views || 0}
            icon={Eye}
            color="from-[#FFA07A] to-[#FF7F50]"
          />
          <StatCard
            title="总标签数"
            value={stats?.poses?.total_tags || 0}
            icon={Tags}
            color="from-[#FFB6C1] to-[#FFA07A]"
          />
        </div>

        {/* 热门标签 */}
        {stats?.poses?.top_tags && stats.poses.top_tags.length > 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 mt-4">
            <h3 className="text-lg font-bold text-[#5D4037] mb-4">热门标签 Top 10</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.poses.top_tags.map((tag: any, index: number) => (
                <div key={tag.tag_name} className="flex items-center gap-2 p-3 bg-[#FFFBF0] rounded-xl">
                  <span className="text-lg font-bold text-[#FFC857]">#{index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[#5D4037] truncate">{tag.tag_name}</p>
                    <p className="text-xs text-[#5D4037]/60">{tag.usage_count} 次</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* 系统统计 */}
      <section>
        <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
          <Package className="w-5 h-5" />
          系统统计
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard
            title="允许预约城市"
            value={stats?.system?.total_cities || 0}
            icon={Package}
            color="from-[#4682B4] to-[#4169E1]"
          />
          <StatCard
            title="档期锁定"
            value={stats?.system?.total_blackout_dates || 0}
            icon={Clock}
            color="from-[#5F9EA0] to-[#4682B4]"
          />
          <StatCard
            title="版本发布"
            value={stats?.system?.total_releases || 0}
            icon={Package}
            color="from-[#6495ED] to-[#5F9EA0]"
          />
        </div>

        {/* 最新版本信息 */}
        {stats?.system?.latest_version && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 mt-4">
            <h3 className="text-lg font-bold text-[#5D4037] mb-4">最新版本</h3>
            <div className="flex items-center gap-4 p-4 bg-[#FFFBF0] rounded-xl">
              <Package className="w-8 h-8 text-[#FFC857]" />
              <div>
                <p className="text-sm text-[#5D4037]/60">版本号</p>
                <p className="text-xl font-bold text-[#5D4037]">
                  {typeof stats.system.latest_version === 'string'
                    ? stats.system.latest_version
                    : stats.system.latest_version.version}
                </p>
              </div>
              {typeof stats.system.latest_version !== 'string' && (
                <>
                  <div>
                    <p className="text-sm text-[#5D4037]/60">平台</p>
                    <p className="text-lg font-medium text-[#5D4037]">{stats.system.latest_version.platform}</p>
                  </div>
                  <div className="ml-auto">
                    <p className="text-sm text-[#5D4037]/60">发布时间</p>
                    <p className="text-sm text-[#5D4037]">
                      {formatDateDisplayUTC8(stats.system.latest_version.created_at)}
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 趋势数据 */}
      {stats?.trends && (
        <section>
          <h2 className="text-xl font-bold text-[#5D4037] mb-4 flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            最近7天趋势
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 新增用户趋势 */}
            {stats.trends.daily_new_users && stats.trends.daily_new_users.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10">
                <h3 className="text-lg font-bold text-[#5D4037] mb-4">新增用户</h3>
                <div className="space-y-2">
                  {stats.trends.daily_new_users.map((day: any) => (
                    <div key={day.date} className="flex items-center justify-between p-3 bg-[#FFFBF0] rounded-lg">
                      <span className="text-sm text-[#5D4037]/60">
                        {formatDateDisplayUTC8(day.date, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-lg font-bold text-[#FFC857]">{day.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 活跃用户趋势 */}
            {stats.trends.daily_active_users && stats.trends.daily_active_users.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10">
                <h3 className="text-lg font-bold text-[#5D4037] mb-4">活跃用户</h3>
                <div className="space-y-2">
                  {stats.trends.daily_active_users.map((day: any) => (
                    <div key={day.date} className="flex items-center justify-between p-3 bg-[#FFFBF0] rounded-lg">
                      <span className="text-sm text-[#5D4037]/60">
                        {formatDateDisplayUTC8(day.date, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-lg font-bold text-[#FFB347]">{day.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 新增预约趋势 */}
            {stats.trends.daily_new_bookings && stats.trends.daily_new_bookings.length > 0 && (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10">
                <h3 className="text-lg font-bold text-[#5D4037] mb-4">新增预约</h3>
                <div className="space-y-2">
                  {stats.trends.daily_new_bookings.map((day: any) => (
                    <div key={day.date} className="flex items-center justify-between p-3 bg-[#FFFBF0] rounded-lg">
                      <span className="text-sm text-[#5D4037]/60">
                        {formatDateDisplayUTC8(day.date, { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-lg font-bold text-[#20B2AA]">{day.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}


