'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { MapPin, X, Trash2, CheckCircle, XCircle, AlertCircle, Camera, Search, Calendar, Phone, MessageSquare, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import dynamic from 'next/dynamic';
import AdminLoadingCard from '../components/AdminLoadingCard';
import { useAutoLoadMore } from '../hooks/useAutoLoadMore';

const MapPicker = dynamic(() => import('@/components/MapPicker'), { ssr: false });

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

function inferCityMetaFromLocation(location: string): { cityName: string; province: string } {
  const normalized = String(location ?? '').replace(/\s+/g, '');
  if (!normalized) {
    return { cityName: '', province: '' };
  }

  const provinceMatch = normalized.match(/([\u4e00-\u9fa5]{2,}?(?:省|自治区|特别行政区))/);
  const municipalityMatch = normalized.match(/(北京市|上海市|天津市|重庆市)/);
  const cityLikeMatch = normalized.match(/([\u4e00-\u9fa5]{2,}?(?:自治州|地区|盟|市))/);

  if (municipalityMatch) {
    const cityName = municipalityMatch[1];
    return { cityName, province: provinceMatch?.[1] || cityName };
  }

  return {
    cityName: cityLikeMatch?.[1] || '',
    province: provinceMatch?.[1] || '',
  };
}

function isDuplicateEntryError(error: any): boolean {
  const errorCode = String(error?.code ?? '').trim();
  const errorMessage = String(error?.message ?? '').toLowerCase();
  return errorCode === '23505' || errorCode === '1062' || errorMessage.includes('duplicate entry');
}

function isForeignKeyConstraintError(error: any): boolean {
  const errorCode = String(error?.code ?? '').trim();
  const errorMessage = String(error?.message ?? '').toLowerCase();
  return errorCode === '1451' || errorMessage.includes('foreign key constraint fails');
}

function isColumnMissingError(error: unknown, columnName: string): boolean {
  const message = formatErrorMessage(error).toLowerCase();
  const column = String(columnName ?? '').trim().toLowerCase();
  if (!message || !column) {
    return false;
  }

  return (
    message.includes(column) &&
    (
      message.includes('unknown column') ||
      message.includes('does not exist') ||
      (message.includes('column') && message.includes('not found'))
    )
  );
}

const BOOKING_PAGE_SIZE = 10;

const BOOKING_PANEL_TABS = [
  { key: 'bookings', label: '预约列表' },
  { key: 'types', label: '约拍类型' },
  { key: 'cities', label: '城市管理' },
] as const;

const BOOKING_FILTER_OPTIONS = [
  { key: 'all', label: '全部' },
  { key: 'pending', label: '待确认' },
  { key: 'confirmed', label: '已确认' },
  { key: 'in_progress', label: '进行中' },
  { key: 'finished', label: '已完成' },
  { key: 'cancelled', label: '已取消' },
] as const;

function normalizeBookingKeyword(input: string): string {
  return String(input ?? '').trim().toLowerCase();
}

function isBookingDeletable(status: string): boolean {
  return status === 'finished' || status === 'cancelled';
}

