import { createClient } from '@/lib/cloudbase/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic'; // 不缓存

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
    const dbClient = await createClient();

    // 验证管理员权限
    const { data: { user } } = await dbClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { data: profile } = await dbClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    // 快照：避免并发/重复删除造成假成功
    const { data: snapshotRow, error: snapshotError } = await dbClient
      .from('booking_blackouts')
      .select('id')
      .eq('id', blockedDateId)
      .maybeSingle();

    if (snapshotError) {
      console.error('Error fetching blocked date snapshot:', snapshotError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    if (!snapshotRow) {
      return NextResponse.json({ error: '锁定日期不存在或已删除' }, { status: 404 });
    }

    // 删除锁定日期
    const { error: deleteError } = await dbClient
      .from('booking_blackouts')
      .delete()
      .eq('id', blockedDateId);

    if (deleteError) {
      console.error('Error deleting blocked date:', deleteError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    const { data: remainingRow, error: verifyError } = await dbClient
      .from('booking_blackouts')
      .select('id')
      .eq('id', blockedDateId)
      .maybeSingle();

    if (verifyError) {
      console.error('Error verifying blocked date delete:', verifyError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    if (remainingRow) {
      return NextResponse.json({ error: '删除失败，请稍后重试' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}


