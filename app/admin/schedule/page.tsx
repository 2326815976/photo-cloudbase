'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { formatDateUTC8, getDateAfterDaysUTC8, getTodayUTC8, parseDateUTC8 } from '@/lib/utils/date-helpers';

interface Blackout {
  id: number;
  date: string;
  reason: string;
  created_at: string;
}

function formatScheduleDateLabel(dateText: string): string {
  const date = parseDateUTC8(dateText);
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  });
}

function formatScheduleWeekdayLabel(dateText: string): string {
  const date = parseDateUTC8(dateText);
  return date.toLocaleDateString('zh-CN', {
    weekday: 'long',
    timeZone: 'Asia/Shanghai',
  });
}

function formatScheduleShortLabel(dateText: string): string {
  const date = parseDateUTC8(dateText);
  return date.toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    timeZone: 'Asia/Shanghai',
  });
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) {
      return message;
    }
  }
  return '未知错误';
}

type ScheduleToastType = 'success' | 'error' | 'warning';

interface LoadBlackoutsOptions {
  showNotice?: boolean;
  throwOnError?: boolean;
}

interface LoadBlackoutsResult {
  ok: boolean;
  message: string;
}

type AdminBlockedDateRow = {
  id?: number | string | null;
  date?: string | null;
  blocked_date?: string | null;
  day?: string | null;
  reason?: string | null;
  created_at?: string | null;
};

function extractApiMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const directMessage = String((payload as { error?: unknown; message?: unknown }).error ?? (payload as { message?: unknown }).message ?? '').trim();
  if (directMessage) {
    return directMessage;
  }

  const nestedData = (payload as { data?: unknown }).data;
  if (nestedData && typeof nestedData === 'object') {
    const nestedMessage = extractApiMessage(nestedData, '');
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return fallback;
}

function normalizeBlackoutRow(input: AdminBlockedDateRow): Blackout | null {
  const id = Number(input?.id);
  const date = String(input?.date ?? input?.blocked_date ?? input?.day ?? '').trim();
  if (!Number.isInteger(id) || id <= 0 || !date) {
    return null;
  }

  return {
    id,
    date,
    reason: String(input?.reason ?? '').trim(),
    created_at: String(input?.created_at ?? '').trim(),
  };
}

async function readAdminBlockedDatesResponse(): Promise<Blackout[]> {
  const response = await fetch('/api/admin/blocked-dates', {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(extractApiMessage(payload, '加载档期锁定失败'));
  }

  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as { data?: unknown } | null)?.data)
      ? (payload as { data: AdminBlockedDateRow[] }).data
      : [];

  return rows
    .map((item) => normalizeBlackoutRow((item ?? {}) as AdminBlockedDateRow))
    .filter((item): item is Blackout => Boolean(item))
    .sort((left, right) => String(left.date).localeCompare(String(right.date), 'zh-CN'));
}

