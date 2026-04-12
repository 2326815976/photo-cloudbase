'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import MaintenanceButton from '../components/MaintenanceButton';

const REFRESH_PENDING_TIMEOUT_MS = 15000;

interface StatsMetaView {
  snapshotDateText: string;
  trendCoverageText: string;
  statusText: string;
  statusTone: 'fresh' | 'warning' | 'muted';
}

interface StatsClientProps {
  children: ReactNode;
  meta: StatsMetaView;
}

export default function StatsClient({ children, meta }: StatsClientProps) {
  const router = useRouter();
  const [transitionPending, startRefresh] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!transitionPending) {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
      setRefreshing(false);
    }
  }, [transitionPending]);

  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, []);

  const handleRefresh = () => {
    if (refreshing) {
      return;
    }

    setRefreshing(true);
    if (refreshTimeoutRef.current !== null) {
      window.clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = window.setTimeout(() => {
      refreshTimeoutRef.current = null;
      setRefreshing(false);
    }, REFRESH_PENDING_TIMEOUT_MS);

    startRefresh(() => {
      router.refresh();
    });
  };

  return (
    <div className="admin-mobile-page stats-page">
      <section className="stats-header">
        <div className="stats-header__top">
          <div className="stats-header__main">
            <span className="stats-header__eyebrow">平台概览</span>
            <h1 className="stats-header__title" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              快照与趋势状态
            </h1>
            <p className="stats-header__desc">集中查看快照日期、趋势覆盖和维护状态。</p>
          </div>
          <div className="stats-toolbar">
            <button
              type="button"
              className="stats-refresh-btn"
              onClick={handleRefresh}
              disabled={refreshing}
            >
              {refreshing ? "刷新中..." : "刷新统计"}
            </button>
            <MaintenanceButton variant="stats" onSuccess={handleRefresh} />
          </div>
        </div>
        <div className="stats-meta-panel">
          <div className="stats-meta-item">
            <span className="stats-meta-item__label">快照日期</span>
            <span className="stats-meta-item__value">{meta.snapshotDateText || "—"}</span>
          </div>
          <div className="stats-meta-item">
            <span className="stats-meta-item__label">趋势覆盖</span>
            <span className="stats-meta-item__value">{meta.trendCoverageText || "0/7 天"}</span>
          </div>
        </div>
      </section>

      {children}
    </div>
  );
}
