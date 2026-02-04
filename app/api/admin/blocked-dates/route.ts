import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // 不缓存

// 获取所有锁定日期（管理端）
export async function GET() {
  try {
    const supabase = await createClient();

    // 验证管理员权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    // 查询所有锁定日期
    const { data, error } = await supabase
      .from('booking_blackouts')
      .select('*')
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching blocked dates:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({ data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 添加锁定日期
export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // 验证管理员权限
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    // 解析请求体
    const body = await request.json();
    const { date, reason } = body;

    if (!date) {
      return NextResponse.json({ error: '日期不能为空' }, { status: 400 });
    }

    // 插入锁定日期
    const { data, error } = await supabase
      .from('booking_blackouts')
      .insert({ date, reason: reason || null })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') { // 唯一约束冲突
        return NextResponse.json({ error: '该日期已被锁定' }, { status: 409 });
      }
      console.error('Error inserting blocked date:', error);
      return NextResponse.json({ error: '添加失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
