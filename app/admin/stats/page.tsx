import type { ReactNode } from 'react';
import { createClient } from '@/lib/cloudbase/server';
import { parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import MaintenanceButton from '../components/MaintenanceButton';

interface StatCardItem {
  key: string;
  title: string;
  value: number | string;
  icon: string;
  colorStart: string;
  colorEnd: string;
  subtitle?: string;
}

interface BookingTypeItem {
  key: string;
  name: string;
  count: number;
}

interface PoseTopTagItem {
  key: string;
  rank: number;
  tagName: string;
  usageCount: number;
}

interface TrendItem {
  key: string;
  dateLabel: string;
  count: number;
}

interface LatestVersionInfo {
  version: string;
  platform: string;
  createdAtText: string;
}

interface StatsView {
  userCards: StatCardItem[];
  albumCards: StatCardItem[];
  photoCardsPrimary: StatCardItem[];
  photoCardsSecondary: StatCardItem[];
  bookingCardsPrimary: StatCardItem[];
  bookingCardsSecondary: StatCardItem[];
  poseCards: StatCardItem[];
  systemCards: StatCardItem[];
  bookingTypeStats: BookingTypeItem[];
  poseTopTags: PoseTopTagItem[];
  latestVersion: LatestVersionInfo | null;
  trendNewUsers: TrendItem[];
  trendActiveUsers: TrendItem[];
  trendNewBookings: TrendItem[];
}

function toSafeNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toSafeText(value: unknown, fallback = ''): string {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function formatMonthDay(value: unknown): string {
  const parsed = parseDateTimeUTC8(value);
  if (!parsed) return '--';
  return parsed.toLocaleDateString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
  });
}