function buildBookingSearchText(booking: Booking): string {
  return [
    booking.id,
    booking.profiles?.name,
    booking.profiles?.email,
    booking.phone,
    booking.wechat,
    booking.booking_types?.name,
    booking.city_name,
    booking.location,
    booking.booking_date,
    booking.notes,
  ]
    .map((item) => String(item ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
}

function formatBookingMetaTime(value: string): string {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '创建时间未知';
  }

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) {
    return `创建于 ${normalized}`;
  }

  return `创建于 ${date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) {
      return message;
    }
  }
  return '未知错误';
}

const ACTIVE_BOOKING_STATUSES = new Set(['pending', 'confirmed', 'in_progress']);

export default function BookingsPage() {
  const [activeTab, setActiveTab] = useState<'bookings' | 'types' | 'cities'>('bookings');

  // 预约管理状态
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [bookingsRefreshing, setBookingsRefreshing] = useState(false);
  const [bookingsError, setBookingsError] = useState('');
  const [bookingsReady, setBookingsReady] = useState(false);
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed' | 'in_progress' | 'finished' | 'cancelled'>('all');
  const [bookingKeyword, setBookingKeyword] = useState('');
  const [bookingVisibleCount, setBookingVisibleCount] = useState(BOOKING_PAGE_SIZE);

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
  const [typesRefreshing, setTypesRefreshing] = useState(false);
  const [typesError, setTypesError] = useState('');
  const [typesReady, setTypesReady] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<BookingType | null>(null);
  const [typeFormData, setTypeFormData] = useState({ name: '', description: '' });
  const [deletingType, setDeletingType] = useState<BookingType | null>(null);

  // 城市管理状态
  const [cities, setCities] = useState<AllowedCity[]>([]);
  const [citiesLoading, setCitiesLoading] = useState(true);
  const [citiesRefreshing, setCitiesRefreshing] = useState(false);
  const [citiesError, setCitiesError] = useState('');
  const [citiesReady, setCitiesReady] = useState(false);
  const [showCityModal, setShowCityModal] = useState(false);
  const [editingCity, setEditingCity] = useState<AllowedCity | null>(null);
  const [cityFormData, setCityFormData] = useState({ city_name: '', province: '', city_code: '' });
  const [showCityMapPicker, setShowCityMapPicker] = useState(false);
  const [cityLocation, setCityLocation] = useState({ latitude: 0, longitude: 0 });
  const [deletingCity, setDeletingCity] = useState<AllowedCity | null>(null);
  const bookingsLoadTokenRef = useRef(0);
  const bookingTypesLoadTokenRef = useRef(0);
  const citiesLoadTokenRef = useRef(0);

  const showTransientToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setShowToast({ message, type });
    setTimeout(() => setShowToast(null), 3000);
  };

  const showRefreshFeedback = (
    refreshed: boolean,
    wasReady: boolean,
    successMessage: string,
    staleFailureMessage: string,
    emptyFailureMessage: string
  ) => {
    showTransientToast(
      refreshed ? successMessage : wasReady ? staleFailureMessage : emptyFailureMessage,
      refreshed ? 'success' : wasReady ? 'warning' : 'error'
    );
  };

  const updateBookingStatusWithSnapshot = async (
    bookingId: string,
    nextStatus: 'pending' | 'confirmed' | 'in_progress' | 'finished' | 'cancelled',
    expectedStatuses: string[],
    successMessage: string,
    invalidStateMessage: string
  ) => {
    const booking = bookings.find((item) => item.id === bookingId);
    if (!booking || !expectedStatuses.includes(booking.status)) {
      showTransientToast(invalidStateMessage, 'warning');
      return;
    }

    const dbClient = createClient();
    if (!dbClient) {
      showTransientToast('服务初始化失败，请刷新后重试', 'error');
      return;
    }

    const { data: updatedBooking, error } = await dbClient
      .from('bookings')
      .update({ status: nextStatus })
      .eq('id', bookingId)
      .in('status', expectedStatuses)
      .select('id,status')
      .maybeSingle();

    if (!error && updatedBooking) {
      const hadReadyBookings = bookingsReady;
      const refreshed = await refreshBookingsPanel({ silent: true });
      showRefreshFeedback(
        refreshed,
        hadReadyBookings,
        successMessage,
        `${successMessage}，但列表刷新失败，已保留当前内容，请稍后重试`,
        `${successMessage}，但列表加载失败，请稍后重试`
      );
      return;
    }

    if (!error && !updatedBooking) {
      const { data: snapshotBooking, error: snapshotError } = await dbClient
        .from('bookings')
        .select('id,status')
        .eq('id', bookingId)
        .maybeSingle();

      if (snapshotError) {
        showTransientToast(`操作失败：${snapshotError.message || '未知错误'}`, 'error');
        return;
      }

      if (!snapshotBooking) {
        showTransientToast('操作失败：预约不存在或已删除，请刷新后重试', 'warning');
        return;
      }

      const currentStatus = String((snapshotBooking as { status?: unknown }).status ?? '').trim();
      if (currentStatus === nextStatus) {
        const hadReadyBookings = bookingsReady;
        const refreshed = await refreshBookingsPanel({ silent: true });
        showRefreshFeedback(
          refreshed,
          hadReadyBookings,
          successMessage,
          `${successMessage}，但列表刷新失败，已保留当前内容，请稍后重试`,
          `${successMessage}，但列表加载失败，请稍后重试`
        );
        return;
      }

      showTransientToast(`操作失败：预约状态已变化（当前：${getStatusText(currentStatus) || currentStatus || '未知'}），请刷新后重试`, 'warning');
      return;
    }

    showTransientToast(`操作失败：${error?.message || '未知错误'}`, 'error');
  };

  useEffect(() => {
    void loadBookingTypes();
    void loadCities();

    return () => {
      bookingTypesLoadTokenRef.current += 1;
      citiesLoadTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    void loadBookings();

    return () => {
      bookingsLoadTokenRef.current += 1;
    };
  }, [filter]);

  useEffect(() => {
    setBookingVisibleCount(BOOKING_PAGE_SIZE);
  }, [filter, bookingKeyword]);

  // 预约管理函数
  const loadBookings = async () => {
    const loadToken = bookingsLoadTokenRef.current + 1;
    bookingsLoadTokenRef.current = loadToken;
    const hasReadyBookings = bookingsReady;
    const isFirstLoad = !hasReadyBookings;

    setBookingsLoading(isFirstLoad);
    setBookingsRefreshing(!isFirstLoad);
    setBookingsError('');

    const dbClient = createClient();
    if (!dbClient) {
      if (loadToken === bookingsLoadTokenRef.current) {
        setBookingsLoading(false);
        setBookingsRefreshing(false);
        setBookingsError('加载预约列表失败，请稍后重试');
        setBookingsReady(hasReadyBookings);
        if (!hasReadyBookings) {
          setBookings([]);
        }
      }
      return false;
    }

    try {
      let query = dbClient
        .from('bookings')
        .select('id, user_id, type_id, booking_date, location, latitude, longitude, city_name, phone, wechat, notes, status, created_at')
        .order('booking_date', { ascending: false });

      if (filter !== 'all') {
        query = query.eq('status', filter);
      }

      let { data, error } = await query;
      if (error && (isColumnMissingError(error, 'latitude') || isColumnMissingError(error, 'longitude'))) {
        let fallbackQuery = dbClient
          .from('bookings')
          .select('id, user_id, type_id, booking_date, location, city_name, phone, wechat, notes, status, created_at')
          .order('booking_date', { ascending: false });

        if (filter !== 'all') {
          fallbackQuery = fallbackQuery.eq('status', filter);
        }

        const fallbackResult = await fallbackQuery;
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (loadToken !== bookingsLoadTokenRef.current) {
        return false;
      }
      if (error) {
        throw error
      }

      let nextBookings = [];
      if (Array.isArray(data) && data.length > 0) {
        const userIds = [...new Set(data.map((booking: any) => booking.user_id).filter(Boolean))];
        const typeIds = [...new Set(data.map((booking: any) => booking.type_id).filter(Boolean))];

        let profileMap = new Map<string, { name: string; email: string }>();
        if (userIds.length > 0) {
          const { data: profiles, error: profilesError } = await dbClient
            .from('profiles')
            .select('id, name, email')
            .in('id', userIds);
          if (loadToken !== bookingsLoadTokenRef.current) {
            return false;
          }
          if (!profilesError && Array.isArray(profiles)) {
            profileMap = new Map(
              profiles.map((profile: any) => [String(profile.id), { name: profile.name || '未知用户', email: profile.email || '' }])
            );
          }
        }

        let bookingTypeMap = new Map<number, { name: string }>();
        if (typeIds.length > 0) {
          const { data: bookingTypesData, error: bookingTypesError } = await dbClient
            .from('booking_types')
            .select('id, name')
            .in('id', typeIds);
          if (loadToken !== bookingsLoadTokenRef.current) {
            return false;
          }
          if (!bookingTypesError && Array.isArray(bookingTypesData)) {
            bookingTypeMap = new Map(bookingTypesData.map((item: any) => [item.id, { name: item.name }]));
          }
        }

        nextBookings = data.map((booking: any) => ({
          ...booking,
          profiles: profileMap.get(String(booking.user_id)) || { name: '未知用户', email: '' },
          booking_types: booking.type_id ? bookingTypeMap.get(booking.type_id) : undefined,
        }));
      }

      setBookings(nextBookings as Booking[]);
      setBookingsLoading(false);
      setBookingsRefreshing(false);
      setBookingsError('');
      setBookingsReady(true);
      return true;
    } catch (error) {
      const resolvedError = error;
      if (loadToken === bookingsLoadTokenRef.current) {
        setBookingsLoading(false);
        setBookingsRefreshing(false);
        setBookingsError(`加载预约列表失败：${formatErrorMessage(resolvedError)}`);
        setBookingsReady(hasReadyBookings);
        if (!hasReadyBookings) {
          setBookings([]);
        }
      }
      return false;
    }
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
    try {
      await updateBookingStatusWithSnapshot(
        cancelingBooking.id,
        'cancelled',
        ['pending', 'confirmed', 'in_progress'],
        '预约已取消',
        '当前状态不可取消'
      );
    } finally {
      setActionLoading(false);
      setCancelingBooking(null);
    }
  };

  const handleConfirm = async (id: string) => {
    await updateBookingStatusWithSnapshot(id, 'confirmed', ['pending'], '预约已确认', '仅待确认预约可执行确认');
  };

  const handleStart = async (id: string) => {
    await updateBookingStatusWithSnapshot(id, 'in_progress', ['confirmed'], '预约已开始', '仅已确认预约可开始');
  };

  const handleFinish = async (id: string) => {
    await updateBookingStatusWithSnapshot(id, 'finished', ['in_progress'], '预约已完成', '仅进行中预约可完成');
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending':
        return '待确认';
      case 'confirmed':
        return '已确认';
      case 'in_progress':
        return '进行中';
      case 'finished':
        return '已完成';
      case 'cancelled':
        return '已取消';
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
    const preserveSelection = isBookingSelectionMode;
    const clearImplicitSelection = () => {
      if (!preserveSelection) {
        setSelectedBookingIds([]);
      }
    };

    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      clearImplicitSelection();
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: selectedRows, error: fetchError } = await dbClient
        .from('bookings')
        .select('id, status')
        .in('id', selectedBookingIds);

      if (fetchError) {
        throw fetchError;
      }

      const rows = Array.isArray(selectedRows) ? selectedRows : [];
      const missingCount = Math.max(0, selectedBookingIds.length - rows.length);
      const deletableRows = rows.filter((row: any) => row.status === 'finished' || row.status === 'cancelled');
      const blockedCount = rows.length - deletableRows.length;

      if (blockedCount > 0) {
        setActionLoading(false);
        clearImplicitSelection();
        setShowToast({
          message: missingCount > 0
            ? `有 ${blockedCount} 个预约状态已变化，${missingCount} 个预约已不存在，无法删除（仅已完成/已取消可删）`
            : `有 ${blockedCount} 个预约状态已变化，无法删除（仅已完成/已取消可删）`,
          type: 'warning',
        });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const deletableIds = deletableRows.map((row: any) => String(row.id));
      if (deletableIds.length === 0) {
        setActionLoading(false);
        clearImplicitSelection();
        setShowToast({
          message: missingCount > 0 ? `没有可删除的预约（${missingCount} 个预约已不存在）` : '没有可删除的预约',
          type: 'warning'
        });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error } = await dbClient
        .from('bookings')
        .delete()
        .in('id', deletableIds)
        .in('status', ['finished', 'cancelled']);

      if (error) throw error;

      const { data: remainingRows, error: verifyError } = await dbClient
        .from('bookings')
        .select('id')
        .in('id', deletableIds);
      if (verifyError) throw verifyError;

      const remainingIdSet = new Set((remainingRows || []).map((row: any) => String(row.id)));
      const deletedCount = deletableIds.filter((id) => !remainingIdSet.has(id)).length;
      if (deletedCount === 0) {
        throw new Error('批量删除失败，请稍后重试');
      }

      setActionLoading(false);
      setSelectedBookingIds([]);
      setIsBookingSelectionMode(false);
      const hadReadyBookings = bookingsReady;
      const refreshed = await refreshBookingsPanel({ silent: true });
      let feedbackMessage = '';
      let feedbackType: 'success' | 'warning' = 'success';
      if (remainingIdSet.size > 0) {
        feedbackMessage = missingCount > 0
          ? `成功删除 ${deletedCount} 个预约，${remainingIdSet.size} 个删除失败，${missingCount} 个预约已不存在`
          : `成功删除 ${deletedCount} 个预约，${remainingIdSet.size} 个删除失败`;
        feedbackType = 'warning';
      } else if (missingCount > 0) {
        feedbackMessage = `成功删除 ${deletedCount} 个预约（${missingCount} 个预约已不存在）`;
      } else {
        feedbackMessage = `成功删除 ${deletedCount} 个预约`;
      }
      setShowToast({
        message: refreshed
          ? feedbackMessage
          : hadReadyBookings
            ? `${feedbackMessage}，但列表刷新失败，已保留当前内容，请稍后重试`
            : `${feedbackMessage}，但列表加载失败，请稍后重试`,
        type: refreshed ? feedbackType : hadReadyBookings ? 'warning' : 'error',
      });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setActionLoading(false);
      clearImplicitSelection();
      setShowToast({ message: `批量删除失败：${error?.message || '未知错误'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const toggleBookingSelection = (id: string) => {
    setSelectedBookingIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const getStatusChipClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'booking-status-chip--pending';
      case 'confirmed':
        return 'booking-status-chip--confirmed';
      case 'in_progress':
        return 'booking-status-chip--in_progress';
      case 'finished':
        return 'booking-status-chip--finished';
      case 'cancelled':
        return 'booking-status-chip--cancelled';
      default:
        return 'booking-status-chip--cancelled';
    }
  };

  const openBookingLocation = (booking: Booking) => {
    const latitude = Number(booking.latitude);
    const longitude = Number(booking.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setShowToast({ message: '当前预约没有可用坐标', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const markerUrl = `https://uri.amap.com/marker?position=${longitude},${latitude}&name=${encodeURIComponent(
      booking.location || booking.city_name || '预约位置'
    )}`;

    window.open(markerUrl, '_blank', 'noopener,noreferrer');
  };

  const selectAllBookings = () => {
    if (bookingDeletableIds.length === 0) {
      return;
    }

    setBookingVisibleCount(filteredBookings.length || BOOKING_PAGE_SIZE);
    setSelectedBookingIds((prev) => {
      const hasAllRows = bookingDeletableIds.every((id) => prev.includes(id));
      return hasAllRows ? [] : bookingDeletableIds;
    });
  };

  const clearBookingSelection = () => {
    setSelectedBookingIds([]);
    setIsBookingSelectionMode(false);
  };

  const openDeleteSingleBooking = (bookingId: string) => {
    setSelectedBookingIds([bookingId]);
    setShowBatchDeleteBookingsConfirm(true);
  };

  const closeBatchDeleteBookingsConfirm = () => {
    setShowBatchDeleteBookingsConfirm(false);
    if (!isBookingSelectionMode) {
      setSelectedBookingIds([]);
    }
  };

  const filteredBookings = useMemo(() => {
    const keyword = normalizeBookingKeyword(bookingKeyword);
    if (!keyword) {
      return bookings;
    }

    return bookings.filter((booking) => buildBookingSearchText(booking).includes(keyword));
  }, [bookings, bookingKeyword]);

  const bookingDeletableIds = useMemo(
    () => filteredBookings.filter((booking) => isBookingDeletable(booking.status)).map((booking) => booking.id),
    [filteredBookings]
  );

  const bookingVisibleLimit =
    filteredBookings.length > 0
      ? Math.min(Math.max(BOOKING_PAGE_SIZE, bookingVisibleCount), filteredBookings.length)
      : BOOKING_PAGE_SIZE;

  useEffect(() => {
    const deletableIdSet = new Set(bookingDeletableIds);
    setSelectedBookingIds((prev) => {
      const next = prev.filter((id) => deletableIdSet.has(id));
      return next.length === prev.length ? prev : next;
    });

    if (isBookingSelectionMode && bookingDeletableIds.length === 0) {
      setIsBookingSelectionMode(false);
    }
  }, [bookingDeletableIds, isBookingSelectionMode]);

  const bookingRows = useMemo(() => {
    return filteredBookings.slice(0, bookingVisibleLimit);
  }, [filteredBookings, bookingVisibleLimit]);

  const bookingHasMoreVisible = bookingRows.length < filteredBookings.length;

  const bookingPageDeletableIds = useMemo(
    () => bookingRows.filter((booking) => isBookingDeletable(booking.status)).map((booking) => booking.id),
    [bookingRows]
  );

  const bookingAllSelected =
    bookingDeletableIds.length > 0 &&
    bookingDeletableIds.every((id) => selectedBookingIds.includes(id));

  const bookingSelectedCount = selectedBookingIds.length;
  const bookingDeletableCount = bookingDeletableIds.length;
  const bookingSearchPlaceholder = '搜索：ID/用户/城市/日期';

  const handleAutoLoadBookings = useCallback(() => {
    setBookingVisibleCount((prev) => prev + BOOKING_PAGE_SIZE);
  }, []);

  useAutoLoadMore({
    enabled: bookingHasMoreVisible,
    isLoading: bookingsLoading || bookingsRefreshing,
    onLoadMore: handleAutoLoadBookings,
  });

  // 约拍类型管理函数
  const loadBookingTypes = async () => {
    const loadToken = bookingTypesLoadTokenRef.current + 1;
    bookingTypesLoadTokenRef.current = loadToken;
    const hasReadyTypes = typesReady;
    const isFirstLoad = !hasReadyTypes;

    setTypesLoading(isFirstLoad);
    setTypesRefreshing(!isFirstLoad);
    setTypesError('');

    const dbClient = createClient();
    if (!dbClient) {
      if (loadToken === bookingTypesLoadTokenRef.current) {
        setTypesLoading(false);
        setTypesRefreshing(false);
        setTypesError('加载预约类型失败，请稍后重试');
        setTypesReady(hasReadyTypes);
        if (!hasReadyTypes) {
          setBookingTypes([]);
        }
      }
      return false;
    }

    try {
      const { data, error } = await dbClient.from('booking_types').select('*').order('id');
      if (loadToken !== bookingTypesLoadTokenRef.current) {
        return false;
      }
      if (error) {
        throw error;
      }
      setBookingTypes(Array.isArray(data) ? data : []);
      setTypesLoading(false);
      setTypesRefreshing(false);
      setTypesError('');
      setTypesReady(true);
      return true;
    } catch (error) {
      if (loadToken === bookingTypesLoadTokenRef.current) {
        setTypesLoading(false);
        setTypesRefreshing(false);
        setTypesError(`加载预约类型失败：${formatErrorMessage(error)}`);
        setTypesReady(hasReadyTypes);
        if (!hasReadyTypes) {
          setBookingTypes([]);
        }
      }
      return false;
    }
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
    const normalizedName = typeFormData.name.trim();
    const normalizedDescription = typeFormData.description.trim();

    if (!normalizedName) {
      setShowToast({ message: '请输入类型名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setSubmitting(true);
    const dbClient = createClient();
    if (!dbClient) {
      setSubmitting(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (editingType) {
      const { data: updatedType, error } = await dbClient
        .from('booking_types')
        .update({ name: normalizedName, description: normalizedDescription || null })
        .eq('id', editingType.id)
        .select('id')
        .maybeSingle();

      if (!error && updatedType) {
        setShowTypeModal(false);
        const hadReadyTypes = typesReady;
        const refreshed = await refreshBookingTypesPanel({ silent: true });
        showRefreshFeedback(
          refreshed,
          hadReadyTypes,
          '类型已更新',
          '类型已更新，但预约类型刷新失败，已保留当前内容，请稍后重试',
          '类型已更新，但预约类型加载失败，请稍后重试'
        );
      } else if (!error && !updatedType) {
        setShowToast({ message: '更新失败：类型不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        if (isDuplicateEntryError(error)) {
          setShowToast({ message: '类型名称已存在，请使用其他名称', type: 'warning' });
        } else {
          setShowToast({ message: `更新失败：${error?.message || '未知错误'}`, type: 'error' });
        }
        setTimeout(() => setShowToast(null), 3000);
      }
    } else {
      const { error } = await dbClient
        .from('booking_types')
        .insert({ name: normalizedName, description: normalizedDescription || null });

      if (!error) {
        setShowTypeModal(false);
        const hadReadyTypes = typesReady;
        const refreshed = await refreshBookingTypesPanel({ silent: true });
        showRefreshFeedback(
          refreshed,
          hadReadyTypes,
          '类型已添加',
          '类型已添加，但预约类型刷新失败，已保留当前内容，请稍后重试',
          '类型已添加，但预约类型加载失败，请稍后重试'
        );
      } else {
        if (isDuplicateEntryError(error)) {
          setShowToast({ message: '类型名称已存在，请使用其他名称', type: 'warning' });
        } else {
          setShowToast({ message: `添加失败：${error?.message || '未知错误'}`, type: 'error' });
        }
        setTimeout(() => setShowToast(null), 3000);
      }
    }
    setSubmitting(false);
  };

  const handleToggleTypeStatus = async (type: BookingType) => {
    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: updatedType, error } = await dbClient
      .from('booking_types')
      .update({ is_active: !type.is_active })
      .eq('id', type.id)
      .eq('is_active', type.is_active)
      .select('id')
      .maybeSingle();

    if (!error && updatedType) {
      const successMessage = type.is_active ? '类型已禁用' : '类型已启用';
      const hadReadyTypes = typesReady;
      const refreshed = await refreshBookingTypesPanel({ silent: true });
      showRefreshFeedback(
        refreshed,
        hadReadyTypes,
        successMessage,
        `${successMessage}，但预约类型刷新失败，已保留当前内容，请稍后重试`,
        `${successMessage}，但预约类型加载失败，请稍后重试`
      );
    } else if (!error && !updatedType) {
      setShowToast({ message: '操作失败：类型状态已变化或记录不存在，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `操作失败：${error?.message || '未知错误'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteType = (type: BookingType) => {
    setDeletingType(type);
  };

  const confirmDeleteType = async () => {
    if (!deletingType) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingType(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: snapshotType, error: snapshotError } = await dbClient
        .from('booking_types')
        .select('id')
        .eq('id', deletingType.id)
        .maybeSingle();

      if (snapshotError) throw snapshotError;
      if (!snapshotType) {
        setActionLoading(false);
        setDeletingType(null);
        setShowToast({ message: '删除失败：类型不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error: deleteError } = await dbClient
        .from('booking_types')
        .delete()
        .eq('id', deletingType.id);

      if (deleteError) throw deleteError;

      const { data: remainingType, error: verifyError } = await dbClient
        .from('booking_types')
        .select('id')
        .eq('id', deletingType.id)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (remainingType) {
        throw new Error('删除失败，请稍后重试');
      }

      setActionLoading(false);
      setDeletingType(null);
      const hadReadyTypes = typesReady;
      const refreshed = await refreshBookingTypesPanel({ silent: true });
      showRefreshFeedback(
        refreshed,
        hadReadyTypes,
        '约拍类型已删除',
        '约拍类型已删除，但预约类型刷新失败，已保留当前内容，请稍后重试',
        '约拍类型已删除，但预约类型加载失败，请稍后重试'
      );
    } catch (error: any) {
      setActionLoading(false);
      setDeletingType(null);
      if (isForeignKeyConstraintError(error)) {
        setShowToast({ message: '删除失败：该类型仍被预约记录使用', type: 'warning' });
      } else {
        setShowToast({ message: `删除失败：${error?.message || '未知错误'}`, type: 'error' });
      }
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  // 城市管理函数
  const loadCities = async () => {
    const loadToken = citiesLoadTokenRef.current + 1;
    citiesLoadTokenRef.current = loadToken;
    const hasReadyCities = citiesReady;
    const isFirstLoad = !hasReadyCities;

    setCitiesLoading(isFirstLoad);
    setCitiesRefreshing(!isFirstLoad);
    setCitiesError('');

    const dbClient = createClient();
    if (!dbClient) {
      if (loadToken === citiesLoadTokenRef.current) {
        setCitiesLoading(false);
        setCitiesRefreshing(false);
        setCitiesError('加载城市配置失败，请稍后重试');
        setCitiesReady(hasReadyCities);
        if (!hasReadyCities) {
          setCities([]);
        }
      }
      return false;
    }

    try {
      const { data, error } = await dbClient.from('allowed_cities').select('*').order('id');
      if (loadToken !== citiesLoadTokenRef.current) {
        return false;
      }
      if (error) {
        throw error;
      }
      setCities(Array.isArray(data) ? data : []);
      setCitiesLoading(false);
      setCitiesRefreshing(false);
      setCitiesError('');
      setCitiesReady(true);
      return true;
    } catch (error) {
      if (loadToken === citiesLoadTokenRef.current) {
        setCitiesLoading(false);
        setCitiesRefreshing(false);
        setCitiesError(`加载城市配置失败：${formatErrorMessage(error)}`);
        setCitiesReady(hasReadyCities);
        if (!hasReadyCities) {
          setCities([]);
        }
      }
      return false;
    }
  };

  const refreshBookingsPanel = async (options: { silent?: boolean } = {}) => {
    const hadReadyBookings = bookingsReady;
    const refreshed = await loadBookings();
    if (!options.silent) {
      showRefreshFeedback(
        refreshed,
        hadReadyBookings,
        '预约列表已刷新',
        '预约列表刷新失败，已保留当前内容，请稍后重试',
        '加载预约列表失败，请稍后重试'
      );
    }
    return refreshed;
  };

  const refreshBookingTypesPanel = async (options: { silent?: boolean } = {}) => {
    const hadReadyTypes = typesReady;
    const refreshed = await loadBookingTypes();
    if (!options.silent) {
      showRefreshFeedback(
        refreshed,
        hadReadyTypes,
        '预约类型已刷新',
        '预约类型刷新失败，已保留当前内容，请稍后重试',
        '加载预约类型失败，请稍后重试'
      );
    }
    return refreshed;
  };

  const refreshCitiesPanel = async (options: { silent?: boolean } = {}) => {
    const hadReadyCities = citiesReady;
    const refreshed = await loadCities();
    if (!options.silent) {
      showRefreshFeedback(
        refreshed,
        hadReadyCities,
        '城市配置已刷新',
        '城市配置刷新失败，已保留当前内容，请稍后重试',
        '加载城市配置失败，请稍后重试'
      );
    }
    return refreshed;
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

  const handleCityMapSelect = (location: string, lat: number, lng: number, meta?: { cityName?: string; province?: string; adcode?: string; cityCode?: string }) => {
    const inferred = inferCityMetaFromLocation(location);
    const metaCityName = String(meta?.cityName ?? '').trim();
    const metaProvince = String(meta?.province ?? '').trim();
    const metaAdcode = String(meta?.adcode ?? meta?.cityCode ?? '').trim();

    setShowCityMapPicker(false);
    setCityLocation({ latitude: lat, longitude: lng });

    setCityFormData((prev) => ({
      ...prev,
      city_name: metaCityName || inferred.cityName || prev.city_name,
      province: metaProvince || inferred.province || prev.province,
      city_code: metaAdcode || prev.city_code,
    }));
  };

  const handleSaveCity = async () => {
    const normalizedCityName = cityFormData.city_name.trim();
    const normalizedProvince = cityFormData.province.trim();
    const normalizedCityCode = cityFormData.city_code.trim();

    if (!normalizedCityName) {
      setShowToast({ message: '请输入城市名称', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setSubmitting(true);
    const dbClient = createClient();
    if (!dbClient) {
      setSubmitting(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const locationPayload = {
      latitude: cityLocation.latitude || null,
      longitude: cityLocation.longitude || null,
    };
    const cityPayloadWithCode = {
      city_name: normalizedCityName,
      province: normalizedProvince || null,
      city_code: normalizedCityCode || null,
      ...locationPayload,
    };
    const cityPayloadWithoutCode = {
      city_name: normalizedCityName,
      province: normalizedProvince || null,
      ...locationPayload,
    };

    if (editingCity) {
      let { data: updatedCity, error } = await dbClient
        .from('allowed_cities')
        .update(cityPayloadWithCode)
        .eq('id', editingCity.id)
        .select('id')
        .maybeSingle();

      if (error && isColumnMissingError(error, 'city_code')) {
        const fallbackResult = await dbClient
          .from('allowed_cities')
          .update(cityPayloadWithoutCode)
          .eq('id', editingCity.id)
          .select('id')
          .maybeSingle();
        updatedCity = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (!error && updatedCity) {
        setShowCityModal(false);
        const hadReadyCities = citiesReady;
        const refreshed = await refreshCitiesPanel({ silent: true });
        showRefreshFeedback(
          refreshed,
          hadReadyCities,
          '城市已更新',
          '城市已更新，但城市配置刷新失败，已保留当前内容，请稍后重试',
          '城市已更新，但城市配置加载失败，请稍后重试'
        );
      } else if (!error && !updatedCity) {
        setShowToast({ message: '更新失败：城市不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        if (isDuplicateEntryError(error)) {
          setShowToast({ message: '城市编码或城市名称冲突，请检查后重试', type: 'warning' });
        } else {
          setShowToast({ message: `更新失败：${error?.message || '未知错误'}`, type: 'error' });
        }
        setTimeout(() => setShowToast(null), 3000);
      }
    } else {
      let { error } = await dbClient
        .from('allowed_cities')
        .insert(cityPayloadWithCode);

      if (error && isColumnMissingError(error, 'city_code')) {
        const fallbackResult = await dbClient
          .from('allowed_cities')
          .insert(cityPayloadWithoutCode);
        error = fallbackResult.error;
      }

      if (!error) {
        setShowCityModal(false);
        const hadReadyCities = citiesReady;
        const refreshed = await refreshCitiesPanel({ silent: true });
        showRefreshFeedback(
          refreshed,
          hadReadyCities,
          '城市已添加',
          '城市已添加，但城市配置刷新失败，已保留当前内容，请稍后重试',
          '城市已添加，但城市配置加载失败，请稍后重试'
        );
      } else {
        if (isDuplicateEntryError(error)) {
          setShowToast({ message: '城市编码或城市名称冲突，请检查后重试', type: 'warning' });
        } else {
          setShowToast({ message: `添加失败：${error?.message || '未知错误'}`, type: 'error' });
        }
        setTimeout(() => setShowToast(null), 3000);
      }
    }
    setSubmitting(false);
  };

  const handleToggleCityStatus = async (city: AllowedCity) => {
    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: updatedCity, error } = await dbClient
      .from('allowed_cities')
      .update({ is_active: !city.is_active })
      .eq('id', city.id)
      .eq('is_active', city.is_active)
      .select('id')
      .maybeSingle();

    if (!error && updatedCity) {
      const successMessage = city.is_active ? '城市已禁用' : '城市已启用';
      const hadReadyCities = citiesReady;
      const refreshed = await refreshCitiesPanel({ silent: true });
      showRefreshFeedback(
        refreshed,
        hadReadyCities,
        successMessage,
        `${successMessage}，但城市配置刷新失败，已保留当前内容，请稍后重试`,
        `${successMessage}，但城市配置加载失败，请稍后重试`
      );
    } else if (!error && !updatedCity) {
      setShowToast({ message: '操作失败：城市状态已变化或记录不存在，请刷新后重试', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `操作失败：${error?.message || '未知错误'}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleDeleteCity = (city: AllowedCity) => {
    setDeletingCity(city);
  };

  const confirmDeleteCity = async () => {
    if (!deletingCity) return;

    setActionLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setActionLoading(false);
      setDeletingCity(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { data: snapshotCity, error: snapshotError } = await dbClient
        .from('allowed_cities')
        .select('id')
        .eq('id', deletingCity.id)
        .maybeSingle();

      if (snapshotError) throw snapshotError;
      if (!snapshotCity) {
        setActionLoading(false);
        setDeletingCity(null);
        setShowToast({ message: '删除失败：城市不存在或已删除，请刷新后重试', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }

      const { error: deleteError } = await dbClient
        .from('allowed_cities')
        .delete()
        .eq('id', deletingCity.id);

      if (deleteError) throw deleteError;

      const { data: remainingCity, error: verifyError } = await dbClient
        .from('allowed_cities')
        .select('id')
        .eq('id', deletingCity.id)
        .maybeSingle();
      if (verifyError) throw verifyError;
      if (remainingCity) {
        throw new Error('删除失败，请稍后重试');
      }

      setActionLoading(false);
      setDeletingCity(null);
      const hadReadyCities = citiesReady;
      const refreshed = await refreshCitiesPanel({ silent: true });
      showRefreshFeedback(
        refreshed,
        hadReadyCities,
        '城市已删除',
        '城市已删除，但城市配置刷新失败，已保留当前内容，请稍后重试',
        '城市已删除，但城市配置加载失败，请稍后重试'
      );
    } catch (error: any) {
      setActionLoading(false);
      setDeletingCity(null);
      if (isForeignKeyConstraintError(error)) {
        setShowToast({ message: '删除失败：该城市仍被预约记录使用', type: 'warning' });
      } else {
        setShowToast({ message: `删除失败：${error?.message || '未知错误'}`, type: 'error' });
      }
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const hasBookingFilters = bookingKeyword.trim().length > 0 || filter !== 'all';

  return (
    <div className="admin-mobile-page booking-admin-page space-y-5 pt-6">
      <div className="module-intro booking-page-intro">
        <h1 className="module-title" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          预约管理 📅
        </h1>
        <p className="module-desc">管理用户预约申请</p>
      </div>

      <div className="booking-tabs">
        {BOOKING_PANEL_TABS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setActiveTab(item.key)}
            className={`booking-tab-item ${activeTab === item.key ? 'booking-tab-item--active' : ''}`}
          >
            <span className="booking-tab-item__inner">
              <span className="booking-tab-item__text">{item.label}</span>
              {activeTab === item.key ? <span className="booking-tab-item__line" /> : null}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'bookings' && (
        <div className="booking-panel">
          <div className="booking-toolbar">
            <div className="booking-filter-scroll">
              <div className="booking-filter-list">
                {BOOKING_FILTER_OPTIONS.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setFilter(item.key)}
                    className={`booking-filter-chip ${filter === item.key ? 'booking-filter-chip--active' : ''}`}
                  >
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

          </div>

          <div className="booking-search-row">
            <div className="booking-search-box">
              <Search className="booking-search-box__icon" />
              <input
                type="text"
                value={bookingKeyword}
                onChange={(event) => setBookingKeyword(event.target.value)}
                className="booking-search-box__input"
                placeholder={bookingSearchPlaceholder}
              />
              {bookingKeyword && (
                <button
                  type="button"
                  className="booking-search-box__clear"
                  onClick={() => setBookingKeyword('')}
                  aria-label="清空搜索"
                >
                  <X className="booking-search-box__clear-icon" />
                </button>
              )}
            </div>
            {bookingKeyword && bookingsReady && !bookingsLoading && (
              <p className="booking-search-row__meta">匹配 {filteredBookings.length} 条</p>
            )}
          </div>

          {!isBookingSelectionMode && (
            <div className="booking-search-actions">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--danger"
                onClick={() => setIsBookingSelectionMode(true)}
                disabled={actionLoading || bookingDeletableCount <= 0}
              >
                批量删除
              </button>
            </div>
          )}

          {isBookingSelectionMode && (
            <div className="booking-search-actions booking-search-actions--selection">
              <div className="booking-toolbar-actions booking-toolbar-actions--selection booking-toolbar-actions--selection-row">
                <button
                  type="button"
                  className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                  onClick={selectAllBookings}
                  disabled={actionLoading || bookingDeletableIds.length === 0}
                >
                  {bookingAllSelected ? '取消全选' : '全选'} ({bookingSelectedCount}/{bookingDeletableIds.length})
                </button>
                <button
                  type="button"
                  className="booking-pill-btn booking-pill-btn--danger booking-pill-btn--compact"
                  onClick={handleBatchDeleteBookings}
                  disabled={actionLoading || bookingSelectedCount === 0}
                >
                  删除选中 ({bookingSelectedCount})
                </button>
                <button
                  type="button"
                  className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                  onClick={clearBookingSelection}
                  disabled={actionLoading}
                >
                  取消
                </button>
              </div>
            </div>
          )}

          {bookingsError && bookingsReady ? (
            <div className="booking-inline-error">
              <p className="booking-inline-error__text">{bookingsError}</p>
            </div>
          ) : null}

          {bookingsLoading && !bookingsReady ? (
            <AdminLoadingCard description="正在同步最新预约数据，请稍候。" variant="inline" />
          ) : !bookingsReady ? (
            <div className={`booking-state-card ${bookingsError ? 'booking-state-card--error' : 'booking-state-card--empty'}`}>
              <div className={`booking-state-card__badge ${bookingsError ? 'booking-state-card__badge--error' : 'booking-state-card__badge--empty'}`}>
                {bookingsError ? <AlertCircle className="booking-state-card__icon" /> : <Calendar className="booking-state-card__icon" />}
              </div>
              <p className="booking-state-card__title">{bookingsError ? '加载失败' : '暂无预约数据'}</p>
              <p className="booking-state-card__desc">{bookingsError || '请稍后重试或手动刷新预约列表'}</p>
              <button
                type="button"
                className="booking-state-card__action"
                onClick={() => void refreshBookingsPanel()}
                disabled={bookingsLoading || bookingsRefreshing}
              >
                {bookingsLoading || bookingsRefreshing ? '刷新中...' : '重新加载'}
              </button>
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className={`booking-state-card ${hasBookingFilters ? 'booking-state-card--search' : 'booking-state-card--empty'}`}>
              <div className={`booking-state-card__badge ${hasBookingFilters ? 'booking-state-card__badge--search' : 'booking-state-card__badge--empty'}`}>
                {hasBookingFilters ? <Search className="booking-state-card__icon" /> : <Calendar className="booking-state-card__icon" />}
              </div>
              <p className="booking-state-card__title">{hasBookingFilters ? '未找到匹配预约' : '暂无预约记录'}</p>
              <p className="booking-state-card__desc">{hasBookingFilters ? '请调整筛选条件后再试' : '当前还没有用户提交预约'}</p>
              <button
                type="button"
                className="booking-state-card__action"
                onClick={() => {
                  if (hasBookingFilters) {
                    setBookingKeyword('');
                    setFilter('all');
                    return;
                  }
                  void refreshBookingsPanel();
                }}
                disabled={bookingsLoading || bookingsRefreshing}
              >
                {bookingsLoading || bookingsRefreshing ? '刷新中...' : hasBookingFilters ? '清空筛选' : '刷新列表'}
              </button>
            </div>
          ) : (
            <>
              <div className="booking-cards">
                <AnimatePresence initial={false}>
                  {bookingRows.map((booking) => {
                    const isDeletable = isBookingDeletable(booking.status);
                    const isSelected = selectedBookingIds.includes(booking.id);
                    const canConfirm = booking.status === 'pending';
                    const canStart = booking.status === 'confirmed';
                    const canFinish = booking.status === 'in_progress';
                    const canCancel = ['pending', 'confirmed', 'in_progress'].includes(booking.status);
                    const latitude = Number(booking.latitude);
                    const longitude = Number(booking.longitude);
                    const hasCoordinate = Number.isFinite(latitude) && Number.isFinite(longitude);
                    const locationDisplay = booking.location || booking.city_name || '未设置地点';
                    const phoneDisplay = booking.phone || '未填写手机号';
                    const wechatDisplay = booking.wechat || '未填写微信号';
                    const userDisplay = booking.profiles?.name || '未知用户';
                    const userEmail = booking.profiles?.email || '';

                    return (
                      <motion.div
                        key={booking.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -12 }}
                        className={`booking-card ${
                          isBookingSelectionMode && isDeletable
                            ? isSelected
                              ? 'booking-card--selected'
                              : 'booking-card--selectable'
                            : ''
                        }`}
                        onClick={() => {
                          if (isBookingSelectionMode && isDeletable) {
                            toggleBookingSelection(booking.id);
                          }
                        }}
                      >
                        <div className="booking-card__head">
                          <div className="booking-card__user-wrap">
                            {isBookingSelectionMode && isDeletable && (
                              <div className={`booking-card__check ${isSelected ? 'booking-card__check--active' : ''}`}>
                                {isSelected ? <span>✓</span> : null}
                              </div>
                            )}
                            <div className="booking-card__avatar">
                              <User className="booking-card__avatar-icon" strokeWidth={2.1} />
                            </div>
                            <div className="booking-card__user">
                              <span className="booking-card__name">{userDisplay}</span>
                              {userEmail ? <span className="booking-card__email">{userEmail}</span> : null}
                            </div>
                          </div>
                          <div className={`booking-status-chip ${getStatusChipClass(booking.status)}`}>
                            <span>{getStatusText(booking.status)}</span>
                          </div>
                        </div>

                        <div className="booking-card__grid">
                          <div className="booking-info-row booking-info-row--date">
                            <span className="booking-info-row__icon">
                              <Calendar className="booking-info-row__icon-svg" strokeWidth={2.1} />
                            </span>
                            <span className="booking-info-row__text">{booking.booking_date || '未设置日期'}</span>
                          </div>
                          <div className="booking-info-row booking-info-row--phone">
                            <span className="booking-info-row__icon">
                              <Phone className="booking-info-row__icon-svg" strokeWidth={2.1} />
                            </span>
                            <span className="booking-info-row__text">{phoneDisplay}</span>
                          </div>
                          <div className="booking-info-row booking-info-row--location">
                            <span className="booking-info-row__icon">
                              <MapPin className="booking-info-row__icon-svg" strokeWidth={2.1} />
                            </span>
                            <span className="booking-info-row__text">{locationDisplay}</span>
                          </div>
                          <div className="booking-info-row booking-info-row--wechat">
                            <span className="booking-info-row__icon">
                              <MessageSquare className="booking-info-row__icon-svg" strokeWidth={2.1} />
                            </span>
                            <span className="booking-info-row__text">{wechatDisplay}</span>
                          </div>
                        </div>

                        {booking.booking_types?.name ? (
                          <div className="booking-type-chip">
                            <span>{booking.booking_types.name}</span>
                          </div>
                        ) : null}

                        {booking.notes ? (
                          <div className="booking-notes">
                            <span className="booking-notes__text">{booking.notes}</span>
                          </div>
                        ) : null}

                        <span className="booking-card__meta">{formatBookingMetaTime(booking.created_at)}</span>

                        {!isBookingSelectionMode && (
                          <div className="booking-card__actions">
                            {canConfirm ? (
                              <button
                                type="button"
                                className="booking-action-btn booking-action-btn--confirm"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleConfirm(booking.id);
                                }}
                                disabled={actionLoading}
                              >
                                确认预约
                              </button>
                            ) : null}
                            {canStart ? (
                              <button
                                type="button"
                                className="booking-action-btn booking-action-btn--start"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleStart(booking.id);
                                }}
                                disabled={actionLoading}
                              >
                                开始拍摄
                              </button>
                            ) : null}
                            {canFinish ? (
                              <button
                                type="button"
                                className="booking-action-btn booking-action-btn--start"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleFinish(booking.id);
                                }}
                                disabled={actionLoading}
                              >
                                完成预约
                              </button>
                            ) : null}
                            {canCancel ? (
                              <button
                                type="button"
                                className="booking-action-btn booking-action-btn--cancel"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleCancel(booking.id);
                                }}
                                disabled={actionLoading}
                              >
                                取消预约
                              </button>
                            ) : null}
                            {hasCoordinate ? (
                              <button
                                type="button"
                                className="booking-action-btn booking-action-btn--map"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openBookingLocation(booking);
                                }}
                                disabled={actionLoading}
                              >
                                查看定位
                              </button>
                            ) : null}
                            {isDeletable ? (
                              <button
                                type="button"
                                className="booking-action-btn booking-action-btn--delete"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeleteSingleBooking(booking.id);
                                }}
                                disabled={actionLoading}
                              >
                                删除订单
                              </button>
                            ) : null}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>

              <div className="booking-pagination">
                <span className="booking-page-indicator">
                  {bookingHasMoreVisible
                    ? `已加载 ${bookingRows.length} / ${filteredBookings.length} 条，继续下滑自动加载`
                    : `已全部加载，共 ${filteredBookings.length} 条`}
                </span>
              </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'types' && (
        <div className="booking-panel">
          <div className="booking-toolbar booking-toolbar--right">
            <div className="booking-toolbar-actions booking-toolbar-actions--right booking-toolbar-actions--manage">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--primary"
                onClick={handleAddType}
                disabled={submitting || actionLoading}
              >
                + 添加类型
              </button>
            </div>
          </div>

          {typesLoading ? (
            <AdminLoadingCard description="正在同步预约类型配置，请稍候。" variant="compact" />
          ) : bookingTypes.length === 0 ? (
            <div className="booking-empty-card text-center">
              <span className="booking-empty-card__icon">📷</span>
              <p className="text-sm text-[#5D4037]/60">暂无约拍类型</p>
            </div>
          ) : (
            <div className="booking-config-grid">
              {bookingTypes.map((type) => (
                <div key={type.id} className="booking-config-card">
                  <div className="booking-config-card__head">
                    <div className="booking-config-card__main">
                      <span className="booking-config-card__title">{type.name}</span>
                      {type.description ? <span className="booking-config-card__desc">{type.description}</span> : null}
                    </div>
                    <div className={`booking-config-state ${type.is_active ? 'booking-config-state--active' : 'booking-config-state--inactive'}`}>
                      <span>{type.is_active ? '启用' : '禁用'}</span>
                    </div>
                  </div>
                  <div className="booking-config-card__actions">
                    <button
                      type="button"
                      className="booking-config-btn booking-config-btn--edit"
                      onClick={() => handleEditType(type)}
                      disabled={submitting || actionLoading}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="booking-config-btn booking-config-btn--delete"
                      onClick={() => handleDeleteType(type)}
                      disabled={submitting || actionLoading}
                    >
                      删除
                    </button>
                    <button
                      type="button"
                      className={`booking-config-btn ${type.is_active ? 'booking-config-btn--disable' : 'booking-config-btn--enable'}`}
                      onClick={() => handleToggleTypeStatus(type)}
                      disabled={submitting || actionLoading}
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

      {activeTab === 'cities' && (
        <div className="booking-panel">
          <div className="booking-toolbar booking-toolbar--right">
            <div className="booking-toolbar-actions booking-toolbar-actions--right booking-toolbar-actions--manage">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--primary"
                onClick={handleAddCity}
                disabled={submitting || actionLoading}
              >
                + 添加城市
              </button>
            </div>
          </div>

          {citiesLoading ? (
            <AdminLoadingCard description="正在同步可预约城市配置，请稍候。" variant="compact" />
          ) : cities.length === 0 ? (
            <div className="booking-empty-card text-center">
              <span className="booking-empty-card__icon">📍</span>
              <p className="text-sm text-[#5D4037]/60">暂无允许的城市</p>
            </div>
          ) : (
            <div className="booking-config-grid">
              {cities.map((city) => {
                const hasCoordinate = Number.isFinite(Number(city.latitude)) && Number.isFinite(Number(city.longitude));
                const locationText = hasCoordinate
                  ? `坐标：${Number(city.latitude).toFixed(6)}, ${Number(city.longitude).toFixed(6)}`
                  : '';

                return (
                  <div key={city.id} className="booking-config-card">
                    <div className="booking-config-card__head">
                      <div className="booking-config-card__main">
                        <span className="booking-config-card__title">{city.city_name}</span>
                        {city.province ? <span className="booking-config-card__desc">{city.province}</span> : null}
                        {city.city_code ? <span className="booking-config-card__meta">代码：{city.city_code}</span> : null}
                        {locationText ? <span className="booking-config-card__meta">{locationText}</span> : null}
                      </div>
                      <div className={`booking-config-state ${city.is_active ? 'booking-config-state--active' : 'booking-config-state--inactive'}`}>
                        <span>{city.is_active ? '启用' : '禁用'}</span>
                      </div>
                    </div>
                    <div className="booking-config-card__actions">
                      <button
                        type="button"
                        className="booking-config-btn booking-config-btn--edit"
                        onClick={() => handleEditCity(city)}
                        disabled={submitting || actionLoading}
                      >
                        编辑
                      </button>
                      <button
                        type="button"
                        className="booking-config-btn booking-config-btn--delete"
                        onClick={() => handleDeleteCity(city)}
                        disabled={submitting || actionLoading}
                      >
                        删除
                      </button>
                      <button
                        type="button"
                        className={`booking-config-btn ${city.is_active ? 'booking-config-btn--disable' : 'booking-config-btn--enable'}`}
                        onClick={() => handleToggleCityStatus(city)}
                        disabled={submitting || actionLoading}
                      >
                        {city.is_active ? '禁用' : '启用'}
                      </button>
                    </div>
                  </div>
                );
              })}
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
            className="booking-modal-mask"
            onClick={() => setShowTypeModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="booking-modal booking-modal--form"
            >
              <div className="booking-modal__head">
                <h2 className="booking-modal__title">{editingType ? '编辑类型' : '添加类型'}</h2>
                <button
                  type="button"
                  onClick={() => setShowTypeModal(false)}
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭类型弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="booking-modal__body">
                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    类型名称 <span className="booking-modal__required">*</span>
                  </label>
                  <input
                    type="text"
                    value={typeFormData.name}
                    onChange={(e) => setTypeFormData({ ...typeFormData, name: e.target.value })}
                    placeholder="例如：常规约拍"
                    className="booking-modal__input"
                  />
                </div>

                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    描述（可选）
                  </label>
                  <textarea
                    value={typeFormData.description}
                    onChange={(e) => setTypeFormData({ ...typeFormData, description: e.target.value })}
                    placeholder="简单描述这个类型..."
                    rows={3}
                    className="booking-modal__textarea"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveType}
                  disabled={submitting}
                  className="booking-modal__submit"
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
            className="booking-modal-mask"
            onClick={() => setShowCityModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="booking-modal booking-modal--form"
            >
              <div className="booking-modal__head">
                <h2 className="booking-modal__title">{editingCity ? '编辑城市' : '添加城市'}</h2>
                <button
                  type="button"
                  onClick={() => setShowCityModal(false)}
                  className="icon-button action-icon-btn action-icon-btn--close"
                  aria-label="关闭城市弹窗"
                >
                  <X className="action-icon-svg" aria-hidden="true" />
                </button>
              </div>

              <div className="booking-modal__body">
                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    城市名称 <span className="booking-modal__required">*</span>
                  </label>
                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={() => setShowCityMapPicker(true)}
                      className="booking-city-picker"
                    >
                      <div className="booking-city-picker__main text-left">
                          {cityFormData.city_name ? (
                            <p className="booking-city-picker__value">{cityFormData.city_name}</p>
                          ) : (
                            <p className="booking-city-picker__placeholder">点击在地图上选择城市...</p>
                          )}
                      </div>
                      <MapPin className="booking-city-picker__icon h-5 w-5" />
                    </button>
                    <input
                      type="text"
                      value={cityFormData.city_name}
                      onChange={(e) => setCityFormData({ ...cityFormData, city_name: e.target.value })}
                      placeholder="或手动输入城市名称"
                      className="booking-modal__input"
                    />
                  </div>
                </div>

                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    省份（可选）
                  </label>
                  <input
                    type="text"
                    value={cityFormData.province}
                    onChange={(e) => setCityFormData({ ...cityFormData, province: e.target.value })}
                    placeholder="例如：广西壮族自治区"
                    className="booking-modal__input"
                  />
                </div>

                <div className="booking-modal__field">
                  <label className="booking-modal__label">
                    城市代码（可选）
                  </label>
                  <input
                    type="text"
                    value={cityFormData.city_code}
                    onChange={(e) => setCityFormData({ ...cityFormData, city_code: e.target.value })}
                    placeholder="腾讯地图 adcode（可选）"
                    className="booking-modal__input"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveCity}
                  disabled={submitting}
                  className="booking-modal__submit"
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
            className="booking-modal-mask"
            onClick={() => !actionLoading && setCancelingBooking(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="booking-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-confirm-modal__head">
                <div className="booking-confirm-modal__icon booking-confirm-modal__icon--danger">
                  <X className="w-8 h-8 text-red-600" />
                </div>
                <span className="booking-confirm-modal__title">取消预约</span>
                <span className="booking-confirm-modal__desc">
                  确定要取消这个预约吗？
                </span>
              </div>
              <div className="booking-confirm-modal__actions">
                <button
                  type="button"
                  onClick={() => setCancelingBooking(null)}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                >
                  返回
                </button>
                <button
                  type="button"
                  onClick={confirmCancel}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--danger"
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
            className="booking-modal-mask"
            onClick={() => !actionLoading && setDeletingType(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="booking-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-confirm-modal__head">
                <div className="booking-confirm-modal__icon booking-confirm-modal__icon--danger">
                  <Trash2 className="h-7 w-7 text-red-600" />
                </div>
                <span className="booking-confirm-modal__title">确认删除约拍类型</span>
                <span className="booking-confirm-modal__desc">
                  确定要删除约拍类型「<span className="booking-confirm-modal__accent">{deletingType.name}</span>」吗？
                </span>
                <div className="booking-confirm-modal__warn">此操作不可撤销。</div>
              </div>
              <div className="booking-confirm-modal__actions">
                <button
                  type="button"
                  onClick={() => setDeletingType(null)}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteType}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--danger"
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
            className="booking-modal-mask"
            onClick={() => !actionLoading && closeBatchDeleteBookingsConfirm()}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="booking-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-confirm-modal__head">
                <div className="booking-confirm-modal__icon booking-confirm-modal__icon--danger">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <span className="booking-confirm-modal__title">
                  {bookingSelectedCount === 1 ? '删除预约' : '批量删除预约'}
                </span>
                <span className="booking-confirm-modal__desc">
                  确定要删除选中的 <span className="booking-confirm-modal__accent">{bookingSelectedCount}</span> 个预约吗？
                </span>
                <div className="booking-confirm-modal__warn">
                  <AlertCircle className="mr-1 inline h-4 w-4" />
                  此操作不可撤销！
                </div>
              </div>
              <div className="booking-confirm-modal__actions">
                <button
                  type="button"
                  onClick={closeBatchDeleteBookingsConfirm}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmBatchDeleteBookings}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--danger"
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
            className="booking-modal-mask"
            onClick={() => !actionLoading && setDeletingCity(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="booking-confirm-modal"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="booking-confirm-modal__head">
                <div className="booking-confirm-modal__icon booking-confirm-modal__icon--danger">
                  <Trash2 className="h-7 w-7 text-red-600" />
                </div>
                <span className="booking-confirm-modal__title">确认删除城市</span>
                <span className="booking-confirm-modal__desc">
                  确定要删除城市「<span className="booking-confirm-modal__accent">{deletingCity.city_name}</span>」吗？
                </span>
                <div className="booking-confirm-modal__warn">此操作不可撤销。</div>
              </div>
              <div className="booking-confirm-modal__actions">
                <button
                  type="button"
                  onClick={() => setDeletingCity(null)}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--ghost"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCity}
                  disabled={actionLoading}
                  className="booking-confirm-modal__btn booking-confirm-modal__btn--danger"
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
            cityName={cityFormData.city_name}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
