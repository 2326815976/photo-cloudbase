'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { Calendar, MapPin, Camera, X, MessageCircle } from 'lucide-react';
import { getTodayUTC8, parseDateUTC8 } from '@/lib/utils/date-helpers';

interface ActiveBookingTicketProps {
  booking: {
    id: string;
    date: string;
    type: string;
    location: string;
    phone: string;
    wechat?: string;
    status: string;
  };
  onCancel: () => void;
  isCanceling: boolean;
}

export default function ActiveBookingTicket({ booking, onCancel, isCanceling }: ActiveBookingTicketProps) {
  const shouldReduceMotion = useReducedMotion();
  const statusText = booking.status === 'pending'
    ? '等待确认中'
    : booking.status === 'in_progress'
      ? '进行中'
      : '已确认';

  // 格式化日期（UTC）
  const formatDate = (dateStr: string) => {
    const date = parseDateUTC8(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long',
      timeZone: 'Asia/Shanghai'
    });
  };

  const today = getTodayUTC8();
  const canCancel = (booking.status === 'pending' || booking.status === 'confirmed') && booking.date > today;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="w-full max-w-md mx-auto"
    >
      {/* 票据卡片 */}
      <div className="relative bg-[#fffdf5] rounded-2xl shadow-[0_8px_24px_rgba(93,64,55,0.15)] hover:shadow-[0_12px_32px_rgba(93,64,55,0.2)] transition-shadow duration-300 overflow-hidden border-2 border-[#5D4037]/20">
        {/* 顶部装饰条 */}
        <div className="h-3 bg-gradient-to-r from-[#FFC857] via-[#FFD700] to-[#FFC857]" />

        {/* 票据内容 */}
        <div className="p-8">
          {/* 标题 */}
          <div className="text-center mb-6">
            <motion.div
              animate={shouldReduceMotion ? { rotate: 0 } : { rotate: [0, 10, -10, 0] }}
              transition={shouldReduceMotion ? { duration: 0.2 } : { duration: 2, repeat: Infinity, repeatDelay: 3 }}
              className="inline-block mb-3"
            >
              <Camera className="w-12 h-12 text-[#FFC857]" />
            </motion.div>
            <h2 className="text-2xl font-bold text-[#5D4037] mb-2">
              约拍确认票
            </h2>
            <p className="text-sm text-[#5D4037]/60">
              {statusText}
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

          {/* 摄影师便利贴 */}
          <div className="mx-auto w-[95%] bg-[#FFF9C4] p-4 rounded-2xl shadow-sm transform rotate-1 border border-yellow-200">
            <div className="flex items-start gap-3">
              <MessageCircle className="w-5 h-5 text-[#FFC857] flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold text-[#5D4037] text-sm mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  ✨ 收到你的邀请啦！
                </p>
                <p className="text-xs text-[#8D6E63] leading-relaxed" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  摄影师正在赶来的路上... 会尽快添加你的微信{' '}
                  <span className="font-bold underline decoration-wavy decoration-[#FFC857]">
                    {booking.wechat || booking.phone}
                  </span>{' '}
                  沟通细节哦~ 💬
                </p>
              </div>
            </div>
          </div>

          {/* 取消按钮 */}
          {canCancel ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onCancel}
              disabled={isCanceling}
              className="w-full py-3 bg-[#5D4037]/10 hover:bg-[#5D4037]/20 text-[#5D4037] font-medium rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              <X className="w-4 h-4" />
              <span>{isCanceling ? '取消中...' : '取消预约'}</span>
            </motion.button>
          ) : (
            <div className="w-full py-3 bg-[#5D4037]/5 text-[#5D4037]/40 font-medium rounded-2xl flex items-center justify-center gap-2 mt-6">
              <X className="w-4 h-4" />
              <span>预约当天不可取消</span>
            </div>
          )}
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
