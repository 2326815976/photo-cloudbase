import { createAdminClient, createClient } from '@/lib/cloudbase/server';
import { NextResponse } from 'next/server';
import { getTodayUTC8 } from '@/lib/utils/date-helpers';

export const dynamic = 'force-dynamic'; // 不缓存

type SessionClient = Awaited<ReturnType<typeof createClient>>;
type AdminCheckResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

async function ensureAdminSession(dbClient: SessionClient): Promise<AdminCheckResult> {
  const { data: authData } = await dbClient.auth.getUser();
  const user = authData?.user ?? null;
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: '未授权' }, { status: 401 }),
    };
  }

  let isAdmin = String((user as { role?: unknown }).role ?? '').trim() === 'admin';
  if (!isAdmin) {
    const { data: profile, error: profileError } = await dbClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      console.error('Error checking admin profile:', profileError);
      return {
        ok: false,
        response: NextResponse.json({ error: '读取管理员信息失败' }, { status: 500 }),
      };
    }

    isAdmin = String((profile as { role?: unknown } | null)?.role ?? '').trim() === 'admin';
  }

  if (!isAdmin) {
    return {
      ok: false,
      response: NextResponse.json({ error: '需要管理员权限' }, { status: 403 }),
    };
  }

  return { ok: true, userId: String(user.id || '') };
}

async function cleanupExpiredBlockedDates(dbClient: ReturnType<typeof createAdminClient>, today: string) {
  try {
    const { error } = await dbClient
      .from('booking_blackouts')
      .delete()
      .lt('date', today);
    if (error) {
      console.error('Error cleaning expired blocked dates:', error);
    }
  } catch (error) {
    console.error('Unexpected cleanup error:', error);
  }
}

// 获取所有锁定日期（管理端）
export async function GET() {
  try {
    const sessionClient = await createClient();
    const adminCheck = await ensureAdminSession(sessionClient);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }
    const adminDbClient = createAdminClient();

    // 使用UTC时间获取今天的日期，只查询今天及以后的锁定日期
    const today = getTodayUTC8();
    await cleanupExpiredBlockedDates(adminDbClient, today);

    // 查询所有锁定日期(只选择需要的字段)
    const { data, error } = await adminDbClient
      .from('booking_blackouts')
      .select('id, date, reason, created_at')
      .gte('date', today)
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
    const sessionClient = await createClient();
    const adminCheck = await ensureAdminSession(sessionClient);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }
    const adminDbClient = createAdminClient();

    // 解析请求体
    const body = await request.json();
    const { date, reason } = body;

    // 输入验证
    if (!date) {
      return NextResponse.json({ error: '日期不能为空' }, { status: 400 });
    }

    // 验证日期格式 (YYYY-MM-DD)
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(date)) {
      return NextResponse.json({ error: '日期格式错误，应为 YYYY-MM-DD' }, { status: 400 });
    }

    // 验证日期是否有效
    const dateObj = new Date(date + 'T00:00:00Z');
    if (isNaN(dateObj.getTime())) {
      return NextResponse.json({ error: '无效的日期' }, { status: 400 });
    }

    // 验证日期不能是过去的日期
    const today = getTodayUTC8();
    await cleanupExpiredBlockedDates(adminDbClient, today);
    if (date < today) {
      return NextResponse.json({ error: '不能锁定过去的日期' }, { status: 400 });
    }

    const { data: existingRow, error: existingError } = await adminDbClient
      .from('booking_blackouts')
      .select('id, date')
      .eq('date', date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing blocked date:', existingError);
      return NextResponse.json({ error: '校验锁定日期失败，请稍后重试' }, { status: 500 });
    }
    if (existingRow) {
      return NextResponse.json({ error: '该日期已被锁定' }, { status: 409 });
    }

    // 插入锁定日期
    const { data, error } = await adminDbClient
      .from('booking_blackouts')
      .insert({ date, reason: reason || null })
      .select()
      .maybeSingle();

    if (error) {
      const errorCode = String(error.code ?? '');
      const errorMessage = String(error.message ?? '');
      if (
        errorCode === '23505' ||
        errorCode === '1062' ||
        /duplicate entry/i.test(errorMessage)
      ) { // 唯一约束冲突
        return NextResponse.json({ error: '该日期已被锁定' }, { status: 409 });
      }
      console.error('Error inserting blocked date:', error);
      return NextResponse.json(
        { error: `添加失败：${String(errorMessage || errorCode || '未知错误')}` },
        { status: 500 }
      );
    }

    if (!data) {
      const { data: fallback, error: fallbackError } = await adminDbClient
        .from('booking_blackouts')
        .select('id, date, reason, created_at')
        .eq('date', date)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fallbackError) {
        console.error('Error reading inserted blocked date:', fallbackError);
        return NextResponse.json({ error: '添加成功但读取结果失败，请刷新重试' }, { status: 500 });
      }
      return NextResponse.json({ success: true, data: fallback ?? null });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}


