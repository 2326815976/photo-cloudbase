import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { createAdminClient } from '@/lib/cloudbase/server';
import { deletePageBetaCode, loadPageBetaCodeById } from '@/lib/page-center/admin';
import { resolvePageCenterAdminError } from '@/lib/page-center/errors';
import {
  extractLegacyOverviewBetaVersionId,
  loadLegacyOverviewBetaCodeById,
} from '@/lib/page-center/legacy-beta-admin';

export const dynamic = 'force-dynamic';

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const params = await context.params;
    const codeId = String(params.id || '').trim();
    if (!codeId) {
      return NextResponse.json({ error: '缺少内测码标识' }, { status: 400 });
    }

    const legacyVersionId = extractLegacyOverviewBetaVersionId(codeId);
    if (legacyVersionId) {
      const existingLegacyCode = await loadLegacyOverviewBetaCodeById(codeId);
      if (!existingLegacyCode) {
        return NextResponse.json({ error: '目标内测码不存在' }, { status: 404 });
      }

      const adminDbClient = createAdminClient();
      const { data: deletedRow, error: deleteError } = await adminDbClient
        .from('feature_beta_versions')
        .delete()
        .eq('id', legacyVersionId)
        .select('id')
        .maybeSingle();

      if (deleteError) {
        console.error('删除旧体系内测码失败:', deleteError);
        return NextResponse.json({ error: '删除旧体系内测码失败' }, { status: 500 });
      }

      if (!deletedRow) {
        return NextResponse.json({ error: '目标内测码不存在或删除失败' }, { status: 404 });
      }

      return NextResponse.json({
        success: true,
        message: `已删除${existingLegacyCode.betaName}，它不会再出现在内测码列表中。`,
      });
    }

    const existingCode = await loadPageBetaCodeById(codeId);
    if (!existingCode) {
      return NextResponse.json({ error: '目标内测码不存在' }, { status: 404 });
    }

    await deletePageBetaCode(codeId);
    return NextResponse.json({
      success: true,
      message: `已删除${existingCode.betaName}，它不会再出现在内测码列表中。`,
    });
  } catch (error) {
    console.error('删除页面内测码失败:', error);
    const resolved = resolvePageCenterAdminError(error, {
      fallbackMessage: '删除页面内测码失败',
    });
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
