'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Phone, MessageSquare, Camera } from 'lucide-react';
import ActiveBookingTicket from '@/components/ActiveBookingTicket';
import MapPicker from '@/components/MapPicker';
import { createClient } from '@/lib/supabase/client';

interface BookingType {
  id: number;
  name: string;
  emoji: string;
}

interface AllowedCity {
  id: number;
  city_name: string;
  province: string;
}

const emojiMap: Record<string, string> = {
  '互勉': '🤝',
  '常规约拍': '📸',
  '婚礼跟拍': '💒',
  '活动记录': '🎉',
};

export default function BookingPage() {
  const [bookingTypes, setBookingTypes] = useState<BookingType[]>([]);
  const [allowedCities, setAllowedCities] = useState<AllowedCity[]>([]);
  const [formData, setFormData] = useState({
    typeId: 0,
    location: '',
    latitude: 0,
    longitude: 0,
    cityName: '',
    phone: '',
    wechat: '',
    notes: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);

  useEffect(() => {
    loadBookingTypes();
    loadAllowedCities();
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

  const loadAllowedCities = async () => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('allowed_cities')
      .select('*')
      .eq('is_active', true);

    if (!error && data) {
      setAllowedCities(data);
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

    if (!formData.location || !formData.latitude || !formData.longitude) {
      setError('请选择约拍地点');
      setIsSubmitting(false);
      return;
    }

    if (!formData.phone) {
      setError('请填写手机号');
      setIsSubmitting(false);
      return;
    }

    if (!formData.wechat) {
      setError('请填写微信号');
      setIsSubmitting(false);
      return;
    }

    // 验证城市
    if (!formData.cityName) {
      setError('无法识别城市，请重新选择地点');
      setIsSubmitting(false);
      return;
    }

    // 城市验证：标准化城市名称进行匹配
    const normalizeCity = (name: string) => {
      return name
        .replace(/市$/, '')
        .replace(/自治区$/, '')
        .replace(/特别行政区$/, '')
        .trim();
    };

    const userCity = normalizeCity(formData.cityName);
    const isCityAllowed = allowedCities.some(city => {
      const allowedCity = normalizeCity(city.city_name);
      return userCity === allowedCity ||
             formData.cityName === city.city_name ||
             userCity.includes(allowedCity) ||
             allowedCity.includes(userCity);
    });

    if (!isCityAllowed) {
      setError(`抱歉，当前仅支持以下城市的预约：${allowedCities.map(c => c.city_name).join('、')}`);
      setIsSubmitting(false);
      return;
    }

    // 计算预约日期（至少提前一天，即明天）
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const bookingDate = tomorrow.toISOString().split('T')[0];

    // 检查该日期是否已有预约（一天只能有一个用户申请）
    const { data: existingBookings, error: checkError } = await supabase
      .from('bookings')
      .select('id')
      .eq('booking_date', bookingDate)
      .in('status', ['pending', 'confirmed']);

    if (checkError) {
      setError('检查预约状态失败，请稍后重试');
      setIsSubmitting(false);
      return;
    }

    if (existingBookings && existingBookings.length > 0) {
      setError('抱歉，该日期已有预约，请选择其他日期或稍后再试');
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await supabase
      .from('bookings')
      .insert({
        user_id: user.id,
        type_id: formData.typeId,
        booking_date: bookingDate, // 至少提前一天预约（明天），实际时间通过微信沟通
        location: formData.location,
        latitude: formData.latitude,
        longitude: formData.longitude,
        city_name: formData.cityName,
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
        typeId: 0,
        location: '',
        latitude: 0,
        longitude: 0,
        cityName: '',
        phone: '',
        wechat: '',
        notes: '',
      });
    } else {
      setError(error.message);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleTypeSelect = (typeId: number) => {
    setFormData({
      ...formData,
      typeId,
    });
  };

  const handleMapSelect = async (location: string, lat: number, lng: number) => {
    // 使用高德地图逆地理编码获取城市信息
    const AMap = (window as any).AMap;
    if (AMap) {
      AMap.plugin('AMap.Geocoder', () => {
        const geocoder = new AMap.Geocoder();
        geocoder.getAddress([lng, lat], (status: string, result: any) => {
          if (status === 'complete' && result.info === 'OK') {
            const addressComponent = result.regeocode.addressComponent;
            const cityName = addressComponent.city || addressComponent.province;

            setFormData({
              ...formData,
              location,
              latitude: lat,
              longitude: lng,
              cityName,
            });
          }
        });
      });
    }
    setShowMapPicker(false);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
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
      {/* 手账风页头 - 使用弹性布局适配不同屏幕 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-3 py-2.5 flex items-center gap-2">
          <h1 className="flex-1 text-lg sm:text-xl font-bold text-[#5D4037] leading-tight truncate" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>{activeBooking ? '我的预约' : '约拍邀请'}</h1>
          <div className="flex-shrink-0 px-2 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 max-w-[45%]">
            <p className="text-[9px] sm:text-[10px] font-bold text-[#8D6E63] tracking-tight truncate">📝 写下你的约拍便利贴 📝</p>
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
                  我们会尽快通过微信与您联系确认约拍时间 ✨
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
                    {/* 约拍类型 - 手账风下拉框 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <Camera className="w-4 h-4" />
                        <span>约拍类型</span>
                      </label>
                      <div className="relative">
                        <select
                          value={formData.typeId}
                          onChange={(e) => handleTypeSelect(Number(e.target.value))}
                          required
                          className="w-full px-4 py-3 pr-10 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] font-medium appearance-none cursor-pointer focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all text-base"
                          style={{
                            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 24 24' fill='none' stroke='%235D4037' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E")`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: 'right 12px center',
                            backgroundSize: '20px'
                          }}
                        >
                          <option value={0} disabled>请选择约拍类型...</option>
                          {bookingTypes.map((type) => (
                            <option key={type.id} value={type.id}>
                              {type.emoji} {type.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* 约拍地点 - 可点击卡片 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <MapPin className="w-4 h-4" />
                        <span>约拍地点</span>
                        {allowedCities.length > 0 && (
                          <span className="text-xs text-[#5D4037]/50">
                            (限{allowedCities.map(c => c.city_name).join('、')})
                          </span>
                        )}
                      </label>
                      <button
                        type="button"
                        onClick={() => setShowMapPicker(true)}
                        className="w-full px-4 py-3 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-left transition-all hover:border-[#FFC857] hover:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] group"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            {formData.location ? (
                              <div>
                                <p className="text-[#5D4037] font-medium">{formData.location}</p>
                                {formData.cityName && (
                                  <p className="text-xs text-[#5D4037]/60 mt-0.5">📍 {formData.cityName}</p>
                                )}
                              </div>
                            ) : (
                              <p className="text-[#5D4037]/40">点击在地图上选择约拍地点...</p>
                            )}
                          </div>
                          <MapPin className="w-5 h-5 text-[#FFC857] group-hover:scale-110 transition-transform" />
                        </div>
                      </button>
                    </div>

                    {/* 联系方式 - 下划线风格 */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                          <Phone className="w-4 h-4" />
                          <span>手机号 *</span>
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          placeholder="手机号"
                          value={formData.phone}
                          onChange={handleChange}
                          required
                          className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all text-base"
                        />
                      </div>
                      <div>
                        <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                          <MessageSquare className="w-4 h-4" />
                          <span>微信号 *</span>
                        </label>
                        <input
                          type="text"
                          name="wechat"
                          placeholder="微信号"
                          value={formData.wechat}
                          onChange={handleChange}
                          required
                          className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all text-base"
                        />
                      </div>
                    </div>

                    {/* 备注 - 下划线风格 */}
                    <div>
                      <label className="text-sm font-medium mb-2 text-[#5D4037] block">
                        备注说明（选填）
                      </label>
                      <textarea
                        name="notes"
                        placeholder="有什么特殊要求或想法，都可以告诉我..."
                        value={formData.notes}
                        onChange={handleChange}
                        rows={4}
                        className="w-full px-0 py-2 bg-transparent border-0 border-b-2 border-[#5D4037]/20 text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:border-b-[3px] transition-all resize-none text-base"
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
                        📅 约拍时间将通过微信与摄影师沟通确定
                      </p>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>

      {/* 地图选择器弹窗 */}
      <AnimatePresence>
        {showMapPicker && (
          <MapPicker
            onSelect={handleMapSelect}
            onClose={() => setShowMapPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
