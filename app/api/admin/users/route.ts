import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { listAdminUsers } from './_server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const users = await listAdminUsers();
    return NextResponse.json({
      data: {
        users,
        currentUserId: adminCheck.userId,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取用户列表失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
