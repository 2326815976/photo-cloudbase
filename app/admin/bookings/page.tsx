'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Calendar, MapPin, Phone, User, X, Check, Calendar as CalendarIcon, Plus, Trash2, CheckCircle, XCircle, AlertCircle, Camera, MessageSquare } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MapPicker from '@/components/MapPicker';
import { env } from '@/lib/env';

interface Booking {
  id: string;
  user_id: string;
  type_id: number;
  booking_date: string;
  location: string;
  latitude: number;
  longitude: number;
  city_name: string;
  phone: string;
  wechat: string;
  notes: string;
  status: string;
  created_at: string;
  profiles: {
    name: string;
    email: string;
  };
  booking_types: {
    name: string;
  };
}

interface BookingType {
  id: number;
  name: string;
  description: string;
  is_active: boolean;
  created_at: string;
}

interface AllowedCity {
  id: number;
  city_name: string;
  province: string;
  city_code: string;
  latitude?: number | null;
  longitude?: number | null;
  is_active: boolean;
  created_at: string;
}

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<'bookings' | 'types' | 'cities'>('bookings');

  // 预约管理状态
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'in_progress' | 'finished' | 'cancelled'>('all');

  const [submitting, setSubmitting] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [cancelingBooking, setCancelingBooking] = useState<Booking | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedBookingIds, setSelectedBookingIds] = useState<string[]>([]);
  const [isBookingSelectionMode, setIsBookingSelectionMode] = useState(false);
  const [showBatchDeleteBookingsConfirm, setShowBatchDeleteBookingsConfirm] = useState(false);

  // 约拍类型管理状态
  const [bookingTypes, setBookingTypes] = useState<BookingType[]>([]);
  const [typesLoading, setTypesLoading] = useState(true);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<BookingType | null>(null);
  const [typeFormData, setTypeFormData] = useState({ name: '', description: '' });
  const [deletingType, setDeletingType] = useState<BookingType | null>(null);

  // 城市管理状态
  const [cities, setCities] = useState<AllowedCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [showCityModal, setShowCityModal] = useState(false);
  const [editingCity, setEditingCity] = useState<AllowedCity | null>(null);
  const [cityFormData, setCityFormData] = useState({ city_name: '', province: '', city_code: '' });
  const [showCityMapPicker, setShowCityMapPicker] = useState(false);
  const [cityLocation, setCityLocation] = useState({ latitude: 0, longitude: 0 });
  const [deletingCity, setDeletingCity] = useState<AllowedCity | null>(null);

  useEffect(() => {
    loadBookingTypes();
    loadCities();

    // 设置高德地图安全密钥
    (window as any)._AMapSecurityConfig = {
      securityJsCode: env.AMAP_SECURITY_CODE(),
    };

    // 加载高德地图脚本（避免重复注入）
    const scriptId = 'amap-sdk-script';
    const existing = document.getElementById(scriptId);
    if (existing) return;

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = `https://webapi.amap.com/maps?v=2.0&key=${env.AMAP_KEY()}`;
    script.async = true;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    loadBookings();
  }, [filter]);

  // 预约管理函数
  const loadBookings = async () => {
    setBookingsLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setBookingsLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    // 优化查询：只选择需要的字段
    let query = supabase
      .from('bookings')
      .select(`
        id,
        user_id,
        type_id,
        booking_date,
        location,
        city_name,
        phone,
        wechat,
        notes,
        status,
        created_at,
        updated_at,
        booking_types(name)
      `)
      .order('booking_date', { ascending: false });

    if (filter !== 'all') {
      query = query.eq('status', filter);
    }

    const { data, error } = await query;

    if (error) {
      console.error('预约查询失败:', error);
      setShowToast({ message: `查询失败: ${error.message}`, type: 'error' });
    }

    if (!error && data && data.length > 0) {
      // 手动获取用户信息
      const userIds = [...new Set(data.map((b: any) => b.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, email')
        .in('id', userIds);

      // 将用户信息合并到预约数据中
      const bookingsWithProfiles = data.map((booking: any) => ({
        ...booking,
        profiles: profiles?.find((p: any) => p.id === booking.user_id) || { name: '未知用户', email: '' }
      }));

      setBookings(bookingsWithProfiles as any);
    } else if (!error && data) {
      setBookings(data as any);
    }
    setBookingsLoading(false);
  };

  const handleCancel = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (booking) {
      setCancelingBooking(booking);
    }
  };

  const confirmCancel = async () => {
    if (!cancelingBooking) return;

    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setCancelingBooking(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!['pending', 'confirmed', 'in_progress'].includes(cancelingBooking.status)) {
      setActionLoading(false);
      setCancelingBooking(null);
      setShowToast({ message: '当前状态不可取消', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', cancelingBooking.id);

    setActionLoading(false);
    setCancelingBooking(null);

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已取消', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `取消失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleConfirm = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking || booking.status !== 'pending') {
      setShowToast({ message: '仅待确认预约可执行确认', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'confirmed' })
      .eq('id', id)
      .eq('status', 'pending');

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已确认', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `确认失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleStart = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking || booking.status !== 'confirmed') {
      setShowToast({ message: '仅已确认预约可开始', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'in_progress' })
      .eq('id', id)
      .eq('status', 'confirmed');

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已开始', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `开始失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleFinish = async (id: string) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking || booking.status !== 'in_progress') {
      setShowToast({ message: '仅进行中预约可完成', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { error } = await supabase
      .from('bookings')
      .update({ status: 'finished' })
      .eq('id', id)
      .eq('status', 'in_progress');

    if (!error) {
      loadBookings();
      setShowToast({ message: '预约已完成', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `完成失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-gradient-to-r from-amber-50 to-yellow-50 text-amber-700 border border-amber-200/50';
      case 'confirmed':
        return 'bg-gradient-to-r from-emerald-50 to-green-50 text-emerald-700 border border-emerald-200/50';
      case 'in_progress':
        return 'bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 border border-blue-200/50';
      case 'finished':
        return 'bg-gradient-to-r from-purple-50 to-pink-50 text-purple-700 border border-purple-200/50';
      case 'cancelled':
        return 'bg-gradient-to-r from-gray-50 to-slate-50 text-gray-600 border border-gray-200/50';
      default:
        return 'bg-gradient-to-r from-gray-50 to-slate-50 text-gray-600 border border-gray-200/50';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '⏳ 待确认';
      case 'confirmed':
        return '✓ 已确认';
      case 'in_progress':
        return '📸 进行中';
      case 'finished':
        return '✨ 已完成';
      case 'cancelled':
        return '✕ 已取消';
      default:
        return status;
    }
  };

  const handleBatchDeleteBookings = async () => {
    if (selectedBookingIds.length === 0) {
      setShowToast({ message: '请先选择要删除的预约', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    setShowBatchDeleteBookingsConfirm(true);
  };

  const confirmBatchDeleteBookings = async () => {
    setShowBatchDeleteBookingsConfirm(false);
    setActionLoading(true);

    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { error } = await supabase
        .from('bookings')
        .delete()
        .in('id', selectedBookingIds);

      if (error) throw error;

      setActionLoading(false);
      setSelectedBookingIds([]);
      setIsBookingSelectionMode(false);
      loadBookings();
      setShowToast({ message: `成功删除 ${selectedBookingIds.length} 个预约`, type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setShowToast({ message: `批量删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const toggleBookingSelection = (id: string) => {
    setSelectedBookingIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllBookings = () => {
    const deletableBookings = bookings.filter(b => b.status === 'finished' || b.status === 'cancelled');
    setSelectedBookingIds(deletableBookings.map(b => b.id));
  };

  const clearBookingSelection = () => {
    setSelectedBookingIds([]);
    setIsBookingSelectionMode(false);
  };

  // 约拍类型管理函数
  const loadBookingTypes = async () => {
    setTypesLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setTypesLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data, error } = await supabase
      .from('booking_types')
      .select('*')
      .order('id');
    if (!error && data) {
      setBookingTypes(data);
    }
    setTypesLoading(false);
  };

  const handleAddType = () => {
    setEditingType(null);
    setTypeFormData({ name: '', description: '' });
    setShowTypeModal(true);
  };

  const handleEditType = (type: BookingType) => {
    setEditingType(type);
    setTypeFormData({ name: type.name, description: type.description || '' });
    setShowTypeModal(true);
  };

  const handleSaveType = async () => {
    if (!typeFormData.name.trim()) {
      setShowToast({ message: '请输入类型名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) {
      setSubmitting(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (editingType) {
      const { error } = await supabase
        .from('booking_types')
        .update({ name: typeFormData.name, description: typeFormData.description })
        .eq('id', editingType.id);

      if (!error) {
        setShowTypeModal(false);
        loadBookingTypes();
        setShowToast({ message: '类型已更新', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: `更新失败：${error.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
      }
    } else {
      const { error } = await supabase
        .from('booking_types')
        .insert({ name: typeFormData.name, description: typeFormData.description });

      if (!error) {
        setShowTypeModal(false);
        loadBookingTypes();
        setShowToast({ message: '类型已添加', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: `添加失败：${error.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
      }
    }
    setSubmitting(false);
  };

  const handleToggleTypeStatus = async (type: BookingType) => {
    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('booking_types')
      .update({ is_active: !type.is_active })
      .eq('id', type.id);

    if (!error) {
      loadBookingTypes();
      setShowToast({ message: type.is_active ? '类型已禁用' : '类型已启用', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteType = (type: BookingType) => {
    setDeletingType(type);
  };

  const confirmDeleteType = async () => {
    if (!deletingType) return;

    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setDeletingType(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { error } = await supabase
        .from('booking_types')
        .delete()
        .eq('id', deletingType.id);

      if (error) throw error;

      setActionLoading(false);
      setDeletingType(null);
      loadBookingTypes();
      setShowToast({ message: '约拍类型已删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setDeletingType(null);
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  // 城市管理函数
  const loadCities = async () => {
    setCitiesLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setCitiesLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data, error } = await supabase
      .from('allowed_cities')
      .select('*')
      .order('id');
    if (!error && data) {
      setCities(data);
    }
    setCitiesLoading(false);
  };

  const handleAddCity = () => {
    setEditingCity(null);
    setCityFormData({ city_name: '', province: '', city_code: '' });
    setCityLocation({ latitude: 0, longitude: 0 });
    setShowCityModal(true);
  };

  const handleEditCity = (city: AllowedCity) => {
    setEditingCity(city);
    setCityFormData({ city_name: city.city_name, province: city.province || '', city_code: city.city_code || '' });
    setCityLocation({
      latitude: city.latitude ?? 0,
      longitude: city.longitude ?? 0,
    });
    setShowCityModal(true);
  };

  const handleCityMapSelect = async (location: string, lat: number, lng: number) => {
    // 使用高德地图逆地理编码获取城市信息
    const AMap = (window as any).AMap;
    if (AMap) {
      AMap.plugin('AMap.Geocoder', () => {
        const geocoder = new AMap.Geocoder();
        geocoder.getAddress([lng, lat], (status: string, result: any) => {
          if (status === 'complete' && result.info === 'OK') {
            const addressComponent = result.regeocode.addressComponent;
            const cityName = addressComponent.city || addressComponent.province;
            const province = addressComponent.province;
            const cityCode = addressComponent.citycode || addressComponent.adcode;

            setCityFormData({
              city_name: cityName,
              province: province,
              city_code: cityCode,
            });
            setCityLocation({ latitude: lat, longitude: lng });
          }
        });
      });
    }
    setShowCityMapPicker(false);
  };

  const handleSaveCity = async () => {
    if (!cityFormData.city_name.trim()) {
      setShowToast({ message: '请输入城市名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setSubmitting(true);
    const supabase = createClient();
    if (!supabase) {
      setSubmitting(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const locationPayload = {
      latitude: cityLocation.latitude || null,
      longitude: cityLocation.longitude || null,
    };

    if (editingCity) {
      const { error } = await supabase
        .from('allowed_cities')
        .update({
          city_name: cityFormData.city_name,
          province: cityFormData.province,
          city_code: cityFormData.city_code,
          ...locationPayload,
        })
        .eq('id', editingCity.id);

      if (!error) {
        setShowCityModal(false);
        loadCities();
        setShowToast({ message: '城市已更新', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: `更新失败：${error.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
      }
    } else {
      const { error } = await supabase
        .from('allowed_cities')
        .insert({
          city_name: cityFormData.city_name,
          province: cityFormData.province,
          city_code: cityFormData.city_code,
          ...locationPayload,
        });

      if (!error) {
        setShowCityModal(false);
        loadCities();
        setShowToast({ message: '城市已添加', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: `添加失败：${error.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
      }
    }
    setSubmitting(false);
  };

  const handleToggleCityStatus = async (city: AllowedCity) => {
    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('allowed_cities')
      .update({ is_active: !city.is_active })
      .eq('id', city.id);

    if (!error) {
      loadCities();
      setShowToast({ message: city.is_active ? '城市已禁用' : '城市已启用', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteCity = (city: AllowedCity) => {
    setDeletingCity(city);
  };

  const confirmDeleteCity = async () => {
    if (!deletingCity) return;

    setActionLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setActionLoading(false);
      setDeletingCity(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { error } = await supabase
        .from('allowed_cities')
        .delete()
        .eq('id', deletingCity.id);

      if (error) throw error;

      setActionLoading(false);
      setDeletingCity(null);
      loadCities();
      setShowToast({ message: '城市已删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      setDeletingCity(null);
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题 */}
      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          预约管理 📅
        </h1>
        <p className="text-sm text-[#5D4037]/60">管理用户预约申请</p>
      </div>

      {/* Tab切换 */}
      <div className="flex gap-2 border-b border-[#5D4037]/10 overflow-x-auto">
        <button
          onClick={() => setActiveTab('bookings')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'bookings'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          预约列表
          {activeTab === 'bookings' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('types')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'types'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          约拍类型
          {activeTab === 'types' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
        <button
          onClick={() => setActiveTab('cities')}
          className={`px-4 sm:px-6 py-3 font-medium transition-all relative whitespace-nowrap ${
            activeTab === 'cities'
              ? 'text-[#5D4037]'
              : 'text-[#5D4037]/40 hover:text-[#5D4037]/60'
          }`}
        >
          城市管理
          {activeTab === 'cities' && (
            <motion.div
              layoutId="activeTab"
              className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#FFC857]"
            />
          )}
        </button>
      </div>

      {/* 预约列表内容 */}
      {activeTab === 'bookings' && (
        <div className="space-y-6">
          {/* 筛选器和批量操作 */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {[
                { key: 'all', label: '全部' },
                { key: 'pending', label: '待确认' },
                { key: 'confirmed', label: '已确认' },
                { key: 'in_progress', label: '进行中' },
                { key: 'finished', label: '已完成' },
                { key: 'cancelled', label: '已取消' },
              ].map((item) => (
                <button
                  key={item.key}
                  onClick={() => setFilter(item.key as any)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                    filter === item.key
                      ? 'bg-[#FFC857] text-[#5D4037] shadow-md'
                      : 'bg-white text-[#5D4037]/60 border border-[#5D4037]/10 hover:bg-[#5D4037]/5'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* 批量删除按钮 */}
            {(filter === 'finished' || filter === 'cancelled') && !isBookingSelectionMode && (
              <button
                onClick={() => setIsBookingSelectionMode(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white text-[#5D4037] rounded-full font-medium border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors whitespace-nowrap"
              >
                批量删除
              </button>
            )}

            {isBookingSelectionMode && (
              <div className="flex gap-2">
                <button
                  onClick={selectAllBookings}
                  className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors whitespace-nowrap"
                >
                  全选 ({selectedBookingIds.length}/{bookings.filter(b => b.status === 'finished' || b.status === 'cancelled').length})
                </button>
                <button
                  onClick={handleBatchDeleteBookings}
                  disabled={selectedBookingIds.length === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full font-medium hover:bg-red-600 transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  <Trash2 className="w-4 h-4" />
                  删除 ({selectedBookingIds.length})
                </button>
                <button
                  onClick={clearBookingSelection}
                  className="px-4 py-2 bg-white text-[#5D4037] rounded-full text-sm border border-[#5D4037]/20 hover:bg-[#5D4037]/5 transition-colors whitespace-nowrap"
                >
                  取消
                </button>
              </div>
            )}
          </div>

          {/* 预约列表 */}
          {bookingsLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <Calendar className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
              <p className="text-[#5D4037]/60">暂无预约数据</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {bookings.map((booking) => {
                  const isDeletable = booking.status === 'finished' || booking.status === 'cancelled';
                  const isSelected = selectedBookingIds.includes(booking.id);

                  return (
                  <motion.div
                    key={booking.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`bg-white rounded-2xl p-6 shadow-sm border transition-all ${
                      isBookingSelectionMode && isDeletable
                        ? isSelected
                          ? 'border-[#FFC857] bg-[#FFC857]/5 shadow-md cursor-pointer'
                          : 'border-[#5D4037]/10 hover:border-[#FFC857]/50 cursor-pointer'
                        : 'border-[#5D4037]/10 hover:shadow-md'
                    }`}
                    onClick={() => isBookingSelectionMode && isDeletable && toggleBookingSelection(booking.id)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center gap-3">
                        {isBookingSelectionMode && isDeletable && (
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                            isSelected
                              ? 'bg-[#FFC857] border-[#FFC857]'
                              : 'bg-white border-[#5D4037]/30'
                          }`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        )}
                        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#FFC857] to-[#FFB347] flex items-center justify-center flex-shrink-0">
                          <User className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-[#5D4037]">{booking.profiles?.name || '未知用户'}</h3>
                          <p className="text-sm text-[#5D4037]/60">{booking.profiles?.email}</p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(booking.status)}`}>
                        {getStatusText(booking.status)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 mb-4">
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <Calendar className="w-4 h-4 text-[#FFC857] flex-shrink-0" />
                        <span>{booking.booking_date}</span>
                      </div>
                      <div className="flex items-start gap-2 text-sm text-[#5D4037]/80">
                        <MapPin className="w-4 h-4 text-[#FFC857] flex-shrink-0 mt-0.5" />
                        <span className="break-words">{booking.location}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <Phone className="w-4 h-4 text-[#FFC857] flex-shrink-0" />
                        <span>{booking.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-[#5D4037]/80">
                        <MessageSquare className="w-4 h-4 text-[#FFC857] flex-shrink-0" />
                        <span>{booking.wechat}</span>
                      </div>
                    </div>

                    {booking.booking_types && (
                      <div className="mb-4">
                        <span className="px-3 py-1 bg-[#FFC857]/20 text-[#5D4037] text-xs rounded-full">
                          {booking.booking_types.name}
                        </span>
                      </div>
                    )}

                    {booking.notes && (
                      <div className="mb-4 p-3 bg-[#FFFBF0] rounded-xl">
                        <p className="text-sm text-[#5D4037]/80">{booking.notes}</p>
                      </div>
                    )}

                    {booking.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirm(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          确认预约
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          取消预约
                        </button>
                      </div>
                    )}

                    {booking.status === 'confirmed' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleStart(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          开始拍摄
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          取消预约
                        </button>
                      </div>
                    )}

                    {booking.status === 'in_progress' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleFinish(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          完成预约
                        </button>
                        <button
                          onClick={() => handleCancel(booking.id)}
                          className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          取消预约
                        </button>
                      </div>
                    )}
                  </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* 约拍类型管理内容 */}
      {activeTab === 'types' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={handleAddType}
              className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
            >
              <Plus className="w-5 h-5" />
              添加类型
            </button>
          </div>

          {typesLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : bookingTypes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <Camera className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
              <p className="text-[#5D4037]/60">暂无约拍类型</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {bookingTypes.map((type) => (
                <div key={type.id} className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-[#5D4037] text-lg">{type.name}</h3>
                      {type.description && (
                        <p className="text-sm text-[#5D4037]/60 mt-1">{type.description}</p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${type.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {type.is_active ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditType(type)}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors text-sm"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteType(type)}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors text-sm"
                    >
                      删除
                    </button>
                    <button
                      onClick={() => handleToggleTypeStatus(type)}
                      className={`flex-1 px-4 py-2 rounded-full transition-colors text-sm ${type.is_active ? 'bg-gray-500 text-white hover:bg-gray-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
                    >
                      {type.is_active ? '禁用' : '启用'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 城市管理内容 */}
      {activeTab === 'cities' && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={handleAddCity}
              className="flex items-center gap-2 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow"
            >
              <Plus className="w-5 h-5" />
              添加城市
            </button>
          </div>

          {citiesLoading ? (
            <div className="text-center py-12">
              <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-sm text-[#5D4037]/60">加载中...</p>
            </div>
          ) : cities.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
              <MapPin className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
              <p className="text-[#5D4037]/60">暂无允许的城市</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cities.map((city) => (
                <div key={city.id} className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="font-bold text-[#5D4037] text-lg">{city.city_name}</h3>
                      {city.province && (
                        <p className="text-sm text-[#5D4037]/60 mt-1">{city.province}</p>
                      )}
                      {city.city_code && (
                        <p className="text-xs text-[#5D4037]/40 mt-1">代码: {city.city_code}</p>
                      )}
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${city.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {city.is_active ? '启用' : '禁用'}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEditCity(city)}
                      className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors text-sm"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => handleDeleteCity(city)}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors text-sm"
                    >
                      删除
                    </button>
                    <button
                      onClick={() => handleToggleCityStatus(city)}
                      className={`flex-1 px-4 py-2 rounded-full transition-colors text-sm ${city.is_active ? 'bg-gray-500 text-white hover:bg-gray-600' : 'bg-green-500 text-white hover:bg-green-600'}`}
                    >
                      {city.is_active ? '禁用' : '启用'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 约拍类型弹窗 */}
      <AnimatePresence>
        {showTypeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowTypeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">{editingType ? '编辑类型' : '添加类型'}</h2>
                <button
                  onClick={() => setShowTypeModal(false)}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    类型名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={typeFormData.name}
                    onChange={(e) => setTypeFormData({ ...typeFormData, name: e.target.value })}
                    placeholder="例如：常规约拍"
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    描述（可选）
                  </label>
                  <textarea
                    value={typeFormData.description}
                    onChange={(e) => setTypeFormData({ ...typeFormData, description: e.target.value })}
                    placeholder="简单描述这个类型..."
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none resize-none"
                  />
                </div>

                <button
                  onClick={handleSaveType}
                  disabled={submitting}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {submitting ? '保存中...' : '确认保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 城市弹窗 */}
      <AnimatePresence>
        {showCityModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
            onClick={() => setShowCityModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 w-full max-w-md mx-4"
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-[#5D4037]">{editingCity ? '编辑城市' : '添加城市'}</h2>
                <button
                  onClick={() => setShowCityModal(false)}
                  className="p-2 hover:bg-[#5D4037]/5 rounded-full transition-colors"
                >
                  <X className="w-5 h-5 text-[#5D4037]" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    城市名称 <span className="text-red-500">*</span>
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowCityMapPicker(true)}
                      className="w-full px-4 py-3 bg-white border-2 border-[#5D4037]/20 rounded-xl text-left transition-all hover:border-[#FFC857] hover:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          {cityFormData.city_name ? (
                            <p className="text-[#5D4037] font-medium">{cityFormData.city_name}</p>
                          ) : (
                            <p className="text-[#5D4037]/40">点击在地图上选择城市...</p>
                          )}
                        </div>
                        <MapPin className="w-5 h-5 text-[#FFC857] group-hover:scale-110 transition-transform" />
                      </div>
                    </button>
                    <input
                      type="text"
                      value={cityFormData.city_name}
                      onChange={(e) => setCityFormData({ ...cityFormData, city_name: e.target.value })}
                      placeholder="或手动输入城市名称"
                      className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    省份（可选）
                  </label>
                  <input
                    type="text"
                    value={cityFormData.province}
                    onChange={(e) => setCityFormData({ ...cityFormData, province: e.target.value })}
                    placeholder="例如：广西壮族自治区"
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#5D4037] mb-2">
                    城市代码（可选）
                  </label>
                  <input
                    type="text"
                    value={cityFormData.city_code}
                    onChange={(e) => setCityFormData({ ...cityFormData, city_code: e.target.value })}
                    placeholder="高德地图城市代码"
                    className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                  />
                </div>

                <button
                  onClick={handleSaveCity}
                  disabled={submitting}
                  className="w-full py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
                >
                  {submitting ? '保存中...' : '确认保存'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 取消预约确认对话框 */}
      <AnimatePresence>
        {cancelingBooking && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setCancelingBooking(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">取消预约</h3>
                <p className="text-sm text-[#5D4037]/80">
                  确定要取消这个预约吗？
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setCancelingBooking(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  返回
                </button>
                <button
                  onClick={confirmCancel}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '取消中...' : '确认取消'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 约拍类型删除确认对话框 */}
      <AnimatePresence>
        {deletingType && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingType(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">确认删除约拍类型</h3>
              <p className="text-[#5D4037]/80 mb-6">
                确定要删除约拍类型「{deletingType.name}」吗？此操作无法撤销。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingType(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteType}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 批量删除预约确认对话框 */}
      <AnimatePresence>
        {showBatchDeleteBookingsConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setShowBatchDeleteBookingsConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">批量删除预约</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  确定要删除选中的 <span className="font-bold text-red-600">{selectedBookingIds.length}</span> 个预约吗？
                </p>
                <div className="bg-red-50 rounded-xl p-4">
                  <p className="text-sm text-red-800">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    此操作不可撤销！
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowBatchDeleteBookingsConfirm(false)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmBatchDeleteBookings}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 城市删除确认对话框 */}
      <AnimatePresence>
        {deletingCity && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !actionLoading && setDeletingCity(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-2xl p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">确认删除城市</h3>
              <p className="text-[#5D4037]/80 mb-6">
                确定要删除城市「{deletingCity.city_name}」吗？此操作无法撤销。
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setDeletingCity(null)}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={confirmDeleteCity}
                  disabled={actionLoading}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {actionLoading ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast通知 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-lg backdrop-blur-sm ${
              showToast.type === 'success'
                ? 'bg-green-500/95 text-white'
                : showToast.type === 'warning'
                ? 'bg-orange-500/95 text-white'
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : showToast.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="font-medium">{showToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 城市地图选择器 */}
      <AnimatePresence>
        {showCityMapPicker && (
          <MapPicker
            onSelect={handleCityMapSelect}
            onClose={() => setShowCityMapPicker(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
