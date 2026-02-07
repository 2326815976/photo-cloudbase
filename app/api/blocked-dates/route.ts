import { createAdminClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getTodayUTC8, getDateAfterDaysUTC8 } from '@/lib/utils/date-helpers';

export const dynamic = 'force-dynamic';
export const revalidate = 0; // 禁用缓存,实时获取最新数据

export async function GET() {
  try {
    // 使用管理员客户端绕过RLS策略,查询所有用户的预约记录
    const supabase = createAdminClient();

    // 使用UTC时间统一处理日期，避免时区问题
    const today = getTodayUTC8();
    const maxDateStr = getDateAfterDaysUTC8(30);

    // 1. 获取管理员锁定的日期
    const { data: blackoutData, error: blackoutError } = await supabase
      .from('booking_blackouts')
      .select('date')
      .gte('date', today)
      .lte('date', maxDateStr);

    if (blackoutError) {
      console.error('Error fetching blackout dates:', blackoutError);
    }

    // 2. 获取已有预约的日期（pending、confirmed、in_progress状态）
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select('booking_date')
      .in('status', ['pending', 'confirmed', 'in_progress'])
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

    return NextResponse.json({ dates });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ dates: [] }, { status: 200 });
  }
}
