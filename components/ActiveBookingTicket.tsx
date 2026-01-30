'use client';

import { motion } from 'framer-motion';
import { Calendar, MapPin, Camera, X } from 'lucide-react';

interface ActiveBookingTicketProps {
  booking: {
    id: string;
    date: string;
    type: string;
    location: string;
    phone: string;
    status: string;
  };
  onCancel: () => void;
  isCanceling: boolean;
}

export default function ActiveBookingTicket({ booking, onCancel, isCanceling }: ActiveBookingTicketProps) {
  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto"
    >
      {/* 票据卡片 */}
      <div className="relative bg-[#fffdf5] rounded-3xl shadow-2xl overflow-hidden border-2 border-[#5D4037]/20">
        {/* 顶部装饰条 */}
        <div className="h-3 bg-gradient-to-r from-[#FFC857] via-[#FFD700] to-[#FFC857]" />

        {/* 票据内容 */}
        <div className="p-8">
          {/* 标题 */}
          <div className="text-center mb-6">
            <motion.div
              animate={{ rotate: [0, 10, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block mb-3"
            >
              <Camera className="w-12 h-12 text-[#FFC857]" />
            </motion.div>
            <h2 className="text-2xl font-bold text-[#5D4037] mb-2">
              约拍确认票
            </h2>
            <p className="text-sm text-[#5D4037]/60">
              {booking.status === 'pending' ? '等待确认中' : '已确认'}
            </p>
          </div>

          {/* 虚线分隔 */}
          <div className="border-t-2 border-dashed border-[#5D4037]/20 my-6" />

          {/* 详情信息 */}
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <Calendar className="w-5 h-5 text-[#FFC857] flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-[#5D4037]/60 mb-1">约拍日期</div>
                <div className="text-base font-medium text-[#5D4037]">
                  {formatDate(booking.date)}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Camera className="w-5 h-5 text-[#FFC857] flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-[#5D4037]/60 mb-1">约拍类型</div>
                <div className="text-base font-medium text-[#5D4037]">
                  {booking.type}
                </div>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-[#FFC857] flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs text-[#5D4037]/60 mb-1">约拍地点</div>
                <div className="text-base font-medium text-[#5D4037]">
                  {booking.location}
                </div>
              </div>
            </div>
          </div>

          {/* 虚线分隔 */}
          <div className="border-t-2 border-dashed border-[#5D4037]/20 my-6" />

          {/* 提示信息 */}
          <div className="bg-[#FFC857]/10 rounded-2xl p-4 mb-6">
            <p className="text-xs text-[#5D4037]/70 text-center leading-relaxed">
              📸 我们会尽快与您联系确认详情<br />
              请保持手机 {booking.phone} 畅通
            </p>
          </div>

          {/* 取消按钮 */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onCancel}
            disabled={isCanceling}
            className="w-full py-3 bg-[#5D4037]/10 hover:bg-[#5D4037]/20 text-[#5D4037] font-medium rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <X className="w-4 h-4" />
            <span>{isCanceling ? '取消中...' : '取消预约'}</span>
          </motion.button>
        </div>

        {/* 底部装饰 - 撕边效果 */}
        <div className="h-6 bg-[#FFFBF0] relative">
          <div className="absolute inset-0 flex justify-around">
            {[...Array(12)].map((_, i) => (
              <div
                key={i}
                className="w-4 h-4 bg-[#fffdf5] rounded-full -translate-y-2"
              />
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
