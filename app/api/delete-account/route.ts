import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { revokeSessionsByUserId } from '@/lib/auth/session-store';

export async function POST() {
  try {
    const dbClient = await createClient();
    const { data: authUser, error: authError } = await dbClient.auth.getUser();

    if (authError || !authUser?.user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const userId = authUser.user.id;

    await revokeSessionsByUserId(userId);

    await executeSQL(
      `
        DELETE FROM bookings
        WHERE user_id = {{user_id}}
      `,
      { user_id: userId }
    );

    await executeSQL(
      `
        DELETE FROM users
        WHERE id = {{user_id}}
      `,
      { user_id: userId }
    );

    await executeSQL(
      `
        DELETE FROM profiles
        WHERE id = {{user_id}}
      `,
      { user_id: userId }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete account error:', error);
    return NextResponse.json({ error: '系统错误' }, { status: 500 });
  }
}


