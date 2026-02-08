'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, Plus, Trash2, AlertCircle, CheckCircle } from 'lucide-react';
import { formatDateUTC8, parseDateUTC8 } from '@/lib/utils/date-helpers';

interface Blackout {
  id: number;
  date: string;
  reason: string;
  created_at: string;
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
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await supabase
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
    const supabase = createClient();
    if (!supabase) {
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

    const { error } = await supabase
      .from('booking_blackouts')
      .insert(records);

    if (!error) {
      setShowAddModal(false);
      setFormData({ startDate: '', endDate: '', reason: '' });
      loadBlackouts();
      setShowToast({ message: '档期已锁定', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `添加失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
    setSubmitting(false);
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
    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setDeletingBlackout(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('booking_blackouts')
      .delete()
      .eq('id', deletingBlackout.id);

    setActionLoading(false);
    setDeletingBlackout(null);

    if (!error) {
      loadBlackouts();
      setShowToast({ message: '档期锁定已删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
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

    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('booking_blackouts')
      .delete()
      .in('id', selectedIds);

    setActionLoading(false);

    if (!error) {
      setSelectedIds([]);
      setIsSelectionMode(false);
      loadBlackouts();
      setShowToast({ message: `成功删除 ${selectedIds.length} 个档期锁定`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `批量删除失败：${error.message}`, type: 'error' });
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FFC857] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          档期管理
        </h1>
        <p className="text-[#5D4037]/60">管理不可预约的日期，支持批量操作</p>
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

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 mb-6">
        {!isSelectionMode ? (
          <>
            <button
              onClick={() => setIsSelectionMode(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
            >
              批量删除
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
            >
              <Plus className="w-5 h-5" />
              锁定档期
            </button>
          </>
        ) : (
          <>
            <button
              onClick={selectAll}
              className="px-3 py-1.5 bg-white text-[#5D4037] rounded-full text-xs border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors whitespace-nowrap"
            >
              {selectedIds.length === blackouts.length ? '取消全选' : `全选 (${selectedIds.length}/${blackouts.length})`}
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-full text-xs font-medium hover:bg-red-600 transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              <Trash2 className="w-3.5 h-3.5" />
              删除 ({selectedIds.length})
            </button>
            <button
              onClick={clearSelection}
              className="px-3 py-1.5 bg-white text-[#5D4037] rounded-full text-xs border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors whitespace-nowrap"
            >
              取消
            </button>
          </>
        )}
      </div>

      {/* 档期列表 */}
      {blackouts.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <Calendar className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无锁定档期</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <AnimatePresence>
            {blackouts.map((blackout) => (
              <motion.div
                key={blackout.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className={`bg-white rounded-2xl p-6 shadow-sm border transition-all cursor-pointer ${
                  isSelectionMode
                    ? selectedIds.includes(blackout.id)
                      ? 'border-[#FFC857] bg-[#FFC857]/5 shadow-md'
                      : 'border-[#5D4037]/10 hover:border-[#FFC857]/50'
                    : 'border-[#5D4037]/10 hover:shadow-md'
                }`}
                onClick={() => isSelectionMode && toggleSelection(blackout.id)}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    {isSelectionMode && (
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                        selectedIds.includes(blackout.id)
                          ? 'bg-[#FFC857] border-[#FFC857]'
                          : 'border-[#5D4037]/30'
                      }`}>
                        {selectedIds.includes(blackout.id) && (
                          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    )}
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                      <Calendar className="w-6 h-6 text-red-600" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#5D4037]">
                        {parseDateUTC8(blackout.date).toLocaleDateString('zh-CN', {
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                          timeZone: 'Asia/Shanghai'
                        })}
                      </h3>
                      <p className="text-xs text-[#5D4037]/60">
                        {parseDateUTC8(blackout.date).toLocaleDateString('zh-CN', { weekday: 'long', timeZone: 'Asia/Shanghai' })}
                      </p>
                    </div>
                  </div>
                  {!isSelectionMode && (
                    <button
                      onClick={() => handleDelete(blackout.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-full transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {blackout.reason && (
                  <div className="p-3 bg-[#FFFBF0] rounded-xl">
                    <p className="text-sm text-[#5D4037]/80">{blackout.reason}</p>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* 添加档期模态框 */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !submitting && setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">锁定档期</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    开始日期 *
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    结束日期（可选，用于批量添加）
                  </label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857]"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    锁定原因（可选）
                  </label>
                  <input
                    type="text"
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="例如：春节假期、个人事务等"
                    className="w-full px-4 py-2 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857]"
                  />
                </div>
              </div>

              <div className="flex gap-2 mt-6">
                <button
                  onClick={() => setShowAddModal(false)}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleAdd}
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:bg-[#FFD700] transition-colors disabled:opacity-50"
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingBlackout(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-8 h-8 text-orange-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">删除档期锁定</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除这个档期锁定吗？
                </p>
                <div className="bg-orange-50 rounded-xl p-4 text-left">
                  <p className="text-sm text-orange-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    删除后该日期将恢复可预约状态
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingBlackout(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-full font-medium hover:bg-orange-700 transition-colors disabled:opacity-50"
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
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setShowBatchDeleteConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">批量删除档期</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除选中的 <span className="font-bold text-red-600">{selectedIds.length}</span> 个档期锁定吗？
                </p>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-sm text-red-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    此操作不可撤销！
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchDeleteConfirm(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmBatchDelete}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 transition-colors disabled:opacity-50"
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