async function createBlockedDateByApi(date: string, reason: string): Promise<void> {
  const response = await fetch('/api/admin/blocked-dates', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'same-origin',
    body: JSON.stringify({
      date,
      reason: reason.trim() || null,
    }),
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = new Error(extractApiMessage(payload, '新增锁档日期失败')) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
}

async function deleteBlockedDateByApi(id: number): Promise<void> {
  const response = await fetch(`/api/admin/blocked-dates/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
    credentials: 'same-origin',
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(extractApiMessage(payload, '删除锁档日期失败'));
  }
}

function isDuplicateBlackoutError(error: unknown): boolean {
  const status = Number((error as { status?: unknown } | null)?.status ?? 0);
  const message = formatErrorMessage(error).toLowerCase();
  return status === 409 || message.includes('已被锁定') || message.includes('duplicate entry');
}

export default function SchedulePage() {
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(true);
  const [blackoutsRefreshing, setBlackoutsRefreshing] = useState(false);
  const [blackoutsError, setBlackoutsError] = useState('');
  const [blackoutsReady, setBlackoutsReady] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: ScheduleToastType } | null>(null);
  const [deletingBlackout, setDeletingBlackout] = useState<Blackout | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const blackoutsLoadTokenRef = useRef(0);

  const showTransientToast = (message: string, type: ScheduleToastType) => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 3000);
  };

  const loadBlackouts = async (options: LoadBlackoutsOptions = {}): Promise<LoadBlackoutsResult> => {
    const config = options && typeof options === 'object' ? options : {};
    const shouldThrow = config.throwOnError !== false;
    const shouldShowNotice = Boolean(config.showNotice);
    const hasReadyBlackouts = blackoutsReady;
    const isFirstLoad = !hasReadyBlackouts;
    const loadToken = blackoutsLoadTokenRef.current + 1;
    blackoutsLoadTokenRef.current = loadToken;

    setLoading(isFirstLoad);
    setBlackoutsRefreshing(!isFirstLoad);
    setBlackoutsError('');

    try {
      const rows = await readAdminBlockedDatesResponse();

      if (loadToken !== blackoutsLoadTokenRef.current) {
        return { ok: false, message: '请求已失效' };
      }

      setBlackouts(rows);
      setLoading(false);
      setBlackoutsRefreshing(false);
      setBlackoutsError('');
      setBlackoutsReady(true);
      return { ok: true, message: '' };
    } catch (error) {
      const message = `加载档期锁定失败：${formatErrorMessage(error)}`;
      if (loadToken === blackoutsLoadTokenRef.current) {
        setLoading(false);
        setBlackoutsRefreshing(false);
        setBlackoutsError(message);
        setBlackoutsReady(hasReadyBlackouts);
        if (!hasReadyBlackouts) {
          setBlackouts([]);
        }
      }
      if (shouldShowNotice) {
        showTransientToast(message, 'error');
      }
      if (shouldThrow) {
        throw error;
      }
      return { ok: false, message };
    }
  };

  const refreshSchedulePanel = async ({ silent = false }: { silent?: boolean } = {}) => {
    const result = await loadBlackouts({ throwOnError: false, showNotice: false });
    if (result.ok) {
      if (!silent) {
        showTransientToast('档期列表已刷新', 'success');
      }
      return result;
    }

    if (!silent) {
      showTransientToast(result.message || '刷新失败，请稍后重试', blackoutsReady ? 'warning' : 'error');
    }
    return result;
  };

  useEffect(() => {
    void loadBlackouts({ throwOnError: false });

    return () => {
      blackoutsLoadTokenRef.current += 1;
    };
  }, []);

  const handleAdd = async () => {
    if (!formData.startDate) {
      showTransientToast('请选择开始日期', 'warning');
      return;
    }

    if (formData.startDate < getTodayUTC8()) {
      showTransientToast('不能锁定今天之前的日期', 'warning');
      return;
    }

    setSubmitting(true);

    const dates: string[] = [];
    const start = parseDateUTC8(formData.startDate);
    const end = formData.endDate ? parseDateUTC8(formData.endDate) : start;

    if (end < start) {
      showTransientToast('结束日期不能早于开始日期', 'warning');
      setSubmitting(false);
      return;
    }

    const current = new Date(start);
    while (current <= end) {
      dates.push(formatDateUTC8(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const normalizedReason = formData.reason.trim();

    try {
      let createdCount = 0;
      let duplicatedCount = 0;
      for (const date of dates) {
        try {
          await createBlockedDateByApi(date, normalizedReason);
          createdCount += 1;
        } catch (error) {
          if (isDuplicateBlackoutError(error)) {
            duplicatedCount += 1;
            continue;
          }
          throw error;
        }
      }

      if (createdCount > 0) {
        setShowAddModal(false);
        setFormData({ startDate: '', endDate: '', reason: '' });
      }

      const refreshResult = await loadBlackouts({ throwOnError: false, showNotice: false });
      const suffix = refreshResult.ok ? '' : `；列表刷新失败：${refreshResult.message}`;
      const feedbackType: ScheduleToastType = refreshResult.ok ? (createdCount > 0 ? 'success' : 'warning') : blackoutsReady ? 'warning' : 'error';

      if (createdCount > 0 && duplicatedCount > 0) {
        showTransientToast(`已锁定 ${createdCount} 天，跳过 ${duplicatedCount} 个已存在日期${suffix}`, feedbackType);
      } else if (createdCount > 0) {
        showTransientToast(`档期已锁定${suffix}`, feedbackType);
      } else if (duplicatedCount > 0) {
        showTransientToast(`所选日期均已锁定，无需重复添加${suffix}`, feedbackType);
      } else {
        showTransientToast(`添加失败：未生成有效锁档记录${suffix}`, 'error');
      }
    } catch (error: any) {
      showTransientToast(`添加失败：${error?.message || '未知错误'}`, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    const blackout = blackouts.find(b => b.id === id);
    if (blackout) {
      setDeletingBlackout(blackout);
    }
  };

  const confirmDelete = async () => {
    if (!deletingBlackout) return;

    setActionLoading(true);
    try {
      await deleteBlockedDateByApi(deletingBlackout.id);

      setDeletingBlackout(null);
      const refreshResult = await loadBlackouts({ throwOnError: false, showNotice: false });
      const suffix = refreshResult.ok ? '' : `；列表刷新失败：${refreshResult.message}`;
      const feedbackType: ScheduleToastType = refreshResult.ok ? 'success' : blackoutsReady ? 'warning' : 'error';
      showTransientToast(`档期锁定已删除${suffix}`, feedbackType);
    } catch (error: any) {
      setDeletingBlackout(null);
      showTransientToast(`删除失败：${error?.message || '未知错误'}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      showTransientToast('请先选择要删除的档期', 'warning');
      return;
    }

    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    setShowBatchDeleteConfirm(false);
    setActionLoading(true);
    try {
      let deletedCount = 0;
      let failedCount = 0;
      for (const id of selectedIds) {
        try {
          await deleteBlockedDateByApi(id);
          deletedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (deletedCount === 0) {
        throw new Error('批量删除失败，请稍后重试');
      }

      setSelectedIds([]);
      setIsSelectionMode(false);

      const refreshResult = await loadBlackouts({ throwOnError: false, showNotice: false });
      const suffix = refreshResult.ok ? '' : `；列表刷新失败：${refreshResult.message}`;
      const feedbackType: ScheduleToastType = refreshResult.ok ? (failedCount > 0 ? 'warning' : 'success') : blackoutsReady ? 'warning' : 'error';

      if (failedCount > 0) {
        showTransientToast(`成功删除 ${deletedCount} 个档期锁定，${failedCount} 个删除失败${suffix}`, feedbackType);
      } else {
        showTransientToast(`成功删除 ${deletedCount} 个档期锁定${suffix}`, feedbackType);
      }
    } catch (error: any) {
      showTransientToast(`批量删除失败：${error?.message || '未知错误'}`, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const toggleSelection = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    if (selectedIds.length === blackouts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(blackouts.map(b => b.id));
    }
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setIsSelectionMode(false);
  };

  const scheduleRows = useMemo(
    () =>
      blackouts.map((item) => ({
        ...item,
        selected: selectedIds.includes(item.id),
        dateLabel: formatScheduleDateLabel(item.date),
        weekdayLabel: formatScheduleWeekdayLabel(item.date),
      })),
    [blackouts, selectedIds]
  );

  const scheduleTotalCount = blackouts.length;
  const scheduleSelectedCount = selectedIds.length;
  const scheduleAllSelected = scheduleTotalCount > 0 && scheduleSelectedCount === scheduleTotalCount;

  useEffect(() => {
    const idSet = new Set(blackouts.map((item) => item.id));
    setSelectedIds((prev) => {
      const next = prev.filter((id) => idSet.has(id));
      return next.length === prev.length ? prev : next;
    });

    if (isSelectionMode && blackouts.length === 0) {
      setIsSelectionMode(false);
    }
  }, [blackouts, isSelectionMode]);

  return (
    <div className="admin-mobile-page schedule-admin-page space-y-5 pt-6">
      {/* 页面标题 */}
      <div className="module-intro schedule-page-intro">
        <h1 className="module-title" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          档期管理
        </h1>
        <p className="module-desc">管理不可预约的日期，支持批量操作</p>
      </div>

      {/* Toast 提示 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 right-4 z-50"
          >
            <div className={`px-6 py-3 rounded-2xl shadow-lg flex items-center gap-3 ${
              showToast.type === 'success' ? 'bg-green-500' :
              showToast.type === 'error' ? 'bg-red-500' : 'bg-orange-500'
            } text-white`}>
              {showToast.type === 'success' && <CheckCircle className="w-5 h-5" />}
              {showToast.type === 'error' && <AlertCircle className="w-5 h-5" />}
              {showToast.type === 'warning' && <AlertCircle className="w-5 h-5" />}
              <span>{showToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="booking-panel schedule-panel">
        <div className="booking-toolbar schedule-toolbar">
          {!isSelectionMode && (
            <div className="booking-toolbar-actions booking-toolbar-actions--right schedule-toolbar-actions">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost"
                onClick={() => void refreshSchedulePanel()}
                disabled={loading || blackoutsRefreshing || submitting || actionLoading}
              >
                {blackoutsRefreshing ? '刷新中...' : '刷新'}
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost"
                onClick={() => setIsSelectionMode(true)}
                disabled={loading || blackoutsRefreshing || actionLoading || scheduleTotalCount === 0}
              >
                批量删除
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--primary"
                onClick={() => setShowAddModal(true)}
                disabled={loading || blackoutsRefreshing || actionLoading}
              >
                + 锁定档期
              </button>
            </div>
          )}

          {isSelectionMode && (
            <div className="booking-toolbar-actions booking-toolbar-actions--selection">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                onClick={selectAll}
                disabled={actionLoading || blackoutsRefreshing}
              >
                {scheduleAllSelected ? '取消全选' : '全选'} ({scheduleSelectedCount}/{scheduleTotalCount})
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--danger booking-pill-btn--compact"
                onClick={handleBatchDelete}
                disabled={actionLoading || blackoutsRefreshing || scheduleSelectedCount === 0}
              >
                删除 ({scheduleSelectedCount})
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                onClick={clearSelection}
                disabled={actionLoading || blackoutsRefreshing}
              >
                取消
              </button>
            </div>
          )}
        </div>

        {blackoutsError && blackoutsReady ? (
          <div className="schedule-inline-error">
            <p className="schedule-inline-error__text">{blackoutsError}</p>
          </div>
        ) : null}

        {loading && !blackoutsReady ? (
          <div className="schedule-state-card schedule-state-card--loading">
            <div className="schedule-state-card__top">
              <div className="schedule-state-card__badge schedule-state-card__badge--loading">
                <div className="h-6 w-6 animate-spin rounded-full border-[3px] border-[#FFC857] border-t-transparent"></div>
              </div>
              <div className="schedule-state-card__copy">
                <p className="schedule-state-card__title">正在加载档期列表</p>
                <p className="schedule-state-card__desc">请稍候，正在同步最新锁定档期</p>
              </div>
            </div>
          </div>
        ) : !blackoutsReady ? (
          <div className="schedule-state-card schedule-state-card--error">
            <div className="schedule-state-card__top">
              <div className="schedule-state-card__badge schedule-state-card__badge--error">
                <AlertCircle className="schedule-state-card__icon" />
              </div>
              <div className="schedule-state-card__copy">
                <p className="schedule-state-card__title">档期列表加载失败</p>
                <p className="schedule-state-card__desc">{blackoutsError || '请稍后重试或手动刷新档期列表'}</p>
              </div>
            </div>
            <div className="schedule-state-card__footer">
              <button
                type="button"
                className="schedule-state-card__action"
                onClick={() => void refreshSchedulePanel()}
                disabled={loading || blackoutsRefreshing}
              >
                {loading || blackoutsRefreshing ? '重新加载中...' : '重新加载'}
              </button>
            </div>
          </div>
        ) : scheduleRows.length === 0 ? (
          <div className="schedule-state-card schedule-state-card--empty">
            <div className="schedule-state-card__top">
              <div className="schedule-state-card__badge schedule-state-card__badge--success">
                <CheckCircle className="schedule-state-card__icon" />
              </div>
              <div className="schedule-state-card__copy">
                <p className="schedule-state-card__title">暂无锁定档期</p>
                <p className="schedule-state-card__desc">当前没有未来锁定日期，可随时新增或刷新列表</p>
              </div>
            </div>
            <div className="schedule-state-card__footer">
              <button
                type="button"
                className="schedule-state-card__action"
                onClick={() => void refreshSchedulePanel()}
                disabled={loading || blackoutsRefreshing}
              >
                {blackoutsRefreshing ? '刷新中...' : '刷新列表'}
              </button>
            </div>
          </div>
        ) : (
          <div className="schedule-cards">
            <AnimatePresence initial={false}>
              {scheduleRows.map((item) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  className={`schedule-card ${isSelectionMode ? (item.selected ? 'schedule-card--selected' : 'schedule-card--selectable') : ''}`}
                  onClick={() => isSelectionMode && toggleSelection(item.id)}
                >
                  <div className="schedule-card__head">
                    <div className="schedule-card__left">
                      {isSelectionMode && (
                        <div className={`schedule-card__check ${item.selected ? 'schedule-card__check--active' : ''}`}>
                          {item.selected ? <span>✓</span> : null}
                        </div>
                      )}
                      <div className="schedule-card__icon">
                        <span>📅</span>
                      </div>
                      <div className="schedule-card__date-wrap">
                        <span className="schedule-card__date">{item.dateLabel}</span>
                        <span className="schedule-card__weekday">{item.weekdayLabel}</span>
                      </div>
                    </div>
                    {!isSelectionMode && (
                      <button
                        type="button"
                        className="schedule-card__delete"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(item.id);
                        }}
                        disabled={actionLoading}
                        aria-label="删除档期"
                      >
                        <Trash2 className="schedule-card__delete-icon" />
                      </button>
                    )}
                  </div>

                  {item.reason ? (
                    <div className="schedule-card__reason">
                      <span className="schedule-card__reason-text">{item.reason}</span>
                    </div>
                  ) : null}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* 添加档期模态框 */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="booking-modal-mask"
            onClick={() => !submitting && setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="booking-modal booking-modal--form"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-modal__head">
                <h3 className="booking-modal__title">锁定档期</h3>
                <button
                  type="button"
                  className="booking-modal__close"
                  onClick={() => !submitting && setShowAddModal(false)}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="booking-modal__body">
                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    开始日期 <span className="booking-modal__required">*</span>
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className={`schedule-modal-picker ${formData.startDate ? '' : 'schedule-modal-picker--placeholder'}`}
                  />
                </div>

                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    结束日期（可选，用于批量添加）
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className={`schedule-modal-picker ${formData.endDate ? '' : 'schedule-modal-picker--placeholder'}`}
                  />
                </div>

                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    锁定原因（可选）
                  </label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="例如：春节假期、个人事务等"
                    className="booking-modal__input"
                  />
                </div>

                <button
                  type="button"
                  className="booking-modal__submit"
                  onClick={handleAdd}
                  disabled={submitting}
                >
                  {submitting ? '添加中...' : '确认添加'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除确认对话框 */}
      <AnimatePresence>
        {deletingBlackout && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="booking-modal-mask"
            onClick={() => !actionLoading && setDeletingBlackout(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="booking-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-confirm-modal__head">
                <div className="booking-confirm-modal__icon schedule-confirm-icon--warn">
                  <AlertCircle className="w-8 h-8 text-orange-600" />
                </div>
                <span className="booking-confirm-modal__title">删除档期锁定</span>
                <span className="booking-confirm-modal__desc">
                  确定要删除
                  <span className="booking-confirm-modal__accent schedule-confirm-accent--warn"> {deletingBlackout ? formatScheduleDateLabel(deletingBlackout.date) : ''} </span>
                  的锁定吗？
                </span>
                <div className="schedule-confirm-warn">
                  <span>删除后该日期将恢复可预约状态</span>
                </div>
              </div>
              <div className="booking-confirm-modal__actions">
                <button
                  type="button"
                  onClick={() => setDeletingBlackout(null)}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDelete}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn schedule-confirm-btn--warn"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量删除确认对话框 */}
      <AnimatePresence>
        {showBatchDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="booking-modal-mask"
            onClick={() => !actionLoading && setShowBatchDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="booking-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-confirm-modal__head">
                <div className="booking-confirm-modal__icon booking-confirm-modal__icon--danger">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <span className="booking-confirm-modal__title">批量删除档期</span>
                <span className="booking-confirm-modal__desc">
                  确定要删除选中的 <span className="booking-confirm-modal__accent">{scheduleSelectedCount}</span> 个档期锁定吗？
                </span>
                <div className="booking-confirm-modal__warn">
                  <span>⚠ 此操作不可撤销</span>
                </div>
              </div>
              <div className="booking-confirm-modal__actions">
                <button
                  type="button"
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmBatchDelete}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--danger"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


