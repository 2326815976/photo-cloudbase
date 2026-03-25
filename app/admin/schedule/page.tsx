'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, AlertCircle, CheckCircle, X } from 'lucide-react';
import { formatDateUTC8, parseDateUTC8 } from '@/lib/utils/date-helpers';

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

export default function SchedulePage() {
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [deletingBlackout, setDeletingBlackout] = useState<Blackout | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBlackouts();
  }, []);

  const loadBlackouts = async () => {
    setLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await dbClient
      .from('booking_blackouts')
      .select('*')
      .order('date', { ascending: true });

    if (!error && data) {
      setBlackouts(data);
    }
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!formData.startDate) {
      setShowToast({ message: '请选择开始日期', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setSubmitting(true);
    const dbClient = createClient();
    if (!dbClient) {
      setSubmitting(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const dates: string[] = [];
    const start = parseDateUTC8(formData.startDate);
    const end = formData.endDate ? parseDateUTC8(formData.endDate) : start;

    if (end < start) {
      setShowToast({ message: '结束日期不能早于开始日期', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      setSubmitting(false);
      return;
    }

    const current = new Date(start);
    while (current <= end) {
      dates.push(formatDateUTC8(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }

    const records = dates.map(date => ({
      date,
      reason: formData.reason || '管理员锁定',
    }));

    try {
      const { data: existingRows, error: existingError } = await dbClient
        .from('booking_blackouts')
        .select('date')
        .in('date', dates);

      if (existingError) {
        throw existingError;
      }

      const existingSet = new Set(
        (existingRows || []).map((row: any) => String(row.date ?? '').trim()).filter(Boolean)
      );

      const newRecords = records.filter((record) => !existingSet.has(record.date));
      if (newRecords.length === 0) {
        setShowToast({ message: '所选日期均已锁定，无需重复添加', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        setSubmitting(false);
        return;
      }

      const { error } = await dbClient
        .from('booking_blackouts')
        .insert(newRecords);

      if (error) {
        const code = String((error as any)?.code ?? '').trim();
        const message = String(error.message ?? '').toLowerCase();
        if (code === '23505' || code === '1062' || message.includes('duplicate entry')) {
          setShowToast({ message: '部分日期已被其他管理员锁定，请刷新后重试', type: 'warning' });
        } else {
          setShowToast({ message: `添加失败：${error.message}`, type: 'error' });
        }
        setTimeout(() => setShowToast(null), 3000);
        setSubmitting(false);
        await loadBlackouts();
        return;
      }

      setShowAddModal(false);
      setFormData({ startDate: '', endDate: '', reason: '' });
      await loadBlackouts();

      const skippedCount = records.length - newRecords.length;
      if (skippedCount > 0) {
        setShowToast({ message: `已锁定 ${newRecords.length} 天，跳过 ${skippedCount} 个已存在日期`, type: 'success' });
      } else {
        setShowToast({ message: '档期已锁定', type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setShowToast({ message: `添加失败：${error?.message || '未知错误'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
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
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingBlackout(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    try {
      const { data: snapshotRow, error: snapshotError } = await dbClient
        .from('booking_blackouts')
        .select('id')
        .eq('id', deletingBlackout.id)
        .maybeSingle();
      if (snapshotError) {
        throw snapshotError;
      }
      if (!snapshotRow) {
        setActionLoading(false);
        setDeletingBlackout(null);
        setShowToast({ message: '档期不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error: deleteError } = await dbClient
        .from('booking_blackouts')
        .delete()
        .eq('id', deletingBlackout.id);
      if (deleteError) {
        throw deleteError;
      }

      const { data: remainingRow, error: verifyError } = await dbClient
        .from('booking_blackouts')
        .select('id')
        .eq('id', deletingBlackout.id)
        .maybeSingle();
      if (verifyError) {
        throw verifyError;
      }
      if (remainingRow) {
        throw new Error('删除失败，请稍后重试');
      }

      setActionLoading(false);
      setDeletingBlackout(null);
      loadBlackouts();
      setShowToast({ message: '档期锁定已删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setDeletingBlackout(null);
      setShowToast({ message: `删除失败：${error?.message || '未知错误'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) {
      setShowToast({ message: '请先选择要删除的档期', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setShowBatchDeleteConfirm(true);
  };

  const confirmBatchDelete = async () => {
    setShowBatchDeleteConfirm(false);
    setActionLoading(true);

    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    try {
      const { data: selectedRows, error: snapshotError } = await dbClient
        .from('booking_blackouts')
        .select('id')
        .in('id', selectedIds);
      if (snapshotError) {
        throw snapshotError;
      }

      const rows = Array.isArray(selectedRows) ? selectedRows : [];
      const missingCount = Math.max(0, selectedIds.length - rows.length);
      if (rows.length === 0) {
        setActionLoading(false);
        setShowToast({ message: '未找到可删除档期，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const targetIds = rows.map((row: any) => Number(row.id));
      const { error: deleteError } = await dbClient
        .from('booking_blackouts')
        .delete()
        .in('id', targetIds);
      if (deleteError) {
        throw deleteError;
      }

      const { data: remainingRows, error: verifyError } = await dbClient
        .from('booking_blackouts')
        .select('id')
        .in('id', targetIds);
      if (verifyError) {
        throw verifyError;
      }

      const remainingIdSet = new Set((remainingRows || []).map((row: any) => Number(row.id)));
      const deletedCount = targetIds.filter((id) => !remainingIdSet.has(id)).length;
      if (deletedCount === 0) {
        throw new Error('批量删除失败，请稍后重试');
      }

      setActionLoading(false);
      setSelectedIds([]);
      setIsSelectionMode(false);
      loadBlackouts();

      if (remainingIdSet.size > 0) {
        setShowToast({
          message: missingCount > 0
            ? `成功删除 ${deletedCount} 个档期锁定，${remainingIdSet.size} 个删除失败，${missingCount} 个已不存在`
            : `成功删除 ${deletedCount} 个档期锁定，${remainingIdSet.size} 个删除失败`,
          type: 'warning',
        });
      } else if (missingCount > 0) {
        setShowToast({ message: `成功删除 ${deletedCount} 个档期锁定（${missingCount} 个已不存在）`, type: 'success' });
      } else {
        setShowToast({ message: `成功删除 ${deletedCount} 个档期锁定`, type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `批量删除失败：${error?.message || '未知错误'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
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
            <div className="booking-toolbar-actions booking-toolbar-actions--right">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost"
                onClick={() => setIsSelectionMode(true)}
                disabled={loading || scheduleTotalCount === 0}
              >
                批量删除
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--primary"
                onClick={() => setShowAddModal(true)}
                disabled={loading}
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
                disabled={actionLoading}
              >
                {scheduleAllSelected ? '取消全选' : '全选'} ({scheduleSelectedCount}/{scheduleTotalCount})
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--danger booking-pill-btn--compact"
                onClick={handleBatchDelete}
                disabled={actionLoading || scheduleSelectedCount === 0}
              >
                删除 ({scheduleSelectedCount})
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                onClick={clearSelection}
                disabled={actionLoading}
              >
                取消
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="py-10 text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[#FFC857] border-t-transparent"></div>
            <p className="text-sm text-[#5D4037]/60">加载中...</p>
          </div>
        ) : scheduleRows.length === 0 ? (
          <div className="booking-empty-card schedule-empty-card text-center">
            <span className="booking-empty-card__icon">📅</span>
            <p className="text-sm text-[#5D4037]/60">暂无锁定档期</p>
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


