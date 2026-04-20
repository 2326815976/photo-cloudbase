'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, Phone, MessageSquare, Camera } from 'lucide-react';
import ActiveBookingTicket from '@/components/ActiveBookingTicket';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import MiniProgramRecoveryScreen, { PAGE_LOADING_COPY } from '@/components/MiniProgramRecoveryScreen';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });
import CustomSelect from '@/components/CustomSelect';
import DatePicker from '@/components/DatePicker';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import PrimaryPageShell from '@/components/shell/PrimaryPageShell';
import { createClient } from '@/lib/cloudbase/client';
import { getDateAfterDaysUTC8, getTodayUTC8 } from '@/lib/utils/date-helpers';
import { clampChinaMobileInput, isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

interface BookingType {
  id: number;
  name: string;
  emoji: string;
}

interface AllowedCity {
  id: number;
  city_name: string;
  province: string;
  latitude?: number | null;
  longitude?: number | null;
}

const emojiMap: Record<string, string> = {
  '互勉': '🤝',
  '常规约拍': '📸',
  '婚礼跟拍': '💒',
  '活动记录': '🎉',
};

function inferCityNameFromLocation(location: string): string {
  const normalized = String(location ?? '').replace(/\s+/g, '');
  if (!normalized) return '';

  const municipalityMatch = normalized.match(/(北京市|上海市|天津市|重庆市)/);
  if (municipalityMatch) {
    return municipalityMatch[1];
  }

  const cityLikeMatch = normalized.match(/([\u4e00-\u9fa5]{2,}?(?:自治州|地区|盟|市))/);
  if (cityLikeMatch) {
    return cityLikeMatch[1];
  }

  const provinceMatch = normalized.match(/([\u4e00-\u9fa5]{2,}?(?:省|自治区|特别行政区))/);
  if (provinceMatch) {
    return provinceMatch[1];
  }

  return '';
}

function normalizeCityNameForMatch(name: string): string {
  return String(name ?? '')
    .replace(/市$/, '')
    .replace(/自治区$/, '')
    .replace(/特别行政区$/, '')
    .trim();
}

function toRad(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusKm = 6371;
  const latDiff = toRad(lat2 - lat1);
  const lngDiff = toRad(lng2 - lng1);

  const a =
    Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function inferNearestAllowedCityByCoordinates(
  lat: number,
  lng: number,
  allowedCities: AllowedCity[],
  maxDistanceKm: number = 120
): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return '';
  }

  let nearestCityName = '';
  let minDistance = Number.POSITIVE_INFINITY;

  allowedCities.forEach((city) => {
    const cityLat = Number(city.latitude);
    const cityLng = Number(city.longitude);
    if (!Number.isFinite(cityLat) || !Number.isFinite(cityLng)) {
      return;
    }

    const distance = calculateDistanceKm(lat, lng, cityLat, cityLng);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCityName = city.city_name;
    }
  });

  if (!nearestCityName || minDistance > maxDistanceKm) {
    return '';
  }

  return nearestCityName;
}