function formatDateTimeText(value: unknown): string {
  const parsed = parseDateTimeUTC8(value);
  if (!parsed) return '';
  return parsed.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function createStatCard(
  key: string,
  title: string,
  value: number | string,
  icon: string,
  colorStart: string,
  colorEnd: string,
  subtitle = ''
): StatCardItem {
  return { key, title, value, icon, colorStart, colorEnd, subtitle };
}

function createEmptyStatsView(): StatsView {
  return {
    userCards: [],
    albumCards: [],
    photoCardsPrimary: [],
    photoCardsSecondary: [],
    bookingCardsPrimary: [],
    bookingCardsSecondary: [],
    poseCards: [],
    systemCards: [],
    bookingTypeStats: [],
    poseTopTags: [],
    latestVersion: null,
    trendNewUsers: [],
    trendActiveUsers: [],
    trendNewBookings: [],
  };
}

function buildStatsView(stats: unknown): StatsView {
  const root = (stats && typeof stats === 'object' ? stats : {}) as Record<string, any>;
  const users = (root.users && typeof root.users === 'object' ? root.users : {}) as Record<string, unknown>;
  const albums = (root.albums && typeof root.albums === 'object' ? root.albums : {}) as Record<string, unknown>;
  const photos = (root.photos && typeof root.photos === 'object' ? root.photos : {}) as Record<string, unknown>;
  const bookings = (root.bookings && typeof root.bookings === 'object' ? root.bookings : {}) as Record<string, unknown>;
  const poses = (root.poses && typeof root.poses === 'object' ? root.poses : {}) as Record<string, unknown>;
  const system = (root.system && typeof root.system === 'object' ? root.system : {}) as Record<string, any>;
  const trends = (root.trends && typeof root.trends === 'object' ? root.trends : {}) as Record<string, unknown>;

  const bookingTypeStats = Array.isArray(bookings.types)
    ? bookings.types.map((item: any, index: number) => ({
        key: `booking-type-${index}`,
        name: toSafeText(item?.type_name, '未命名类型'),
        count: toSafeNumber(item?.count, 0),
      }))
    : [];

  const poseTopTags = Array.isArray(poses.top_tags)
    ? poses.top_tags.map((item: any, index: number) => ({
        key: `pose-tag-${index}`,
        rank: index + 1,
        tagName: toSafeText(item?.tag_name, '未命名标签'),
        usageCount: toSafeNumber(item?.usage_count, 0),
      }))
    : [];

  let latestVersion: LatestVersionInfo | null = null;
  if (system.latest_version) {
    if (typeof system.latest_version === 'string') {
      latestVersion = {
        version: toSafeText(system.latest_version, '-'),
        platform: '',
        createdAtText: '',
      };
    } else if (typeof system.latest_version === 'object') {
      latestVersion = {
        version: toSafeText(system.latest_version.version, '-'),
        platform: toSafeText(system.latest_version.platform, ''),
        createdAtText: formatDateTimeText(system.latest_version.created_at),
      };
    }
  }

  const trendNewUsers = Array.isArray(trends.daily_new_users)
    ? trends.daily_new_users.map((item: any, index: number) => ({
        key: `trend-user-${index}`,
        dateLabel: formatMonthDay(item?.date),
        count: toSafeNumber(item?.count, 0),
      }))
    : [];

  const trendActiveUsers = Array.isArray(trends.daily_active_users)
    ? trends.daily_active_users.map((item: any, index: number) => ({
        key: `trend-active-${index}`,
        dateLabel: formatMonthDay(item?.date),
        count: toSafeNumber(item?.count, 0),
      }))
    : [];

  const trendNewBookings = Array.isArray(trends.daily_new_bookings)
    ? trends.daily_new_bookings.map((item: any, index: number) => ({
        key: `trend-booking-${index}`,
        dateLabel: formatMonthDay(item?.date),
        count: toSafeNumber(item?.count, 0),
      }))
    : [];

  return {
    userCards: [
      createStatCard('users-total', '总用户数', toSafeNumber(users.total, 0), '👥', '#FFC857', '#FFB347'),
      createStatCard('users-regular', '普通用户', toSafeNumber(users.regular_users, 0), '🙋', '#FF9A3C', '#FF8C42'),
      createStatCard('users-new', '今日新增', toSafeNumber(users.new_today, 0), '➕', '#FFB347', '#FFA500'),
      createStatCard('users-active', '今日活跃', toSafeNumber(users.active_today, 0), '⚡', '#FFA500', '#FF8C00'),
    ],
    albumCards: [
      createStatCard('albums-total', '总相册数', toSafeNumber(albums.total, 0), '📁', '#8B7355', '#6D5A4A'),
      createStatCard('albums-active', '有效空间', Math.max(0, toSafeNumber(albums.total, 0) - toSafeNumber(albums.expired, 0)), '🧩', '#9C8063', '#8B7355'),
      createStatCard('albums-new', '今日新增', toSafeNumber(albums.new_today, 0), '🆕', '#A0826D', '#8B7355'),
      createStatCard('albums-expired', '已过期', toSafeNumber(albums.expired, 0), '⏰', '#B8956A', '#A0826D'),
    ],
    photoCardsPrimary: [
      createStatCard('photos-total', '总照片数', toSafeNumber(photos.total, 0), '🖼️', '#7B68EE', '#6A5ACD'),
      createStatCard('photos-new', '今日新增', toSafeNumber(photos.new_today, 0), '📸', '#9370DB', '#8A2BE2'),
      createStatCard('photos-public', '公开照片', toSafeNumber(photos.public, 0), '👁️', '#BA55D3', '#9370DB', '照片墙展示'),
      createStatCard('photos-private', '私密照片', toSafeNumber(photos.private, 0), '🔒', '#DA70D6', '#BA55D3', '专属空间'),
    ],
    photoCardsSecondary: [
      createStatCard('photos-views', '总浏览量', toSafeNumber(photos.total_views, 0), '👁️', '#4169E1', '#1E90FF'),
      createStatCard('photos-likes', '总点赞数', toSafeNumber(photos.total_likes, 0), '❤️', '#FF69B4', '#FF1493'),
      createStatCard('photos-downloads', '总下载数', toSafeNumber(photos.total_downloads, 0), '⬇️', '#4DB6AC', '#26A69A'),
      createStatCard('photos-stories', '故事照片', toSafeNumber(photos.with_story, 0), '↻', '#8D6E63', '#6D4C41', `高亮 ${toSafeNumber(photos.highlighted, 0)}`),
    ],
    bookingCardsPrimary: [
      createStatCard('bookings-total', '总预约数', toSafeNumber(bookings.total, 0), '📅', '#20B2AA', '#008B8B'),
      createStatCard('bookings-new', '今日新增', toSafeNumber(bookings.new_today, 0), '🆕', '#48D1CC', '#20B2AA'),
      createStatCard('bookings-pending', '待处理', toSafeNumber(bookings.pending, 0), '⏳', '#FFA500', '#FF8C00'),
      createStatCard('bookings-confirmed', '已确认', toSafeNumber(bookings.confirmed, 0), '✅', '#32CD32', '#228B22'),
    ],
    bookingCardsSecondary: [
      createStatCard('bookings-in-progress', '进行中', toSafeNumber(bookings.in_progress, 0), '⚡', '#1E90FF', '#4169E1'),
      createStatCard('bookings-finished', '已完成', toSafeNumber(bookings.finished, 0), '✔️', '#00FA9A', '#00FF7F'),
      createStatCard('bookings-cancelled', '已取消', toSafeNumber(bookings.cancelled, 0), '❌', '#DC143C', '#B22222'),
    ],
    poseCards: [
      createStatCard('poses-total', '总摆姿数', toSafeNumber(poses.total, 0), '📸', '#FF6347', '#FF4500'),
      createStatCard('poses-new', '今日新增', toSafeNumber(poses.new_today, 0), '🆕', '#FF7F50', '#FF6347'),
      createStatCard('poses-views', '总浏览量', toSafeNumber(poses.total_views, 0), '👁️', '#FFA07A', '#FF7F50'),
      createStatCard('poses-tags', '总标签数', toSafeNumber(poses.total_tags, 0), '🏷️', '#FFB6C1', '#FFA07A'),
    ],
    systemCards: [
      createStatCard('system-cities', '允许预约城市', toSafeNumber(system.total_cities, 0), '🏙️', '#4682B4', '#4169E1'),
      createStatCard('system-blackout', '档期锁定', toSafeNumber(system.total_blackout_dates, 0), '📅', '#5F9EA0', '#4682B4'),
      createStatCard('system-releases', '版本发布', toSafeNumber(system.total_releases, 0), '📦', '#6495ED', '#5F9EA0'),
    ],
    bookingTypeStats,
    poseTopTags,
    latestVersion,
    trendNewUsers,
    trendActiveUsers,
    trendNewBookings,
  };
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="stats-error-panel">
      <p className="stats-error-panel__text">{message}</p>
    </div>
  );
}

