'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, MapPin, Phone, MessageSquare, ArrowLeft, Trash2, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getTodayUTC8 } from '@/lib/utils/date-helpers';

interface Booking {
  id: string;
  booking_date: string;
  location: string;
  phone: string;
  wechat: string;
  status: 'pending' | 'confirmed' | 'in_progress' | 'finished' | 'cancelled';
  notes?: string;
  city_name?: string;
  created_at: string;
  booking_types?: { name: string };
}

const statusConfig = {
  pending: {
    label: '待确认',
    color: 'bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 border border-amber-200/50',
    emoji: '⏳',
    shadow: 'shadow-sm shadow-amber-100'
  },
  confirmed: {
    label: '已确认',
    color: 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200/50',
    emoji: '✓',
    shadow: 'shadow-sm shadow-emerald-100'
  },
  in_progress: {
    label: '进行中',
    color: 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border border-blue-200/50',
    emoji: '📸',
    shadow: 'shadow-sm shadow-blue-100'
  },
  finished: {
    label: '已完成',
    color: 'bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 border border-purple-200/50',
    emoji: '✨',
    shadow: 'shadow-sm shadow-purple-100'
  },
  cancelled: {
    label: '已取消',
    color: 'bg-gradient-to-r from-gray-50 to-slate-50 text-gray-600 border border-gray-200/50',
    emoji: '✕',
    shadow: 'shadow-sm shadow-gray-100'
  },
};

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelingId, setCancelingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadBookings();
  }, []);

  const loadBookings = async () => {
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          id, booking_date, location, city_name, phone, wechat,
          notes, status, created_at, updated_at,
          booking_types(name)
        `)
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setBookings(data);
      }
    }
    setLoading(false);
  };

  const canCancelBooking = (booking: Booking) => {
    const today = getTodayUTC8();
    // 约拍当天前，待确认和已确认状态可以取消（UTC）
    return booking.booking_date > today && (booking.status === 'pending' || booking.status === 'confirmed');
  };

  const canDeleteBooking = (booking: Booking) => {
    // 已取消和已完成的订单可以删除
    return booking.status === 'cancelled' || booking.status === 'finished';
  };

  const handleCancel = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking || !canCancelBooking(booking)) {
      return;
    }

    setCancelingId(id);
    const supabase = createClient();
    if (!supabase) {
      setCancelingId(null);
      return;
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', id);

    setCancelingId(null);

    if (!error) {
      loadBookings();
    }
  };

  const handleDelete = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking || !canDeleteBooking(booking)) {
      setShowDeleteConfirm(null);
      return;
    }

    setDeletingId(id);
    const supabase = createClient();
    if (!supabase) {
      setDeletingId(null);
      setShowDeleteConfirm(null);
      return;
    }

    const { error } = await supabase
      .from('bookings')
      .delete()
      .eq('id', id);

    setDeletingId(null);
    setShowDeleteConfirm(null);

    if (!error) {
      loadBookings();
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <Calendar className="w-8 h-8 text-[#FFC857]" />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-lg font-medium text-[#5D4037] mb-2">
              加载中...
            </p>
            <p className="text-sm text-[#5D4037]/60">正在获取预约记录</p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
          </button>
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            我的预约记录
          </h1>
        </div>
      </motion.div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20">
        {bookings.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center justify-center py-20"
          >
            <Calendar className="w-20 h-20 text-[#5D4037]/20 mb-4" />
            <p className="text-[#5D4037]/60 text-center">暂无预约记录</p>
          </motion.div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking, index) => (
              <motion.div
                key={booking.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                className="bg-white rounded-2xl p-5 shadow-sm border border-[#5D4037]/10"
              >
                {/* 状态标签 */}
                <div className="flex items-center justify-between mb-4">
                  <span className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium ${statusConfig[booking.status].color} ${statusConfig[booking.status].shadow}`}>
                    <span className="text-sm">{statusConfig[booking.status].emoji}</span>
                    <span className="font-semibold">{statusConfig[booking.status].label}</span>
                  </span>
                  <span className="text-xs text-[#5D4037]/40">
                    {new Date(booking.created_at).toLocaleDateString('zh-CN')}
                  </span>
                </div>

                {/* 预约信息 */}
                <div className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-[#FFC857] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-[#5D4037]/60">约拍类型</p>
                      <p className="text-sm font-medium text-[#5D4037]">{booking.booking_types?.name || '未知'}</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-[#FFC857] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-xs text-[#5D4037]/60">约拍地点</p>
                      <p className="text-sm font-medium text-[#5D4037]">{booking.location}</p>
                      {booking.city_name && (
                        <p className="text-xs text-[#5D4037]/50 mt-0.5">📍 {booking.city_name}</p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex items-start gap-2">
                      <Phone className="w-4 h-4 text-[#FFC857] mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#5D4037]/60">手机号</p>
                        <p className="text-sm font-medium text-[#5D4037] truncate">{booking.phone}</p>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 text-[#FFC857] mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-[#5D4037]/60">微信号</p>
                        <p className="text-sm font-medium text-[#5D4037] truncate">{booking.wechat}</p>
                      </div>
                    </div>
                  </div>

                  {booking.notes && (
                    <div className="pt-3 border-t border-[#5D4037]/10">
                      <p className="text-xs text-[#5D4037]/60 mb-1">备注</p>
                      <p className="text-sm text-[#5D4037]/80">{booking.notes}</p>
                    </div>
                  )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-[#5D4037]/10">
                  {canCancelBooking(booking) && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleCancel(booking.id)}
                      disabled={cancelingId === booking.id}
                      className="flex-1 py-2.5 px-4 bg-gradient-to-r from-orange-50 to-amber-50 text-orange-600 rounded-xl text-sm font-medium hover:from-orange-100 hover:to-amber-100 transition-all disabled:opacity-50 border border-orange-200/50 shadow-sm"
                    >
                      {cancelingId === booking.id ? '取消中...' : '取消预约'}
                    </motion.button>
                  )}

                  {canDeleteBooking(booking) && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowDeleteConfirm(booking.id)}
                      disabled={deletingId === booking.id}
                      className="flex-1 py-2.5 px-4 bg-gradient-to-r from-red-50 to-rose-50 text-red-600 rounded-xl text-sm font-medium hover:from-red-100 hover:to-rose-100 transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 border border-red-200/50 shadow-sm"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{deletingId === booking.id ? '删除中...' : '删除记录'}</span>
                    </motion.button>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* 删除确认弹窗 */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6"
            onClick={() => setShowDeleteConfirm(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-[#5D4037]">确认删除</h3>
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="w-8 h-8 rounded-full bg-[#5D4037]/10 flex items-center justify-center hover:bg-[#5D4037]/20 transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>
              </div>
              <p className="text-sm text-[#5D4037]/70 mb-6">
                删除后将无法恢复此预约记录，确定要删除吗？
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="flex-1 py-2.5 px-4 bg-[#5D4037]/10 text-[#5D4037] rounded-xl text-sm font-medium hover:bg-[#5D4037]/20 transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={() => showDeleteConfirm && handleDelete(showDeleteConfirm)}
                  className="flex-1 py-2.5 px-4 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
