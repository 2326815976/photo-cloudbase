import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { updateUserPassword } from '@/lib/auth/service';
import { findAdminManagedUser } from '../../_server';

export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const { id } = await params;
    const userId = String(id ?? '').trim();
    if (!userId) {
      return NextResponse.json({ error: '用户 ID 非法' }, { status: 400 });
    }

    const body = (await request.json().catch(() => null)) as { newPassword?: unknown } | null;
    const newPassword = String(body?.newPassword ?? '');
    if (newPassword.length < 6) {
      return NextResponse.json({ error: '密码长度至少为 6 位' }, { status: 400 });
    }

    const targetUser = await findAdminManagedUser(userId);
    if (!targetUser) {
      return NextResponse.json({ error: '目标用户不存在' }, { status: 404 });
    }
    if (targetUser.role === 'admin') {
      return NextResponse.json({ error: '管理员账号暂不支持后台重置密码' }, { status: 409 });
    }

    const result = await updateUserPassword(userId, newPassword);
    if (result.error) {
      const status = result.error === 'user_not_found' ? 404 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '重置用户密码失败';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