function StatsSection({ icon, title, children }: { icon: string; title: string; children: ReactNode }) {
  return (
    <section className="stats-section">
      <div className="stats-section__head">
        <span className="stats-section__icon">{icon}</span>
        <h2 className="stats-section__title">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function StatsCardsGrid({ cards, spaced = false }: { cards: StatCardItem[]; spaced?: boolean }) {
  return (
    <div className={`stats-cards-grid ${spaced ? 'stats-cards-grid--spaced' : ''}`}>
      {cards.map((item) => (
        <div key={item.key} className="stats-card">
          <div className="stats-card__icon" style={{ background: `linear-gradient(135deg, ${item.colorStart}, ${item.colorEnd})` }}>
            <span className="stats-card__icon-text">{item.icon}</span>
          </div>
          <p className="stats-card__title">{item.title}</p>
          <p className="stats-card__value">{item.value}</p>
          {item.subtitle ? <p className="stats-card__subtitle">{item.subtitle}</p> : null}
        </div>
      ))}
    </div>
  );
}

function ExtraCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="stats-extra-card">
      <h3 className="stats-extra-card__title">{title}</h3>
      {children}
    </div>
  );
}

function LatestVersionCard({ latestVersion }: { latestVersion: LatestVersionInfo }) {
  return (
    <ExtraCard title="最新版本">
      <div className="stats-version-card">
        <div className="stats-version-card__icon">
          <span className="stats-version-card__icon-text">📦</span>
        </div>
        <div className="stats-version-card__main">
          <p className="stats-version-card__label">版本号</p>
          <p className="stats-version-card__value">{latestVersion.version}</p>
        </div>
        {latestVersion.platform ? (
          <div className="stats-version-card__meta-block">
            <p className="stats-version-card__label">平台</p>
            <p className="stats-version-card__meta">{latestVersion.platform}</p>
          </div>
        ) : null}
        {latestVersion.createdAtText ? (
          <div className="stats-version-card__meta-block">
            <p className="stats-version-card__label">发布时间</p>
            <p className="stats-version-card__meta">{latestVersion.createdAtText}</p>
          </div>
        ) : null}
      </div>
    </ExtraCard>
  );
}

