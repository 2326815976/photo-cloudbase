import { createClient } from '@/lib/cloudbase/server';
import type { AppChannel, BetaCodeChannel } from '@/lib/page-center/config';
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

export type PageManagementScope =
  | {
      ok: true;
      channel: AppChannel;
    }
  | {
      ok: false;
      response: NextResponse;
    };

function normalizePageManagementClientType(input: string): 'web' | 'miniprogram' | '' {
  const value = String(input || '').trim().toLowerCase();
  if (value === 'web' || value === 'miniprogram') {
    return value;
  }
  return '';
}

function readPageManagementClientType(request: Request): 'web' | 'miniprogram' | '' {
  return normalizePageManagementClientType(request.headers.get('x-page-management-client') || '');
}

export function readPageManagementClientChannel(request: Request): AppChannel | null {
  const clientType = readPageManagementClientType(request);
  return clientType ? clientType : null;
}

export function ensurePageManagementScope(
  request: Request,
  expectedChannel: AppChannel
): PageManagementScope {
  const clientType = readPageManagementClientType(request);
  if (!clientType) {
    return {
      ok: false,
      response: NextResponse.json({ error: '缺少页面管理端标识' }, { status: 400 }),
    };
  }

  if (clientType !== expectedChannel) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            expectedChannel === 'web'
              ? '当前接口仅允许 Web 页面管理访问'
              : '当前接口仅允许小程序页面管理访问',
        },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    channel: expectedChannel,
  };
}

export function normalizeScopedBetaChannel(
  channel: BetaCodeChannel,
  scopeChannel: AppChannel
): AppChannel {
  return channel === 'miniprogram' ? 'miniprogram' : scopeChannel;
}
