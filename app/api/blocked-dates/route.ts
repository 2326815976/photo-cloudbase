import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // 禁用缓存,实时获取最新数据

export async function GET() {
  try {
    // 使用管理员客户端绕过RLS策略,查询所有用户的预约记录
    const supabase = createAdminClient();

    // 格式化日期为本地时间 YYYY-MM-DD（避免UTC时区问题）
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 查询未来30天内的锁定日期和已预约日期
    const today = formatLocalDate(new Date());
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = formatLocalDate(maxDate);

    // 1. 获取管理员锁定的日期
    const { data: blackoutData, error: blackoutError } = await supabase
      .from('booking_blackouts')
      .select('date')
      .gte('date', today)
      .lte('date', maxDateStr);

    if (blackoutError) {
      console.error('Error fetching blackout dates:', blackoutError);
    }

    // 2. 获取已有预约的日期（pending和confirmed状态）
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select('booking_date')
      .in('status', ['pending', 'confirmed'])
      .gte('booking_date', today)
      .lte('booking_date', maxDateStr);

    if (bookingError) {
      console.error('Error fetching booked dates:', bookingError);
    }

    // 3. 合并所有不可用日期（去重）
    const blockedDates = new Set<string>();

    // 添加当天日期（不可选）
    blockedDates.add(today);

    // 添加锁定日期
    blackoutData?.forEach(item => blockedDates.add(item.date));

    // 添加已预约日期
    bookingData?.forEach(item => blockedDates.add(item.booking_date));

    const dates = Array.from(blockedDates).sort();

    // 调试日志
    console.log('[blocked-dates API] 返回的不可用日期:', dates);
    console.log('[blocked-dates API] 锁定日期数量:', blackoutData?.length || 0);
    console.log('[blocked-dates API] 已预约日期数量:', bookingData?.length || 0);

    return NextResponse.json({ dates });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ dates: [] }, { status: 200 });
  }
}
