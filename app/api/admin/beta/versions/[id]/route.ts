import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/cloudbase/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';

export const dynamic = 'force-dynamic';

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
    const versionId = String(id ?? '').trim();
    if (!versionId) {
      return NextResponse.json({ error: '内测版本 ID 不合法' }, { status: 400 });
    }

    const adminDbClient = createAdminClient();
    const { data: targetRow, error: targetError } = await adminDbClient
      .from('feature_beta_versions')
      .select('id')
      .eq('id', versionId)
      .maybeSingle();

    if (targetError) {
      console.error('读取内测版本失败:', targetError);
      return NextResponse.json({ error: '删除内测版本失败' }, { status: 500 });
    }

    if (!targetRow) {
      return NextResponse.json({ error: '目标内测版本不存在' }, { status: 404 });
    }

    const { data: deletedRow, error: deleteError } = await adminDbClient
      .from('feature_beta_versions')
      .delete()
      .eq('id', versionId)
      .select('id')
      .maybeSingle();

    if (deleteError) {
      console.error('删除内测版本失败:', deleteError);
      return NextResponse.json({ error: '删除内测版本失败' }, { status: 500 });
    }

    if (!deletedRow) {
      return NextResponse.json({ error: '目标内测版本不存在或删除失败' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除内测版本时发生异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
