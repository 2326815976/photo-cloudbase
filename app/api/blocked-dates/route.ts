import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const revalidate = 300; // 缓存5分钟

export async function GET() {
  try {
    const supabase = await createClient();

    // 查询未来30天内的锁定日期
    const today = new Date().toISOString().split('T')[0];
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 30);
    const maxDateStr = maxDate.toISOString().split('T')[0];

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
