'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Plus, Trash2, AlertCircle } from 'lucide-react';
import DatePicker from '@/components/DatePicker';

interface BlockedDate {
  id: number;
  date: string;
  reason: string | null;
  created_at: string;
}

export default function SchedulePage() {
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    loadBlockedDates();
  }, []);

  const loadBlockedDates = async () => {
    try {
      const response = await fetch('/api/admin/blocked-dates');
      const data = await response.json();

      if (response.ok) {
        setBlockedDates(data.data || []);
      } else {
        setError(data.error || '加载失败');
      }
    } catch (err) {
      setError('网络错误');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    if (!selectedDate) {
      setError('请选择日期');
      return;
    }

    setIsAdding(true);
    setError('');

    try {
      const response = await fetch('/api/admin/blocked-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date: selectedDate, reason: reason || null })
      });

      const data = await response.json();

      if (response.ok) {
        setSelectedDate(null);
        setReason('');
        loadBlockedDates();
      } else {
        setError(data.error || '添加失败');
      }
    } catch (err) {
      setError('网络错误');
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个锁定日期吗？')) return;

    try {
      const response = await fetch(`/api/admin/blocked-dates/${id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        loadBlockedDates();
      } else {
        const data = await response.json();
        setError(data.error || '删除失败');
      }
    } catch (err) {
      setError('网络错误');
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-[#FFC857] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* 页面标题 */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
          档期管理
        </h1>
        <p className="text-[#5D4037]/60">管理不可预约的日期</p>
      </div>

      {/* 错误提示 */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-2xl flex items-start gap-3"
        >
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-red-700">{error}</p>
        </motion.div>
      )}

      {/* 添加锁定日期 */}
      <div className="bg-[#fffdf5] rounded-2xl p-6 shadow-lg mb-8 border-2 border-[#5D4037]/20">
        <div className="flex items-center gap-2 mb-4">
          <Plus className="w-5 h-5 text-[#FFC857]" />
          <h2 className="text-xl font-bold text-[#5D4037]">添加锁定日期</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#5D4037] mb-2">
              选择日期 *
            </label>
            <DatePicker
              value={selectedDate}
              onChange={setSelectedDate}
              blockedDates={blockedDates.map(d => d.date)}
              placeholder="选择要锁定的日期..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-[#5D4037] mb-2">
              锁定原因（可选）
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：春节假期、个人事务等"
              className="w-full px-4 py-3 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all"
            />
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAdd}
            disabled={isAdding || !selectedDate}
            className="w-full py-3 bg-[#FFC857] hover:bg-[#FFD700] text-white font-medium rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            <span>{isAdding ? '添加中...' : '添加锁定日期'}</span>
          </motion.button>
        </div>
      </div>

      {/* 已锁定日期列表 */}
      <div className="bg-[#fffdf5] rounded-2xl p-6 shadow-lg border-2 border-[#5D4037]/20">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-5 h-5 text-[#FFC857]" />
          <h2 className="text-xl font-bold text-[#5D4037]">已锁定日期</h2>
          <span className="text-sm text-[#5D4037]/60">({blockedDates.length})</span>
        </div>

        {blockedDates.length === 0 ? (
          <div className="text-center py-12 text-[#5D4037]/40">
            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p>暂无锁定日期</p>
          </div>
        ) : (
          <div className="space-y-3">
            {blockedDates.map((item) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-[#5D4037]/10 hover:border-[#FFC857]/50 transition-all"
              >
                <div className="flex-1">
                  <p className="font-medium text-[#5D4037]">
                    {formatDate(item.date)}
                  </p>
                  {item.reason && (
                    <p className="text-sm text-[#5D4037]/60 mt-1">
                      {item.reason}
                    </p>
                  )}
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => handleDelete(item.id)}
                  className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                  title="删除"
                >
                  <Trash2 className="w-5 h-5" />
                </motion.button>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
