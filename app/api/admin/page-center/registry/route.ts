import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { upsertPageRegistryItem } from '@/lib/page-center/admin';
import { resolvePageCenterAdminError } from '@/lib/page-center/errors';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as {
      pageKey: unknown;
      pageName: unknown;
      routePathWeb: unknown;
      routePathMiniProgram: unknown;
      [key: string]: unknown;
    };
    const pageKey = await upsertPageRegistryItem(body);
    return NextResponse.json({ success: true, pageKey });
  } catch (error) {
    console.error('保存页面注册表失败:', error);
    const resolved = resolvePageCenterAdminError(error, {
      fallbackMessage: '保存页面注册表失败',
    });
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
