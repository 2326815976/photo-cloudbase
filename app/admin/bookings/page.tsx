'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, Clock, MapPin, Phone, User, X, Check, Calendar as CalendarIcon, Plus, Trash2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Booking {
  id: string;
  user_id: string;
  booking_date: string;
  time_slot_start: string;
  time_slot_end: string;
  location: string;
  phone: string;
  wechat: string;
  notes: string;
  status: string;
  created_at: string;
  profiles: {
    name: string;
    email: string;
  };
  booking_types: {
    name: string;
  };
}

interface Blackout {
  id: number;
  date: string;
  reason: string;
  created_at: string;
}

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<'bookings' | 'schedule'>('bookings');

  // 预约管理状态
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'finished' | 'cancelled'>('all');

  // 档期管理状态
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({ startDate: '', endDate: '', reason: '' });
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [cancelingBooking, setCancelingBooking] = useState<Booking | null>(null);
  const [deletingBlackout, setDeletingBlackout] = useState<Blackout | null>(null);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    loadBookings();
    loadBlackouts();
  }, [filter]);

  // 预约管理函数
  const loadBookings = async () => {
    setBookingsLoading(true);
    const supabase = createClient();

    let query = supabase
      .from('bookings')
      .select(`
        *,
        profiles(name, email),
        booking_types(name)
      `)
      .order('booking_date', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (!error && data) {
      setBookings(data as any);
    }
    setBookingsLoading(false);
  };

  const handleCancel = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (booking) {
      setCancelingBooking(booking);
    }
  };

  const confirmCancel = async () => {
    if (!cancelingBooking) return;

    setActionLoading(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', cancelingBooking.id);

    setActionLoading(false);
    setCancelingBooking(null);

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已取消', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `取消失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleConfirm = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', id);

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已确认', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `确认失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleFinish = async (id: string) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'finished' })
      .eq('id', id);

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已完成', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `完成失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'confirmed':
        return 'bg-green-100 text-green-800';
      case 'finished':
        return 'bg-blue-100 text-blue-800';
      case 'cancelled':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '待确认';
      case 'confirmed':
        return '已确认';
      case 'finished':
        return '已完成';
      case 'cancelled':
        return '已取消';
      default:
        return status;
    }
  };

  // 档期管理函数
  const loadBlackouts = async () => {
    setScheduleLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('booking_blackouts')
      .select('*')
      .order('date', { ascending: true });

    if (!error && data) {
      setBlackouts(data);
    }
    setScheduleLoading(false);
  };

  const handleAdd = async () => {
    if (!formData.startDate) {
      setShowToast({ message: '请选择开始日期', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setSubmitting(true);
    const supabase = createClient();

    const dates: string[] = [];
    const start = new Date(formData.startDate);
    const end = formData.endDate ? new Date(formData.endDate) : start;

    if (end < start) {
      setShowToast({ message: '结束日期不能早于开始日期', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      setSubmitting(false);
      return;
    }

    const current = new Date(start);
    while (current <= end) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
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
    setSelectedIds(blackouts.map(b => b.id));
  };

  const clearSelection = () => {
    setSelectedIds([]);
    setIsSelectionMode(false);
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
          预约管理 📅
        </h1>
        <p className="text-sm text-[#5D4037]/60">管理用户预约申请和档期安排</p>
      </div>

      {/* Tab切换 */}
      <div className="flex gap-2 border-b border-[#5D4037]/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('bookings')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'bookings'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          预约列表
          {activeTab === 'bookings' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('schedule')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'schedule'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          档期管理
          {activeTab === 'schedule' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
      </div>

      {/* 预约列表内容 */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          {/* 筛选器 */}
          <div className="flex gap-2 overflow-x-auto pb-2">
            {[
              { key: 'all', label: '全部' },
              { key: 'pending', label: '待确认' },
              { key: 'confirmed', label: '已确认' },
              { key: 'finished', label: '已完成' },
              { key: 'cancelled', label: '已取消' },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key as any)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  filter === item.key
                    ? 'bg-[#FFC857] text-[#5D4037] shadow-md'
                    : 'bg-white text-[#5D4037]/60 border border-[#5D4037]/10 hover:bg-[#5D4037]/5'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* 预约列表 */}
          {bookingsLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <Calendar className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
              <p className="text-[#5D4037]/60">暂无预约数据</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {bookings.map((booking) => (
                  <motion.div
                    key={booking.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#5D4037]">{booking.profiles?.name || '未知用户'}</h3>
                          <p className="text-sm text-[#5D4037]/60">{booking.profiles?.email}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                        {getStatusText(booking.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4">
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <Calendar className="w-4 h-4 text-[#FFC857]" />
                        <span>{booking.booking_date}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <Clock className="w-4 h-4 text-[#FFC857]" />
                        <span>{booking.time_slot_start} - {booking.time_slot_end}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <MapPin className="w-4 h-4 text-[#FFC857]" />
                        <span>{booking.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <Phone className="w-4 h-4 text-[#FFC857]" />
                        <span>{booking.phone}</span>
                      </div>
                    </div>

                    {booking.booking_types && (
                      <div className="mb-4">
                        <span className="px-3 py-1 bg-[#FFC857]/20 text-[#5D4037] text-xs rounded-full">
                          {booking.booking_types.name}
                        </span>
                      </div>
                    )}

                    {booking.notes && (
                      <div className="mb-4 p-3 bg-[#FFFBF0] rounded-xl">
                        <p className="text-sm text-[#5D4037]/80">{booking.notes}</p>
                      </div>
                    )}

                    {booking.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirm(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          确认预约
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          取消预约
                        </button>
                      </div>
                    )}

                    {booking.status === 'confirmed' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFinish(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          完成预约
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          取消预约
                        </button>
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* 档期管理内容 */}
      {activeTab === 'schedule' && (
        <div className="space-y-6">
          {/* 操作按钮 */}
          <div className="flex justify-end gap-2">
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
                  className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                >
                  全选 ({selectedIds.length}/{blackouts.length})
                </button>
                <button
                  onClick={handleBatchDelete}
                  disabled={selectedIds.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  删除选中 ({selectedIds.length})
                </button>
                <button
                  onClick={clearSelection}
                  className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors"
                >
                  取消
                </button>
              </>
            )}
          </div>

          {/* 档期列表 */}
          {scheduleLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : blackouts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <CalendarIcon className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
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
                          <CalendarIcon className="w-6 h-6 text-red-600" />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#5D4037]">
                            {new Date(blackout.date).toLocaleDateString('zh-CN', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                            })}
                          </h3>
                          <p className="text-xs text-[#5D4037]/60">
                            {new Date(blackout.date).toLocaleDateString('zh-CN', { weekday: 'long' })}
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
        </div>
      )}

      {/* 添加档期锁定弹窗 */}
      <AnimatePresence>
        {showAddModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowAddModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">锁定档期</h2>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    开始日期 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    min={today}
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    结束日期（可选，不填则只锁定单日）
                  </label>
                  <input
                    type="date"
                    min={formData.startDate || today}
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    原因（可选）
                  </label>
                  <textarea
                    value={formData.reason}
                    onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                    placeholder="例如：休假、已有安排等"
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none resize-none"
                  />
                </div>

                <button
                  onClick={handleAdd}
                  disabled={submitting}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {submitting ? '添加中...' : '确认锁定'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 取消预约确认对话框 */}
      <AnimatePresence>
        {cancelingBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setCancelingBooking(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">取消预约</h3>
                <p className="text-sm text-[#5D4037]/80">
                  确定要取消这个预约吗？
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCancelingBooking(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  返回
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '取消中...' : '确认取消'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 删除档期确认对话框 */}
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
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CalendarIcon className="w-8 h-8 text-orange-600" />
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
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-orange-600 text-white rounded-full font-medium hover:bg-orange-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量删除档期确认对话框 */}
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
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
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
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmBatchDelete}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast通知 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-lg backdrop-blur-sm ${
              showToast.type === 'success'
                ? 'bg-green-500/95 text-white'
                : showToast.type === 'warning'
                ? 'bg-orange-500/95 text-white'
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : showToast.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="font-medium">{showToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
