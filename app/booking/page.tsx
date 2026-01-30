'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Phone, MessageSquare, Camera } from 'lucide-react';

// 约拍类型
const bookingTypes = [
  { id: 1, name: '互勉', emoji: '🤝' },
  { id: 2, name: '常规约拍', emoji: '📸' },
  { id: 3, name: '婚礼跟拍', emoji: '💒' },
  { id: 4, name: '活动记录', emoji: '🎉' },
];

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);

      setTimeout(() => {
        setShowSuccess(false);
        setFormData({
          date: '',
          type: '',
          location: '',
          phone: '',
          wechat: '',
          notes: '',
        });
      }, 3000);
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
      {/* 标题区域 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none px-6 pt-8 pb-4 text-center"
      >
        <h1 className="text-2xl font-bold text-[#5D4037] mb-2">
          约拍邀请函
        </h1>
        <p className="text-sm text-[#5D4037]/60">
          写下你的约拍便利贴 ✨
        </p>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-6 pb-32 [&::-webkit-scrollbar]:hidden">
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
                邀请函已发送！💌
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
                  {/* 约拍类型 - 贴纸选项卡 */}
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
                            relative p-4 rounded-xl text-center transition-all
                            ${formData.type === type.name
                              ? 'bg-[#FFC857] shadow-[2px_2px_0px_#5D4037] rotate-1 border-2 border-[#5D4037]'
                              : 'bg-transparent border-2 border-dashed border-[#5D4037]/30 hover:border-[#5D4037]/50'
                            }
                          `}
                        >
                          <div className="text-2xl mb-1">{type.emoji}</div>
                          <div className={`text-sm font-medium ${formData.type === type.name ? 'text-[#5D4037]' : 'text-[#5D4037]/60'}`}>
                            {type.name}
                          </div>
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
                      className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] focus:outline-none focus:border-[#FFC857] transition-colors"
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
                      className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] transition-colors"
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
                        className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] transition-colors"
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
                        className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] transition-colors"
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
                      className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] transition-colors resize-none"
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
      </div>
    </div>
  );
}
