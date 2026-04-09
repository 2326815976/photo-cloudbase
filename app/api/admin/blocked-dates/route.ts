import { NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/cloudbase/server';
import {
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';
import { getTodayUTC8 } from '@/lib/utils/date-helpers';

export const dynamic = 'force-dynamic';

type SessionClient = Awaited<ReturnType<typeof createClient>>;
type AdminCheckResult =
  | { ok: true; userId: string }
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
    return { ok: false, response: buildServerErrorResponse('????????') };
  }

  const user = authData?.user ?? null;
  if (!user) {
    return { ok: false, response: buildServerErrorResponse('???', 401) };
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
      return { ok: false, response: buildServerErrorResponse('?????????') };
    }

    isAdmin = String((profile as { role?: unknown } | null)?.role ?? '').trim() === 'admin';
  }

  if (!isAdmin) {
    return { ok: false, response: buildServerErrorResponse('???????', 403) };
  }

  return { ok: true, userId: String(user.id || '') };
}

async function cleanupExpiredBlockedDates(dbClient: ReturnType<typeof createAdminClient>, today: string) {
  const { error } = await dbClient.from('booking_blackouts').delete().lt('date', today);
  if (!error) {
    return;
  }

  if (isRetryableSqlError(error)) {
    throw error;
  }

  console.error('Error cleaning expired blocked dates:', error);
}

export async function GET() {
  try {
    const sessionClient = await createClient();
    const adminCheck = await ensureAdminSession(sessionClient);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const adminDbClient = createAdminClient();
    const today = getTodayUTC8();
    await cleanupExpiredBlockedDates(adminDbClient, today);

    const { data, error } = await adminDbClient
      .from('booking_blackouts')
      .select('id, date, reason, created_at')
      .gte('date', today)
      .order('date', { ascending: false });

    if (error) {
      if (isRetryableSqlError(error)) {
        return buildTransientResponse();
      }
      console.error('Error fetching blocked dates:', error);
      return buildServerErrorResponse('????');
    }

    return NextResponse.json({ data });
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return buildTransientResponse();
    }

    console.error('Unexpected error:', error);
    return buildServerErrorResponse('?????');
  }
}

export async function POST(request: Request) {
  try {
    const sessionClient = await createClient();
    const adminCheck = await ensureAdminSession(sessionClient);
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const adminDbClient = createAdminClient();
    const body = await request.json();
    const date = String(body?.date ?? '').trim();
    const reason = String(body?.reason ?? '').trim();

    if (!date) {
      return buildServerErrorResponse('??????', 400);
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return buildServerErrorResponse('????????? YYYY-MM-DD', 400);
    }

    const dateObj = new Date(`${date}T00:00:00Z`);
    if (Number.isNaN(dateObj.getTime())) {
      return buildServerErrorResponse('?????', 400);
    }

    const today = getTodayUTC8();
    await cleanupExpiredBlockedDates(adminDbClient, today);
    if (date < today) {
      return buildServerErrorResponse('?????????', 400);
    }

    const { data: existingRow, error: existingError } = await adminDbClient
      .from('booking_blackouts')
      .select('id, date')
      .eq('date', date)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      if (isRetryableSqlError(existingError)) {
        return buildTransientResponse();
      }
      console.error('Error checking existing blocked date:', existingError);
      return buildServerErrorResponse('??????????????');
    }

    if (existingRow) {
      return buildServerErrorResponse('???????', 409);
    }

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
      ) {
        return buildServerErrorResponse('???????', 409);
      }

      if (isRetryableSqlError(error)) {
        return buildTransientResponse();
      }

      console.error('Error inserting blocked date:', error);
      return buildServerErrorResponse(`?????${String(errorMessage || errorCode || '????')}`);
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
        if (isRetryableSqlError(fallbackError)) {
          return buildTransientResponse();
        }
        console.error('Error reading inserted blocked date:', fallbackError);
        return buildServerErrorResponse('?????????????????');
      }

      return NextResponse.json({ success: true, data: fallback ?? null });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (isRetryableSqlError(error)) {
      return buildTransientResponse();
    }

    console.error('Unexpected error:', error);
    return buildServerErrorResponse('?????');
  }
}
