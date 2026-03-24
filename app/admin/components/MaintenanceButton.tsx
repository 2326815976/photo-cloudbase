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
  beta_feature_bindings_cleanup: '\u5185\u6d4b\u529f\u80fd\u7ed1\u5b9a\u6e05\u7406',
  slider_captcha_challenges_cleanup: '\u6ed1\u5757\u9a8c\u8bc1\u8bb0\u5f55\u6e05\u7406',
  booking_blackouts_cleanup: '\u9884\u7ea6\u5c4f\u853d\u65e5\u671f\u6e05\u7406',
  analytics_daily_cleanup: '\u6bcf\u65e5\u7edf\u8ba1\u6e05\u7406',
  analytics_snapshot_update: '\u7edf\u8ba1\u5feb\u7167\u66f4\u65b0',
};

const MAINTAIN_TITLE = '\u6267\u884c\u7ef4\u62a4\u4efb\u52a1';
const RUNNING_TEXT = '\u6267\u884c\u4e2d...';
const RUN_TEXT = '\u7acb\u5373\u7ef4\u62a4';
const UNKNOWN_ERROR = '\u672a\u77e5\u9519\u8bef';

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
    `\u6e05\u7406\u7167\u7247${readCount(cleanup.deleted_photos)}\u5f20`,
    `\u6e05\u7406\u6587\u4ef6\u5939${readCount(cleanup.deleted_folders)}\u4e2a`,
    `\u6e05\u7406\u76f8\u518c${readCount(cleanup.deleted_albums)}\u4e2a`,
    `\u6e05\u7406\u5b58\u50a8\u6587\u4ef6${readCount(cleanup.deleted_storage_files)}\u4e2a`,
    `\u6e05\u7406\u4f1a\u8bdd${readCount(payload.sessions_cleaned)}\u6761`,
    `\u6e05\u7406 IP \u5c1d\u8bd5${readCount(payload.ip_attempts_cleaned)}\u6761`,
    `\u6e05\u7406\u6d4f\u89c8\u8bb0\u5f55${readCount(payload.photo_views_cleaned)}\u6761`,
    `\u6e05\u7406\u5185\u6d4b\u7ed1\u5b9a${readCount(payload.beta_feature_bindings_cleaned)}\u6761`,
    `\u6e05\u7406\u91cd\u7f6e\u4ee4\u724c${readCount(payload.password_reset_tokens_cleaned)}\u6761`,
    `\u6e05\u7406\u6d3b\u8dc3\u65e5\u5fd7${readCount(payload.user_active_logs_cleaned)}\u6761`,
    `\u6e05\u7406\u6ed1\u5757\u9a8c\u8bc1${readCount(payload.slider_captcha_challenges_cleaned)}\u6761`,
    `\u6e05\u7406\u9884\u7ea6\u5c4f\u853d\u65e5\u671f${readCount(payload.booking_blackouts_cleaned)}\u6761`,
    `\u6e05\u7406\u6bcf\u65e5\u7edf\u8ba1${readCount(payload.analytics_daily_cleaned)}\u6761`,
  ];

  const extras: string[] = [];
  const warningList = readStringList(cleanup.storage_cleanup_warnings);
  if (warningList.length > 0) {
    extras.push(`\u5b58\u50a8\u6e05\u7406\u544a\u8b66\uff1a${warningList.join('\uff1b')}`);
  }

  const skippedTasks = readStringList(payload.skipped_tasks).map(formatTaskName);
  if (skippedTasks.length > 0) {
    extras.push(`\u8df3\u8fc7\u4efb\u52a1\uff1a${skippedTasks.join('\u3001')}`);
  }

  return `\u7ef4\u62a4\u4efb\u52a1\u6267\u884c\u5b8c\u6210\uff1a${summaryParts.join('\uff0c')}${extras.length > 0 ? `\uff1b${extras.join('\uff1b')}` : ''}`;
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
          message: `\u7ef4\u62a4\u5931\u8d25\uff1a${data?.error || UNKNOWN_ERROR}${data?.details ? ` - ${data.details}` : ''}`,
        });
      }
    } catch (error) {
      setResult({
        success: false,
        message: `\u7ef4\u62a4\u5931\u8d25\uff1a${error instanceof Error ? error.message : UNKNOWN_ERROR}`,
      });
    } finally {
      setRunning(false);
      window.setTimeout(() => setResult(null), 5000);
    }
  };

  return (
    <div className="relative shrink-0">
      <button
        onClick={runMaintenance}
        disabled={running}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[#FFC857]/38 bg-[linear-gradient(135deg,rgba(255,248,228,0.96),rgba(255,255,255,0.88))] px-4 text-sm font-semibold text-[#5D4037] shadow-[0_10px_18px_rgba(93,64,55,0.08)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_24px_rgba(93,64,55,0.10)] disabled:cursor-not-allowed disabled:opacity-60"
        title={MAINTAIN_TITLE}
      >
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#FFC857]/18 text-[#5D4037]">
          {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Settings className="h-4 w-4" />}
        </span>
        <span>{running ? RUNNING_TEXT : RUN_TEXT}</span>
      </button>

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={`absolute right-0 top-full z-20 mt-3 w-[min(360px,calc(100vw-32px))] overflow-hidden rounded-[24px] border p-4 shadow-[0_18px_36px_rgba(93,64,55,0.14)] backdrop-blur-sm ${
              result.success
                ? 'border-[#FFC857]/38 bg-[linear-gradient(180deg,rgba(255,252,244,0.98)_0%,rgba(255,248,228,0.96)_100%)]'
                : 'border-[#E9B3AA]/44 bg-[linear-gradient(180deg,rgba(255,249,248,0.98)_0%,rgba(255,241,238,0.96)_100%)]'
            }`}
          >
            <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-[#FFC857] via-[#FFB347] to-[#FFD67E]" />
            <div className="flex items-start gap-3 pt-2">
              <div className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${result.success ? 'bg-[#FFC857]/18 text-[#A66A00]' : 'bg-[#FDECEC] text-[#C65D4A]'}`}>
                {result.success ? <CheckCircle className="h-[18px] w-[18px]" /> : <XCircle className="h-[18px] w-[18px]" />}
              </div>
              <p className="text-sm leading-6 text-[#5D4037]/82">{result.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
