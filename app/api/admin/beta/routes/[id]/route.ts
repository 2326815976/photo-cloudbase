import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/cloudbase/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';

export const dynamic = 'force-dynamic';

function isReferencedRouteError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
  return message.includes('foreign key') || message.includes('cannot delete or update a parent row');
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const { id } = await params;
    const routeId = Number(id);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return NextResponse.json({ error: '内测路由 ID 不合法' }, { status: 400 });
    }

    const adminDbClient = createAdminClient();
    const { data: targetRow, error: targetError } = await adminDbClient
      .from('feature_beta_routes')
      .select('id')
      .eq('id', routeId)
      .maybeSingle();

    if (targetError) {
      console.error('读取内测路由失败:', targetError);
      return NextResponse.json({ error: '删除内测路由失败' }, { status: 500 });
    }

    if (!targetRow) {
      return NextResponse.json({ error: '目标内测路由不存在' }, { status: 404 });
    }

    const { data: deletedRow, error: deleteError } = await adminDbClient
      .from('feature_beta_routes')
      .delete()
      .eq('id', routeId)
      .select('id')
      .maybeSingle();

    if (deleteError) {
      if (isReferencedRouteError(deleteError)) {
        return NextResponse.json({ error: '该路由已被内测版本使用，暂不可删除' }, { status: 409 });
      }
      console.error('删除内测路由失败:', deleteError);
      return NextResponse.json({ error: '删除内测路由失败' }, { status: 500 });
    }

    if (!deletedRow) {
      return NextResponse.json({ error: '目标内测路由不存在或删除失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除内测路由时发生异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
