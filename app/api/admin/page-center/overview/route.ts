import { NextResponse } from 'next/server';
import {
  ensureAdminSession,
  ensurePageManagementScope,
  readPageManagementClientChannel,
} from '@/app/api/admin/_utils/ensure-admin-session';
import { buildPageCenterOverview } from '@/lib/page-center/runtime';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const clientChannel = readPageManagementClientChannel(request);
    if (!clientChannel) {
      return NextResponse.json({ error: '缺少页面管理端标识' }, { status: 400 });
    }
    const scopeCheck = ensurePageManagementScope(request, clientChannel);
    if (!scopeCheck.ok) {
      return scopeCheck.response;
    }

    const data = await buildPageCenterOverview();
    return NextResponse.json({ data });
  } catch (error) {
    console.error('读取页面管理概览失败:', error);
    return NextResponse.json({ error: '读取页面管理概览失败' }, { status: 500 });
  }
}
