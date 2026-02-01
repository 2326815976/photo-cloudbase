'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Calendar, MapPin, Phone, MessageSquare, Camera, Clock } from 'lucide-react';
import ActiveBookingTicket from '@/components/ActiveBookingTicket';
import { createClient } from '@/lib/supabase/client';

interface BookingType {
  id: number;
  name: string;
  emoji: string;
}

const emojiMap: Record<string, string> = {
  '互勉': '🤝',
  '常规约拍': '📸',
  '婚礼跟拍': '💒',
  '活动记录': '🎉',
};

export default function BookingPage() {
  const [bookingTypes, setBookingTypes] = useState<BookingType[]>([]);
  const [formData, setFormData] = useState({
    date: '',
    typeId: 0,
    typeName: '',
    location: '',
    phone: '',
    wechat: '',
    notes: '',
    timeStart: '09:00',
    timeEnd: '17:00',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    loadBookingTypes();
    checkActiveBooking();

    // 设置高德地图安全密钥
    (window as any)._AMapSecurityConfig = {
      securityJsCode: process.env.NEXT_PUBLIC_AMAP_SECURITY_CODE,
    };

    // 加载高德地图脚本
    const script = document.createElement('script');
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${process.env.NEXT_PUBLIC_AMAP_KEY}`;
    script.async = true;
    document.head.appendChild(script);

    return () => {
      if (document.head.contains(script)) {
        document.head.removeChild(script);
      }
    };
  }, []);

  const loadBookingTypes = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('booking_types')
      .select('*')
      .eq('is_active', true)
      .order('id');

    if (!error && data) {
      setBookingTypes(data.map((type: any) => ({
        id: type.id,
        name: type.name,
        emoji: emojiMap[type.name] || '📸'
      })));
    }
  };

  const checkActiveBooking = async () => {
    setLoading(true);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      const { data, error } = await supabase
        .from('bookings')
        .select(`
          *,
          booking_types(name)
        `)
        .eq('user_id', user.id)
        .in('status', ['pending', 'confirmed'])
        .single();

      if (!error && data) {
        setActiveBooking({
          id: data.id,
          date: data.booking_date,
          type: data.booking_types?.name || '',
          location: data.location,
          phone: data.phone,
          status: data.status,
        });
      }
    }
    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setError('请先登录');
      setIsSubmitting(false);
      return;
    }

    // 表单验证
    if (!formData.typeId || formData.typeId === 0) {
      setError('请选择约拍类型');
      setIsSubmitting(false);
      return;
    }

    if (!formData.date) {
      setError('请选择约拍日期');
      setIsSubmitting(false);
      return;
    }

    // 验证日期不能是过去的日期
    const selectedDate = new Date(formData.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (selectedDate < today) {
      setError('不能选择过去的日期');
      setIsSubmitting(false);
      return;
    }

    // 验证至少提前一天预约
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (selectedDate < tomorrow) {
      setError('请至少提前一天预约');
      setIsSubmitting(false);
      return;
    }

    // 验证时间段
    if (formData.timeStart && formData.timeEnd) {
      if (formData.timeStart >= formData.timeEnd) {
        setError('结束时间必须晚于开始时间');
        setIsSubmitting(false);
        return;
      }
    }

    // 检查日期是否可用
    const { data: isAvailable, error: availError } = await supabase
      .rpc('check_date_availability', { target_date: formData.date });

    if (availError) {
      setError('检查日期可用性失败');
      setIsSubmitting(false);
      return;
    }

    if (!isAvailable) {
      setError('该日期已被预约或已被锁定，请选择其他日期');
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        type_id: formData.typeId,
        booking_date: formData.date,
        time_slot_start: formData.timeStart,
        time_slot_end: formData.timeEnd,
        location: formData.location,
        phone: formData.phone,
        wechat: formData.wechat,
        notes: formData.notes,
        status: 'pending'
      })
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      setError(error.message);
    } else {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        checkActiveBooking();
      }, 3000);
    }
  };

  const handleCancel = async () => {
    if (!activeBooking) return;

    // 检查是否是当天预约
    const bookingDate = new Date(activeBooking.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    bookingDate.setHours(0, 0, 0, 0);

    if (bookingDate <= today) {
      setError('预约日期当天已无法自行取消，请联系摄影师');
      return;
    }

    setIsCanceling(true);
    const supabase = createClient();

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', activeBooking.id);

    setIsCanceling(false);

    if (!error) {
      setActiveBooking(null);
      setFormData({
        date: '',
        typeId: 0,
        typeName: '',
        location: '',
        phone: '',
        wechat: '',
        notes: '',
        timeStart: '09:00',
        timeEnd: '17:00',
      });
    } else {
      // 友好的错误提示
      if (error.message.includes('预约日期当天已无法自行取消')) {
        setError('预约日期当天已无法自行取消，请联系摄影师');
      } else {
        setError(error.message);
      }
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleTypeSelect = (typeId: number, typeName: string) => {
    setFormData({
      ...formData,
      typeId,
      typeName,
    });
  };

  const handleGetLocation = () => {
    if (!('geolocation' in navigator)) {
      setError('您的设备不支持定位功能');
      return;
    }

    setIsLocating(true);
    setError('');

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;

        // 使用高德地图逆地理编码
        if ((window as any).AMap) {
          (window as any).AMap.plugin('AMap.Geocoder', () => {
            const geocoder = new (window as any).AMap.Geocoder();
            geocoder.getAddress([longitude, latitude], (status: string, result: any) => {
              console.log('AMap geocoding status:', status);
              console.log('AMap geocoding result:', result);
              setIsLocating(false);
              if (status === 'complete' && result.info === 'OK') {
                const address = result.regeocode.formattedAddress;
                setFormData({
                  ...formData,
                  location: address
                });
              } else {
                console.log('解析失败 - status:', status, 'result.info:', result?.info);
                setError('地址解析失败，请手动输入');
              }
            });
          });
        } else {
          setIsLocating(false);
          // 如果高德地图未加载，直接显示坐标
          setFormData({
            ...formData,
            location: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`
          });
        }
      },
      (error) => {
        setIsLocating(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError('定位权限被拒绝，请在设置中允许定位');
            break;
          case error.POSITION_UNAVAILABLE:
            setError('定位信息不可用');
            break;
          case error.TIMEOUT:
            setError('定位请求超时');
            break;
          default:
            setError('定位失败，请手动输入地点');
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
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
              <Camera className="w-8 h-8 text-[#FFC857]" />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-lg font-medium text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
              加载中...
            </p>
            <p className="text-sm text-[#5D4037]/60">
              正在准备约拍信息
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

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
                <h2 className="text-xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
                  收到你的邀请啦！
                </h2>
                <p className="text-sm text-[#5D4037]/70" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
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
                            onClick={() => handleTypeSelect(type.id, type.name)}
                            whileTap={{ scale: 0.95 }}
                            className={`
                              flex items-center justify-center gap-2 p-3 rounded-2xl text-center transition-all
                              ${formData.typeId === type.id
                                ? 'bg-[#FFC857] shadow-[2px_2px_0px_#5D4037] border-2 border-[#5D4037]'
                                : 'bg-transparent border-2 border-dashed border-[#5D4037]/30 hover:border-[#5D4037]/50'
                              }
                            `}
                          >
                            <span className="text-xl">{type.emoji}</span>
                            <span className={`text-sm font-medium ${formData.typeId === type.id ? 'text-[#5D4037]' : 'text-[#5D4037]/60'}`}>
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

                    {/* 时间段选择 - 下划线风格 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                          <Clock className="w-4 h-4" />
                          <span>开始时间</span>
                        </label>
                        <input
                          type="time"
                          name="timeStart"
                          value={formData.timeStart}
                          onChange={handleChange}
                          required
                          className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                          <Clock className="w-4 h-4" />
                          <span>结束时间</span>
                        </label>
                        <input
                          type="time"
                          name="timeEnd"
                          value={formData.timeEnd}
                          onChange={handleChange}
                          required
                          className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all"
                        />
                      </div>
                    </div>

                    {/* 约拍地点 - 下划线风格 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <MapPin className="w-4 h-4" />
                        <span>约拍地点</span>
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          name="location"
                          placeholder="例如：江边公园"
                          value={formData.location}
                          onChange={handleChange}
                          required
                          className="flex-1 px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all"
                        />
                        <button
                          type="button"
                          onClick={handleGetLocation}
                          disabled={isLocating}
                          className="px-3 py-1 bg-[#FFC857] text-[#5D4037] rounded-lg text-sm font-medium hover:bg-[#FFB347] transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                        >
                          {isLocating ? '定位中...' : '📍 定位'}
                        </button>
                      </div>
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

                    {/* 错误提示 */}
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-3 bg-red-50 border border-red-200 rounded-xl"
                      >
                        <p className="text-sm text-red-600 text-center">{error}</p>
                      </motion.div>
                    )}

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
