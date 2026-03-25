import { createClient } from '@/lib/cloudbase/server';
import { NextResponse } from 'next/server';

export type AdminSessionResult =
  | {
      ok: true;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function ensureAdminSession(): Promise<AdminSessionResult> {
  const dbClient = await createClient();
  const { data: authData, error: authError } = await dbClient.auth.getUser();
  const user = authData?.user ?? null;

  if (authError && !user) {
    console.error('读取管理员登录状态失败:', authError);
    return {
      ok: false,
      response: NextResponse.json({ error: '未授权' }, { status: 401 }),
    };
  }

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
      console.error('读取管理员资料失败:', profileError);
      return {
        ok: false,
        response: NextResponse.json({ error: '读取管理员资料失败' }, { status: 500 }),
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

  return {
    ok: true,
    userId: String(user.id ?? '').trim(),
  };
}
