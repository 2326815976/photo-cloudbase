import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/cloudbase/server';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

type SessionClient = Awaited<ReturnType<typeof createClient>>;
type AdminCheckResult =
  | { ok: true }
  | { ok: false; response: NextResponse };

function buildTransientResponse() {
  return NextResponse.json(
    {
      error: TRANSIENT_BACKEND_ERROR_MESSAGE,
      code: TRANSIENT_BACKEND_ERROR_CODE,
    },
    { status: 503 }
  );
}

function buildServerErrorResponse(message: string, status: number = 500) {
  return NextResponse.json({ error: message }, { status });
}

async function ensureAdminSession(dbClient: SessionClient): Promise<AdminCheckResult> {
  const { data: authData, error: authError } = await dbClient.auth.getUser();
  if (authError) {
    if (isRetryableSqlError(authError)) {
      return { ok: false, response: buildTransientResponse() };
    }
    return { ok: false, response: buildServerErrorResponse('管理员身份校验失败') };
  }

  const user = authData?.user ?? null;
  if (!user) {
    return { ok: false, response: buildServerErrorResponse('未登录', 401) };
  }

  let isAdmin = String((user as { role?: unknown }).role ?? '').trim() === 'admin';
  if (!isAdmin) {
    const { data: profile, error: profileError } = await dbClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      if (isRetryableSqlError(profileError)) {
        return { ok: false, response: buildTransientResponse() };
      }
      return { ok: false, response: buildServerErrorResponse('管理员权限校验失败') };
    }

    isAdmin = String((profile as { role?: unknown } | null)?.role ?? '').trim() === 'admin';
  }

  if (!isAdmin) {
    return { ok: false, response: buildServerErrorResponse('无权访问', 403) };
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
    if (directMatch?.[1]) {
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

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  void request;

  try {
    const { id } = await params;
    const blockedDateId = Number(id);
    if (!Number.isInteger(blockedDateId) || blockedDateId <= 0) {
      return buildServerErrorResponse('无效的锁定档期 ID', 400);
    }

    const sessionClient = await createClient();
    const adminCheck = await ensureAdminSession(sessionClient);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const adminDbClient = createAdminClient();
    const { data: snapshotRow, error: snapshotError } = await adminDbClient
      .from('booking_blackouts')
      .select('id, date')
      .eq('id', blockedDateId)
      .maybeSingle();

    if (snapshotError) {
      if (isRetryableSqlError(snapshotError)) {
        return buildTransientResponse();
      }
      console.error('Error fetching blocked date snapshot:', snapshotError);
      return buildServerErrorResponse('读取锁定档期失败');
    }

    if (!snapshotRow) {
      return buildServerErrorResponse('锁定档期不存在', 404);
    }

    const targetDate = normalizeDateLiteral((snapshotRow as { date?: unknown }).date);

    const { error: deleteByIdError } = await adminDbClient
      .from('booking_blackouts')
      .delete()
      .eq('id', blockedDateId);

    if (deleteByIdError) {
      if (isRetryableSqlError(deleteByIdError)) {
        return buildTransientResponse();
      }
      console.error('Error deleting blocked date by id:', deleteByIdError);
      return buildServerErrorResponse(`删除锁定档期失败：${String(deleteByIdError.message || deleteByIdError.code || '未知错误')}`);
    }

    const { data: remainingById, error: verifyByIdError } = await adminDbClient
      .from('booking_blackouts')
      .select('id')
      .eq('id', blockedDateId)
      .maybeSingle();

    if (verifyByIdError) {
      if (isRetryableSqlError(verifyByIdError)) {
        return buildTransientResponse();
      }
      console.error('Error verifying blocked date delete by id:', verifyByIdError);
      return buildServerErrorResponse('校验锁定档期删除结果失败');
    }

    if (remainingById) {
      return buildServerErrorResponse('锁定档期删除未生效');
    }

    if (targetDate) {
      const { error: deleteByDateError } = await adminDbClient
        .from('booking_blackouts')
        .delete()
        .eq('date', targetDate);

      if (deleteByDateError) {
        if (isRetryableSqlError(deleteByDateError)) {
          return buildTransientResponse();
        }
        console.error('Error deleting duplicated blocked dates by date:', deleteByDateError);
        return buildServerErrorResponse(`清理重复锁定档期失败：${String(deleteByDateError.message || deleteByDateError.code || '未知错误')}`);
      }

      const { data: remainingByDate, error: verifyByDateError } = await adminDbClient
        .from('booking_blackouts')
        .select('id')
        .eq('date', targetDate)
        .maybeSingle();

      if (verifyByDateError) {
        if (isRetryableSqlError(verifyByDateError)) {
          return buildTransientResponse();
        }
        console.error('Error verifying blocked date delete by date:', verifyByDateError);
        return buildServerErrorResponse('校验重复锁定档期清理结果失败');
      }

      if (remainingByDate) {
        return buildServerErrorResponse('仍有同日期锁定档期残留');
      }
    }

    return NextResponse.json({ success: true, date: targetDate || null });
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return buildTransientResponse();
    }

    console.error('Unexpected error:', error);
    return buildServerErrorResponse('删除锁定档期失败');
  }
}
