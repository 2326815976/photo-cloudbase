'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Phone, MessageSquare, Sparkles } from 'lucide-react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Card from '@/components/ui/Card';

// 模拟数据：约拍类型
const bookingTypes = [
  { id: 1, name: '互勉' },
  { id: 2, name: '常规约拍' },
  { id: 3, name: '婚礼跟拍' },
  { id: 4, name: '活动记录' },
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

    // 模拟提交延迟
    setTimeout(() => {
      setIsSubmitting(false);
      setShowSuccess(true);

      // 3秒后重置表单
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  return (
    <div className="min-h-screen px-4 py-8">
      <div className="max-w-md mx-auto">
        {/* 标题 */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold text-foreground mb-2">
            预约约拍
          </h1>
          <p className="text-sm text-foreground/60">
            记录美好瞬间，从这里开始 📸
          </p>
        </motion.div>

        {/* 表单卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card>
            {showSuccess ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-12"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', delay: 0.2 }}
                  className="inline-flex items-center justify-center w-20 h-20 bg-primary/20 rounded-full mb-4"
                >
                  <Sparkles className="w-10 h-10 text-primary" />
                </motion.div>
                <h2 className="text-xl font-bold text-foreground mb-2">
                  预约成功！
                </h2>
                <p className="text-sm text-foreground/70">
                  我们会尽快与您联系确认详情 ✨
                </p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 日期选择 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground">
                    <Calendar className="w-4 h-4" />
                    <span>约拍日期</span>
                  </label>
                  <Input
                    type="date"
                    name="date"
                    value={formData.date}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* 约拍类型 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground">
                    <Sparkles className="w-4 h-4" />
                    <span>约拍类型</span>
                  </label>
                  <select
                    name="type"
                    value={formData.type}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 rounded-2xl border-2 border-border-light bg-card text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all duration-200"
                  >
                    <option value="">请选择约拍类型</option>
                    {bookingTypes.map((type) => (
                      <option key={type.id} value={type.name}>
                        {type.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 约拍地点 */}
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground">
                    <MapPin className="w-4 h-4" />
                    <span>约拍地点</span>
                  </label>
                  <Input
                    type="text"
                    name="location"
                    placeholder="例如：江边公园"
                    value={formData.location}
                    onChange={handleChange}
                    required
                  />
                </div>

                {/* 联系方式 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground">
                      <Phone className="w-4 h-4" />
                      <span>手机号</span>
                    </label>
                    <Input
                      type="tel"
                      name="phone"
                      placeholder="手机号"
                      value={formData.phone}
                      onChange={handleChange}
                      required
                    />
                  </div>
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium mb-2 text-foreground">
                      <MessageSquare className="w-4 h-4" />
                      <span>微信号</span>
                    </label>
                    <Input
                      type="text"
                      name="wechat"
                      placeholder="微信号"
                      value={formData.wechat}
                      onChange={handleChange}
                    />
                  </div>
                </div>

                {/* 备注 */}
                <div>
                  <label className="text-sm font-medium mb-2 text-foreground block">
                    备注说明
                  </label>
                  <textarea
                    name="notes"
                    placeholder="有什么特殊要求或想法，都可以告诉我..."
                    value={formData.notes}
                    onChange={handleChange}
                    rows={4}
                    className="w-full px-4 py-3 rounded-2xl border-2 border-border-light bg-card text-foreground placeholder:text-foreground/50 focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent transition-all duration-200 resize-none"
                  />
                </div>

                {/* 提交按钮 */}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '提交中...' : '✨ 提交预约'}
                </Button>

                {/* 提示信息 */}
                <div className="pt-4 border-t border-border-light">
                  <p className="text-xs text-foreground/50 text-center">
                    💡 提示：每个用户同时只能有一个进行中的预约
                  </p>
                  <p className="text-xs text-foreground/50 text-center mt-1">
                    请至少提前一天预约，约拍当天不可预约
                  </p>
                </div>
              </form>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
