import { createAdminClient, createClient } from '@/lib/cloudbase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // 不缓存

type SessionClient = Awaited<ReturnType<typeof createClient>>;
type AdminCheckResult =
  | { ok: true }
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

  return { ok: true };
}

function normalizeDateLiteral(input: unknown): string {
  if (!input) {
    return '';
  }

  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) {
      return '';
    }

    const directMatch = raw.match(/^(\d{4}-\d{2}-\d{2})/);
    if (directMatch && directMatch[1]) {
      return directMatch[1];
    }

    const parsed = new Date(raw);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }

    return '';
  }

  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    return input.toISOString().slice(0, 10);
  }

  if (typeof input === 'object' && input !== null) {
    const nested = (input as { value?: unknown }).value;
    if (nested !== undefined) {
      return normalizeDateLiteral(nested);
    }
  }

  return '';
}

// 删除锁定日期
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const blockedDateId = Number(id);
    if (!Number.isInteger(blockedDateId) || blockedDateId <= 0) {
      return NextResponse.json({ error: '锁定日期 ID 非法' }, { status: 400 });
    }
    const sessionClient = await createClient();
    const adminCheck = await ensureAdminSession(sessionClient);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }
    const adminDbClient = createAdminClient();

    // 快照：避免并发/重复删除造成假成功
    const { data: snapshotRow, error: snapshotError } = await adminDbClient
      .from('booking_blackouts')
      .select('id, date')
      .eq('id', blockedDateId)
      .maybeSingle();

    if (snapshotError) {
      console.error('Error fetching blocked date snapshot:', snapshotError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    if (!snapshotRow) {
      return NextResponse.json({ error: '锁定日期不存在或已删除' }, { status: 404 });
    }
    const targetDate = normalizeDateLiteral((snapshotRow as { date?: unknown }).date);

    // 先按主键删除，保证本次操作目标行一定被真正删除
    const { error: deleteByIdError } = await adminDbClient
      .from('booking_blackouts')
      .delete()
      .eq('id', blockedDateId);

    if (deleteByIdError) {
      console.error('Error deleting blocked date by id:', deleteByIdError);
      return NextResponse.json(
        { error: `删除失败：${String(deleteByIdError.message || deleteByIdError.code || '未知错误')}` },
        { status: 500 }
      );
    }

    const { data: remainingById, error: verifyByIdError } = await adminDbClient
      .from('booking_blackouts')
      .select('id')
      .eq('id', blockedDateId)
      .maybeSingle();

    if (verifyByIdError) {
      console.error('Error verifying blocked date delete by id:', verifyByIdError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    if (remainingById) {
      return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 });
    }

    // 历史脏数据兼容：同一天可能存在重复记录，额外按日期清理，避免“删除后又恢复”
    if (targetDate) {
      const { error: deleteByDateError } = await adminDbClient
        .from('booking_blackouts')
        .delete()
        .eq('date', targetDate);

      if (deleteByDateError) {
        console.error('Error deleting duplicated blocked dates by date:', deleteByDateError);
        return NextResponse.json(
          { error: `删除失败：${String(deleteByDateError.message || deleteByDateError.code || '未知错误')}` },
          { status: 500 }
        );
      }

      const { data: remainingByDate, error: verifyByDateError } = await adminDbClient
        .from('booking_blackouts')
        .select('id')
        .eq('date', targetDate)
        .maybeSingle();

      if (verifyByDateError) {
        console.error('Error verifying blocked date delete by date:', verifyByDateError);
        return NextResponse.json({ error: '删除失败' }, { status: 500 });
      }

      if (remainingByDate) {
        return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, date: targetDate || null });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}


