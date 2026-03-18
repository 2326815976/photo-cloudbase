'use client';

import { useState } from 'react';
import { Settings, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

type MaintenancePayload = {
  cleanup_result?: {
    deleted_photos?: unknown;
    deleted_folders?: unknown;
    deleted_albums?: unknown;
    deleted_storage_files?: unknown;
    storage_cleanup_warnings?: unknown;
  } | null;
  sessions_cleaned?: unknown;
  ip_attempts_cleaned?: unknown;
  beta_feature_bindings_cleaned?: unknown;
  photo_views_cleaned?: unknown;
  password_reset_tokens_cleaned?: unknown;
  user_active_logs_cleaned?: unknown;
  slider_captcha_challenges_cleaned?: unknown;
  booking_blackouts_cleaned?: unknown;
  analytics_daily_cleaned?: unknown;
  skipped_tasks?: unknown;
};

const TASK_LABELS: Record<string, string> = {
  beta_feature_bindings_cleanup: '内测功能绑定清理',
  slider_captcha_challenges_cleanup: '滑块验证记录清理',
  booking_blackouts_cleanup: '预约屏蔽日期清理',
  analytics_daily_cleanup: '每日统计清理',
  analytics_snapshot_update: '统计快照更新',
};

function readCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item ?? '').trim()).filter(Boolean);
}

function formatTaskName(taskName: string): string {
  return TASK_LABELS[taskName] || taskName;
}

function buildMaintenanceMessage(payload: MaintenancePayload): string {
  const cleanup = payload.cleanup_result || {};
  const summaryParts = [
    `清理照片${readCount(cleanup.deleted_photos)}张`,
    `清理文件夹${readCount(cleanup.deleted_folders)}个`,
    `清理相册${readCount(cleanup.deleted_albums)}个`,
    `清理存储文件${readCount(cleanup.deleted_storage_files)}个`,
    `清理会话${readCount(payload.sessions_cleaned)}条`,
    `清理 IP 尝试${readCount(payload.ip_attempts_cleaned)}条`,
    `清理浏览记录${readCount(payload.photo_views_cleaned)}条`,
    `清理内测绑定${readCount(payload.beta_feature_bindings_cleaned)}条`,
    `清理重置令牌${readCount(payload.password_reset_tokens_cleaned)}条`,
    `清理活跃日志${readCount(payload.user_active_logs_cleaned)}条`,
    `清理滑块验证${readCount(payload.slider_captcha_challenges_cleaned)}条`,
    `清理预约屏蔽日期${readCount(payload.booking_blackouts_cleaned)}条`,
    `清理每日统计${readCount(payload.analytics_daily_cleaned)}条`,
  ];

  const extras: string[] = [];
  const warningList = readStringList(cleanup.storage_cleanup_warnings);
  if (warningList.length > 0) {
    extras.push(`存储清理告警：${warningList.join('；')}`);
  }

  const skippedTasks = readStringList(payload.skipped_tasks).map(formatTaskName);
  if (skippedTasks.length > 0) {
    extras.push(`跳过任务：${skippedTasks.join('、')}`);
  }

  return `维护任务执行完成：${summaryParts.join('，')}${extras.length > 0 ? `；${extras.join('；')}` : ''}`;
}

export default function MaintenanceButton() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const runMaintenance = async () => {
    setRunning(true);
    setResult(null);

    try {
      const response = await fetch('/api/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (response.ok) {
        const payload = (data?.result ?? {}) as MaintenancePayload;
        setResult({
          success: true,
          message: buildMaintenanceMessage(payload),
        });
      } else {
        setResult({
          success: false,
          message: `维护失败：${data?.error || '未知错误'}${data?.details ? ` - ${data.details}` : ''}`,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: `维护失败：${error instanceof Error ? error.message : '未知错误'}`,
      });
    } finally {
      setRunning(false);
      setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={runMaintenance}
        disabled={running}
        className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        title="执行维护任务"
      >
        {running ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Settings className="w-4 h-4" />
        )}
        <span>{running ? '执行中...' : '立即维护'}</span>
      </button>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`absolute top-full mt-2 right-0 min-w-[300px] p-3 rounded-lg shadow-lg ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}
          >
            <div className="flex items-start gap-2">
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                {result.message}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