export default function BookingPage() {
  const router = useRouter();
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
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeBooking, setActiveBooking] = useState<any>(null);
  const [isCanceling, setIsCanceling] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMapPicker, setShowMapPicker] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const { title: managedTitle, subtitle: managedSubtitle } = useManagedPageMeta(
    'booking',
    activeBooking ? '我的预约' : '约拍邀请',
    '📝 写下你的约拍便利贴 📝'
  );

  const checkLoginStatus = async () => {
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      return;
    }

    const { data: { user } } = await dbClient.auth.getUser();

    if (!user) {
      setShowLoginPrompt(true);
      setLoading(false);
      return;
    }

    await Promise.all([
      loadUserProfile(user.id),
      checkActiveBooking(user.id),
    ]);
  };

  useEffect(() => {
    // 检查登录状态
    void checkLoginStatus();
    loadBookingTypes();
    loadAllowedCities();
    loadBlockedDates();
  }, []);

  const loadBookingTypes = async () => {
    const dbClient = createClient();
    if (!dbClient) return;
    const { data, error } = await dbClient
      .from('booking_types')
      .select('*')
      .eq('is_active', true)
      .order('id');

    if (!error && data) {
      setBookingTypes(data.map((type: any) => ({
        id: type.id,
        name: type.name
      })));
    }
  };

  const loadAllowedCities = async () => {
    const dbClient = createClient();
    if (!dbClient) return;
    const { data, error } = await dbClient
      .from('allowed_cities')
      .select('*')
      .eq('is_active', true);

    if (!error && data) {
      setAllowedCities(data);
    }
  };

  const loadUserProfile = async (userId: string) => {
    const dbClient = createClient();
    if (!dbClient) return;

    const { data: profile } = await dbClient
      .from('profiles')
      .select('phone, wechat')
      .eq('id', userId)
      .single();

    if (profile) {
      setFormData(prev => ({
        ...prev,
        phone: profile.phone || '',
        wechat: profile.wechat || '',
      }));
    }
  };

  const loadBlockedDates = async () => {
    try {
      const response = await fetch('/api/blocked-dates');
      const data = await response.json();
      setBlockedDates(data.dates || []);
    } catch (error) {
      console.error('加载不可用日期失败:', error);
      setBlockedDates([]);
    }
  };

  const checkActiveBooking = async (userId: string) => {
    setLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      return;
    }

    const { data, error } = await dbClient
      .from('bookings')
      .select('id, type_id, booking_date, location, phone, wechat, status')
      .eq('user_id', userId)
      .in('status', ['pending', 'confirmed', 'in_progress'])
      .maybeSingle();

    if (!error && data) {
      let bookingTypeName = '';
      if (data.type_id) {
        const { data: bookingType } = await dbClient
          .from('booking_types')
          .select('name')
          .eq('id', data.type_id)
          .maybeSingle();

        bookingTypeName = bookingType?.name || '';
      }

      setActiveBooking({
        id: data.id,
        date: data.booking_date,
        type: bookingTypeName,
        location: data.location,
        phone: data.phone,
        wechat: data.wechat,
        status: data.status,
      });
    } else {
      setActiveBooking(null);
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const dbClient = createClient();
    if (!dbClient) {
      setError('服务初始化失败，请刷新页面后重试');
      setIsSubmitting(false);
      return;
    }
    const { data: { user } } = await dbClient.auth.getUser();

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

    const normalizedPhone = normalizeChinaMobile(formData.phone);
    if (!isValidChinaMobile(normalizedPhone)) {
      setError('请输入有效的手机号');
      setIsSubmitting(false);
      return;
    }

    if (!formData.wechat) {
      setError('请填写微信号');
      setIsSubmitting(false);
      return;
    }

    const inferredCityByCoordinates = inferNearestAllowedCityByCoordinates(
      formData.latitude,
      formData.longitude,
      allowedCities
    );
    const resolvedCityName = String(formData.cityName || inferredCityByCoordinates || '').trim();

    // 验证城市
    if (!resolvedCityName) {
      setError('无法识别城市，请重新选择地点');
      setIsSubmitting(false);
      return;
    }

    const userCity = normalizeCityNameForMatch(resolvedCityName);
    const isCityAllowed = allowedCities.some(city => {
      const allowedCity = normalizeCityNameForMatch(city.city_name);
      // 优先精确匹配，避免误匹配（如"北京"匹配"北京市"）
      if (userCity === allowedCity || resolvedCityName === city.city_name) {
        return true;
      }
      // 降级到包含匹配，但要求匹配长度足够（避免"海"匹配"上海"）
      if (userCity.length >= 2 && allowedCity.length >= 2) {
        return userCity.includes(allowedCity) || allowedCity.includes(userCity);
      }
      return false;
    });

    if (!isCityAllowed) {
      setError(`抱歉，当前仅支持以下城市的预约：${allowedCities.map(c => c.city_name).join('、')}`);
      setIsSubmitting(false);
      return;
    }

    // 验证日期是否被选择
    if (!selectedDate) {
      setError('请选择预约日期');
      setIsSubmitting(false);
      return;
    }

    const minDate = getDateAfterDaysUTC8(1);
    const maxDate = getDateAfterDaysUTC8(30);
    if (selectedDate < minDate || selectedDate > maxDate) {
      setError('预约日期超出可选范围（最早明天，最晚30天内）');
      setIsSubmitting(false);
      return;
    }

    if (blockedDates.includes(selectedDate)) {
      setError('该日期当前不可预约，请选择其他日期');
      setIsSubmitting(false);
      return;
    }

    // 🔒 安全验证：调用数据库函数检查日期是否可预约（包括锁定日期和已有预约检查）
    const { data: isAvailable, error: availabilityError } = await dbClient
      .rpc('check_date_availability', { target_date: selectedDate });

    if (availabilityError) {
      console.error('Date availability check error:', availabilityError);
      setError('检查日期可用性失败，请稍后重试');
      setIsSubmitting(false);
      return;
    }

    if (!isAvailable) {
      setError('抱歉，该日期不可预约（可能已被锁定或已有预约），请选择其他日期');
      setIsSubmitting(false);
      return;
    }

    const { data, error } = await dbClient
      .from('bookings')
      .insert({
        user_id: user.id,
        type_id: formData.typeId,
        booking_date: selectedDate,
        location: formData.location,
        latitude: formData.latitude,
        longitude: formData.longitude,
        city_name: resolvedCityName,
        phone: normalizedPhone,
        wechat: formData.wechat,
        notes: formData.notes,
        status: 'pending'
      })
      .select()
      .single();

    setIsSubmitting(false);

    if (error) {
      const errorCode = String((error as any)?.code ?? '');
      const errorMessage = String(error.message ?? '');
      const isDuplicateError =
        errorCode === '23505' ||
        errorCode === '1062' ||
        /duplicate entry/i.test(errorMessage);

      if (isDuplicateError) {
        const lowerMessage = errorMessage.toLowerCase();
        const isDateConflict =
          lowerMessage.includes('uk_bookings_active_date') ||
          lowerMessage.includes('active_booking_date');
        const isUserConflict =
          lowerMessage.includes('uk_bookings_active_user') ||
          lowerMessage.includes('active_booking_user_id');

        if (isDateConflict && !isUserConflict) {
          setError('抱歉，该日期已被预约，请选择其他日期');
        } else if (isUserConflict && !isDateConflict) {
          setError('您已有进行中的预约，请先取消或等待完成');
        } else {
          setError('预约失败：该日期已被预约或您已有进行中的预约，请稍后重试');
        }
      } else {
        setError(error.message);
      }
    } else {
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        checkActiveBooking(user.id);
      }, 3000);
    }
  };

  const handleCancel = async () => {
    if (!activeBooking) return;

    setIsCanceling(true);
    const dbClient = createClient();
    if (!dbClient) {
      setError('服务初始化失败，请刷新页面后重试');
      setIsCanceling(false);
      return;
    }

    const { data: { user } } = await dbClient.auth.getUser();
    if (!user) {
      setError('请先登录后再操作');
      setIsCanceling(false);
      return;
    }

    const today = getTodayUTC8();
    const canCancel =
      (activeBooking.status === 'pending' || activeBooking.status === 'confirmed') &&
      activeBooking.date > today;

    if (!canCancel) {
      setError('当前预约状态不可取消（仅待确认/已确认且预约日期在未来可取消）');
      setIsCanceling(false);
      return;
    }

    const { data: cancelledBooking, error } = await dbClient
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', activeBooking.id)
      .eq('user_id', user.id)
      .in('status', ['pending', 'confirmed'])
      .gt('booking_date', today)
      .select('id')
      .maybeSingle();

    setIsCanceling(false);

    if (!error && cancelledBooking) {
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
    } else if (!error && !cancelledBooking) {
      setError('当前预约已不可取消，请刷新后查看最新状态');
    } else {
      setError(error?.message || '取消失败，请稍后重试');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === 'phone' ? clampChinaMobileInput(value) : value,
    }));
  };

  const handleTypeSelect = (typeId: number) => {
    setFormData({
      ...formData,
      typeId,
    });
  };

  const handleMapSelect = (location: string, lat: number, lng: number, meta?: { cityName?: string; province?: string }) => {
    const metaCityName = String(meta?.cityName ?? '').trim();
    const metaProvince = String(meta?.province ?? '').trim();
    const inferredCityName = inferCityNameFromLocation(location);
    const nearestAllowedCity = inferNearestAllowedCityByCoordinates(lat, lng, allowedCities);

    setShowMapPicker(false);
    setFormData((prev) => ({
      ...prev,
      location,
      latitude: lat,
      longitude: lng,
      cityName: metaCityName || metaProvince || inferredCityName || nearestAllowedCity || prev.cityName || '',
    }));
  };

  if (loading) {
    return (
      <MiniProgramRecoveryScreen
        title={PAGE_LOADING_COPY.title}
        description={PAGE_LOADING_COPY.description}
        className="h-screen"
      />
    );
  }

  return (
    <PrimaryPageShell
      title={managedTitle}
      badge={managedSubtitle || undefined}
      className="h-full w-full"
      contentClassName="min-h-0"
    >
      <PreviewAwareScrollArea className="flex-1 overflow-y-auto px-6 pt-4 [&::-webkit-scrollbar]:hidden">
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
                <h2 className="text-xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  收到你的邀请啦！
                </h2>
                <p className="text-sm text-[#5D4037]/70" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  我们会尽快添加你的微信 {formData.wechat} 与您联系确认约拍时间 ✨
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
                    {/* 约拍类型 - 自定义下拉框 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <Camera className="w-4 h-4" />
                        <span>约拍类型</span>
                      </label>
                      <CustomSelect
                        value={formData.typeId}
                        onChange={(value) => handleTypeSelect(value)}
                        options={bookingTypes.map(type => ({
                          value: type.id,
                          label: type.name
                        }))}
                        placeholder="请选择约拍类型..."
                        required
                      />
                    </div>

                    {/* 约拍日期 - 日期选择器 */}
                    <div>
                      <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                        <Camera className="w-4 h-4" />
                        <span>约拍日期 *</span>
                      </label>
                      <DatePicker
                        value={selectedDate}
                        onChange={setSelectedDate}
                        minDate={getDateAfterDaysUTC8(1)}
                        maxDate={getDateAfterDaysUTC8(30)}
                        blockedDates={blockedDates}
                        placeholder="请选择约拍日期"
                      />
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
                              <p className="text-[#5D4037]/40">点击选择约拍地点...</p>
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
                          maxLength={11}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          autoComplete="tel"
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
                        placeholder="有什么要求或想法，都可以告诉我..."
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


      {/* 地图选择器弹窗 */}
      <AnimatePresence>
        {showMapPicker && (
          <MapPicker
            onSelect={handleMapSelect}
            onClose={() => setShowMapPicker(false)}
          />
        )}
      </AnimatePresence>

      {/* 登录提示弹窗 */}
      <AnimatePresence>
        {showLoginPrompt && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[#FFFBF0] rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Camera className="w-8 h-8 text-[#FFC857]" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-3" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                  ✨ 需要登录才能预约哦
                </h3>
                <p className="text-sm text-[#5D4037]/70 leading-relaxed">
                  登录后即可提交约拍邀请，我们会通过微信与您联系确认时间~
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowLoginPrompt(false)}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors"
                >
                  随便看看
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    router.push('/login');
                  }}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#FFC857] text-[#5D4037] shadow-md hover:shadow-lg transition-all"
                >
                  💛 去登录
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </PreviewAwareScrollArea>
    </PrimaryPageShell>
  );
}