function TrendCard({ title, rows, valueClassName }: { title: string; rows: TrendItem[]; valueClassName: string }) {
  if (!rows.length) return null;

  return (
    <div className="stats-extra-card">
      <h3 className="stats-extra-card__title">{title}</h3>
      <div className="stats-trend-grid">
        {rows.map((item) => (
          <div key={item.key} className="stats-trend-item">
            <span className="stats-trend-item__date">{item.dateLabel}</span>
            <span className={`stats-trend-item__value ${valueClassName}`}>{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function StatsPage() {
  const dbClient = await createClient();
  const { data: stats, error } = await dbClient.rpc('get_admin_dashboard_stats');

  if (error) {
    const errorMessage = typeof error.message === 'string' && error.message.trim() ? error.message : '未知错误';
    const errorCode = typeof error.code === 'string' && error.code.trim() ? `（${error.code}）` : '';
    console.warn(`获取统计数据失败${errorCode}: ${errorMessage}`);
    return (
      <div className="admin-mobile-page stats-page">
        <ErrorPanel message="获取统计数据失败，请稍后重试。" />
      </div>
    );
  }

  const statsView = buildStatsView(stats);

  return (
    <div className="admin-mobile-page stats-page">
      <section className="stats-header">
        <div className="stats-header__main">
          <h1 className="stats-header__title" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            数据统计 📊
          </h1>
          <p className="stats-header__desc">实时查看平台运营数据</p>
        </div>
        <MaintenanceButton variant="stats" />
      </section>

      <StatsSection icon="👥" title="用户统计">
        <StatsCardsGrid cards={statsView.userCards} />
      </StatsSection>

      <StatsSection icon="📁" title="相册统计">
        <StatsCardsGrid cards={statsView.albumCards} />
      </StatsSection>

      <StatsSection icon="🖼️" title="照片统计">
        <StatsCardsGrid cards={statsView.photoCardsPrimary} />
        <StatsCardsGrid cards={statsView.photoCardsSecondary} spaced />
      </StatsSection>

      <StatsSection icon="📅" title="预约统计">
        <StatsCardsGrid cards={statsView.bookingCardsPrimary} />
        <StatsCardsGrid cards={statsView.bookingCardsSecondary} spaced />
        {statsView.bookingTypeStats.length ? (
          <ExtraCard title="预约类型分布">
            <div className="stats-mini-grid">
              {statsView.bookingTypeStats.map((item) => (
                <div key={item.key} className="stats-mini-item">
                  <span className="stats-mini-item__name">{item.name}</span>
                  <span className="stats-mini-item__value">{item.count}</span>
                </div>
              ))}
            </div>
          </ExtraCard>
        ) : null}
      </StatsSection>

      <StatsSection icon="📸" title="摆姿统计">
        <StatsCardsGrid cards={statsView.poseCards} />
        {statsView.poseTopTags.length ? (
          <ExtraCard title="热门标签 Top 10">
            <div className="stats-tag-grid">
              {statsView.poseTopTags.map((item) => (
                <div key={item.key} className="stats-tag-item">
                  <span className="stats-tag-item__rank">#{item.rank}</span>
                  <div className="stats-tag-item__main">
                    <p className="stats-tag-item__name">{item.tagName}</p>
                    <p className="stats-tag-item__meta">{item.usageCount} 次</p>
                  </div>
                </div>
              ))}
            </div>
          </ExtraCard>
        ) : null}
      </StatsSection>

      <StatsSection icon="📦" title="系统统计">
        <StatsCardsGrid cards={statsView.systemCards} />
        {statsView.latestVersion ? <LatestVersionCard latestVersion={statsView.latestVersion} /> : null}
      </StatsSection>

      {statsView.trendNewUsers.length || statsView.trendActiveUsers.length || statsView.trendNewBookings.length ? (
        <StatsSection icon="📈" title="最近7天趋势">
          <div className="stats-trend-card-grid">
            <TrendCard title="新增用户" rows={statsView.trendNewUsers} valueClassName="text-[#FFC857]" />
            <TrendCard title="活跃用户" rows={statsView.trendActiveUsers} valueClassName="text-[#FFB347]" />
            <TrendCard title="新增预约" rows={statsView.trendNewBookings} valueClassName="text-[#20B2AA]" />
          </div>
        </StatsSection>
      ) : null}
    </div>
  );
}
