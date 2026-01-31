import { createClient } from '@/lib/supabase/server';
import { Users, UserPlus, Activity } from 'lucide-react';

export default async function StatsPage() {
  const supabase = await createClient();

  // 获取总用户数
  const { count: totalUsers } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true });

  // 获取今日新增用户数
  const today = new Date().toISOString().split('T')[0];
  const { data: todayStats } = await supabase
    .from('analytics_daily')
    .select('new_users_count, active_users_count')
    .eq('date', today)
    .single();

  // 获取本周数据
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const { data: weekStats } = await supabase
    .from('analytics_daily')
    .select('new_users_count, active_users_count')
    .gte('date', weekAgo.toISOString().split('T')[0]);

  // 获取本月数据
  const monthAgo = new Date();
  monthAgo.setDate(monthAgo.getDate() - 30);
  const { data: monthStats } = await supabase
    .from('analytics_daily')
    .select('new_users_count, active_users_count')
    .gte('date', monthAgo.toISOString().split('T')[0]);

  const weekNewUsers = weekStats?.reduce((sum, day) => sum + (day.new_users_count || 0), 0) || 0;
  const weekActiveUsers = weekStats?.reduce((sum, day) => sum + (day.active_users_count || 0), 0) || 0;
  const monthNewUsers = monthStats?.reduce((sum, day) => sum + (day.new_users_count || 0), 0) || 0;
  const monthActiveUsers = monthStats?.reduce((sum, day) => sum + (day.active_users_count || 0), 0) || 0;

  const stats = [
    {
      title: '总用户数',
      value: totalUsers || 0,
      icon: Users,
      color: 'from-[#FFC857] to-[#FFB347]',
    },
    {
      title: '今日新增',
      value: todayStats?.new_users_count || 0,
      icon: UserPlus,
      color: 'from-[#FF9A3C] to-[#FF8C42]',
    },
    {
      title: '今日活跃',
      value: todayStats?.active_users_count || 0,
      icon: Activity,
      color: 'from-[#FFB347] to-[#FFA500]',
    },
  ];

  const periodStats = [
    {
      period: '本周',
      newUsers: weekNewUsers,
      activeUsers: weekActiveUsers,
    },
    {
      period: '本月',
      newUsers: monthNewUsers,
      activeUsers: monthActiveUsers,
    },
  ];

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
          数据统计 📊
        </h1>
        <p className="text-sm text-[#5D4037]/60">实时查看平台运营数据</p>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div
              key={stat.title}
              className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-full bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-md`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
              <div>
                <p className="text-sm text-[#5D4037]/60 mb-1">{stat.title}</p>
                <p className="text-3xl font-bold text-[#5D4037]">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* 周期统计 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10">
        <h2 className="text-xl font-bold text-[#5D4037] mb-4">周期统计</h2>
        <div className="space-y-4">
          {periodStats.map((period) => (
            <div key={period.period} className="flex items-center justify-between p-4 bg-[#FFFBF0] rounded-xl">
              <div className="flex-1">
                <p className="text-sm font-medium text-[#5D4037] mb-2">{period.period}</p>
                <div className="flex gap-6">
                  <div>
                    <p className="text-xs text-[#5D4037]/60">新增用户</p>
                    <p className="text-lg font-bold text-[#FFC857]">{period.newUsers}</p>
                  </div>
                  <div>
                    <p className="text-xs text-[#5D4037]/60">活跃用户</p>
                    <p className="text-lg font-bold text-[#FFB347]">{period.activeUsers}</p>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
