'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Phone, MessageSquare, Camera } from 'lucide-react';
import ActiveBookingTicket from '@/components/ActiveBookingTicket';

// 约拍类型
const bookingTypes = [
  { id: 1, name: '互勉', emoji: '🤝' },
  { id: 2, name: '常规约拍', emoji: '📸' },
  { id: 3, name: '婚礼跟拍', emoji: '💒' },
  { id: 4, name: '活动记录', emoji: '🎉' },
];

// 模拟活跃订单数据
const mockActiveBooking: {
  id: string;
  date: string;
  type: string;
  location: string;
  phone: string;
  status: string;
} | null = null; // 设置为 null 表示无活跃订单，设置为对象表示有活跃订单
// const mockActiveBooking = {
//   id: 'booking-123',
//   date: '2026-02-15',
//   type: '常规约拍',
//   location: '江边公园',
//   phone: '138****8888',
//   status: 'pending',
// };

export default function BookingPage() {
  const [formData, setFormData] = useState({
    date: '',
    type: '',
    location: '',
    phone: '',
    wechat: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeBooking, setActiveBooking] = useState(mockActiveBooking);
  const [isCanceling, setIsCanceling] = useState(false);

  // 模拟服务端状态检查
  useEffect(() => {
    // TODO: 实际项目中，这里应该调用 Supabase 查询
    // const checkActiveBooking = async () => {
    //   const { data } = await supabase
    //     .from('bookings')
    //     .select('*')
    //     .eq('user_id', user.id)
    //     .in('status', ['pending', 'confirmed'])
    //     .single();
    //   setActiveBooking(data);
    // };
    // checkActiveBooking();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    // 模拟提交延迟
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);

      // 3秒后模拟创建订单并刷新页面状态
      setTimeout(() => {
        setShowSuccess(false);
        // 模拟创建订单
        setActiveBooking({
          id: 'booking-' + Date.now(),
          date: formData.date,
          type: formData.type,
          location: formData.location,
          phone: formData.phone,
          status: 'pending',
        });
        // TODO: 实际项目中使用 router.refresh()
        // router.refresh();
      }, 3000);
    }, 1000);
  };

  const handleCancel = async () => {
    setIsCanceling(true);

    // 模拟取消延迟
    setTimeout(() => {
      setIsCanceling(false);
      setActiveBooking(null);
      setFormData({
        date: '',
        type: '',
        location: '',
        phone: '',
        wechat: '',
        notes: '',
      });
      // TODO: 实际项目中调用 Supabase 更新状态
      // await supabase
      //   .from('bookings')
      //   .update({ status: 'cancelled' })
      //   .eq('id', activeBooking.id);
      // router.refresh();
    }, 1000);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleTypeSelect = (typeName: string) => {
    setFormData({
      ...formData,
      type: typeName,
    });
  };

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none whitespace-nowrap" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
            {activeBooking ? '我的预约' : '约拍邀请'}
          </h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">📝 写下你的约拍便利贴 📝</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-4 pb-20 [&::-webkit-scrollbar]:hidden">
        {/* 场景 A: 有活跃订单 - 显示票据 */}
        {activeBooking && (
          <ActiveBookingTicket
            booking={activeBooking}
            onCancel={handleCancel}
            isCanceling={isCanceling}
          />
        )}

        {/* 场景 B: 无活跃订单 - 显示表单 */}
        {!activeBooking && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {showSuccess ? (
              <div className="bg-[#fffdf5] rounded-2xl p-8 shadow-lg text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className="inline-flex items-center justify-center w-20 h-20 bg-[#FFC857]/20 rounded-full mb-4"
                >
                  <Camera className="w-10 h-10 text-[#FFC857]" />
                </motion.div>
                <h2 className="text-xl font-bold text-[#5D4037] mb-2">
                  邀请函已发送！
                </h2>
                <p className="text-sm text-[#5D4037]/70">
                  我们会尽快与您联系确认详情 ✨
                </p>
              </div>
            ) : (
              <div className="relative">
                {/* 和纸胶带装饰 */}
                <div className="absolute -top-4 left-8 right-8 h-8 bg-[#FFC857]/30 backdrop-blur-sm rounded-sm shadow-sm rotate-[-0.5deg]" />

                {/* 格纹信纸卡片 */}
                <div
                  className="bg-[#fffdf5] rounded-2xl p-6 shadow-lg relative"
                  style={{
                    backgroundImage: `
                      linear-gradient(0deg, transparent 24px, rgba(93, 64, 55, 0.05) 25px, transparent 26px),
                      linear-gradient(90deg, transparent 24px, rgba(93, 64, 55, 0.05) 25px, transparent 26px)
                    `,
                    backgroundSize: '25px 25px',
                  }}
                >
                  {/* 简笔画涂鸦 */}
                  <div className="absolute top-4 right-4 text-[#FFC857]/40">
                    <Camera className="w-8 h-8" strokeWidth={1.5} />
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-8">
                    {/* 约拍类型 - 紧凑型网格 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-3 text-[#5D4037]">
                        <span>约拍类型</span>
                      </label>
                      <div className="grid grid-cols-2 gap-3">
                        {bookingTypes.map((type) => (
                          <motion.button
                            key={type.id}
                            type="button"
                            onClick={() => handleTypeSelect(type.name)}
                            whileTap={{ scale: 0.95 }}
                            className={`
                              flex items-center justify-center gap-2 p-3 rounded-2xl text-center transition-all
                              ${formData.type === type.name
                                ? 'bg-[#FFC857] shadow-[2px_2px_0px_#5D4037] border-2 border-[#5D4037]'
                                : 'bg-transparent border-2 border-dashed border-[#5D4037]/30 hover:border-[#5D4037]/50'
                              }
                            `}
                          >
                            <span className="text-xl">{type.emoji}</span>
                            <span className={`text-sm font-medium ${formData.type === type.name ? 'text-[#5D4037]' : 'text-[#5D4037]/60'}`}>
                              {type.name}
                            </span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* 日期选择 - 下划线风格 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <Calendar className="w-4 h-4" />
                        <span>约拍日期</span>
                      </label>
                      <input
                        type="date"
                        name="date"
                        value={formData.date}
                        onChange={handleChange}
                        required
                        className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] focus:shadow-[0_3px_12px_rgba(255,200,87,0.25)] transition-all"
                      />
                    </div>

                    {/* 约拍地点 - 下划线风格 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <MapPin className="w-4 h-4" />
                        <span>约拍地点</span>
                      </label>
                      <input
                        type="text"
                        name="location"
                        placeholder="例如：江边公园"
                        value={formData.location}
                        onChange={handleChange}
                        required
                        className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all"
                      />
                    </div>

                    {/* 联系方式 - 下划线风格 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                          <Phone className="w-4 h-4" />
                          <span>手机号</span>
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          placeholder="手机号"
                          value={formData.phone}
                          onChange={handleChange}
                          required
                          className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                          <MessageSquare className="w-4 h-4" />
                          <span>微信号</span>
                        </label>
                        <input
                          type="text"
                          name="wechat"
                          placeholder="微信号"
                          value={formData.wechat}
                          onChange={handleChange}
                          className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all"
                        />
                      </div>
                    </div>

                    {/* 备注 - 下划线风格 */}
                    <div>
                      <label className="text-sm font-medium mb-2 text-[#5D4037] block">
                        备注说明
                      </label>
                      <textarea
                        name="notes"
                        placeholder="有什么特殊要求或想法，都可以告诉我..."
                        value={formData.notes}
                        onChange={handleChange}
                        rows={4}
                        className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all resize-none"
                      />
                    </div>

                    {/* 提交按钮 - 果冻按钮 */}
                    <motion.button
                      type="submit"
                      disabled={isSubmitting}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      className="w-full py-4 bg-[#FFC857] text-[#5D4037] font-bold rounded-2xl shadow-[0_4px_0px_#5D4037] hover:shadow-[0_2px_0px_#5D4037] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isSubmitting ? '发送中...' : (
                        <>
                          <span>✨ 发送约拍邀请</span>
                          <span>✨</span>
                        </>
                      )}
                    </motion.button>

                    {/* 提示信息 */}
                    <div className="pt-4 border-t border-[#5D4037]/10">
                      <p className="text-xs text-[#5D4037]/50 text-center">
                        💡 每个用户同时只能有一个进行中的预约
                      </p>
                      <p className="text-xs text-[#5D4037]/50 text-center mt-1">
                        请至少提前一天预约，约拍当天不可预约
                      </p>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
