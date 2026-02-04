import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const revalidate = 300; // 缓存5分钟

export async function GET() {
  try {
    const supabase = await createClient();

    // 格式化日期为本地时间 YYYY-MM-DD（避免UTC时区问题）
    const formatLocalDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // 查询未来30天内的锁定日期
    const today = formatLocalDate(new Date());
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = formatLocalDate(maxDate);

    const { data, error } = await supabase
      .from('booking_blackouts')
      .select('date')
      .gte('date', today)
      .lte('date', maxDateStr)
      .order('date');

    if (error) {
      console.error('Error fetching blocked dates:', error);
      return NextResponse.json({ dates: [] }, { status: 200 });
    }

    // 返回日期数组
    const dates = data?.map(item => item.date) || [];
    return NextResponse.json({ dates });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ dates: [] }, { status: 200 });
  }
}
