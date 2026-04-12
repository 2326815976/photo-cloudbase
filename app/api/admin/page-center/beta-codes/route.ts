import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { resolvePageCenterAdminError } from '@/lib/page-center/errors';
import {
  loadPageBetaCodes,
  loadPageBetaCodeById,
  loadRegistryItemByPageKey,
  normalizeBetaChannel,
  savePageBetaCode,
} from '@/lib/page-center/admin';
import { normalizeText } from '@/lib/page-center/config';

export const dynamic = 'force-dynamic';

function getBetaChannelLabel(channel: 'web' | 'miniprogram' | 'shared') {
  if (channel === 'shared') return '双端通用';
  return channel === 'web' ? '仅 Web' : '仅小程序';
}

export async function POST(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as Record<string, unknown>;
    const pageKey = normalizeText(body.pageKey);
    const codeId = normalizeText(body.codeId);
    const betaName = normalizeText(body.betaName);
    const betaCode = normalizeText(body.betaCode);
    const expiresAt = normalizeText(body.expiresAt);
    const channel = normalizeBetaChannel(body.channel, 'shared');

    if (!pageKey) {
      return NextResponse.json({ error: '缺少页面标识' }, { status: 400 });
    }

    const registryItem = await loadRegistryItemByPageKey(pageKey);
    if (!registryItem || registryItem.id <= 0) {
      return NextResponse.json({ error: '目标页面不存在' }, { status: 404 });
    }

    if (!registryItem.supportsBeta) {
      return NextResponse.json({ error: '该页面当前未开启内测能力' }, { status: 400 });
    }

    if (codeId) {
      const existingCode = await loadPageBetaCodeById(codeId);
      if (!existingCode) {
        return NextResponse.json({ error: '目标内测码不存在' }, { status: 404 });
      }
      if (existingCode.pageKey !== registryItem.pageKey) {
        return NextResponse.json({ error: '该内测码不属于当前页面' }, { status: 400 });
      }
    }

    const result = await savePageBetaCode({
      codeId: codeId || undefined,
      pageId: registryItem.id,
      channel,
      betaName: betaName || `${registryItem.pageName}内测码`,
      betaCode: betaCode || undefined,
      expiresAt,
      createdBy: adminCheck.userId,
    });

    const rows = await loadPageBetaCodes(registryItem.id);
    const scopeLabel = getBetaChannelLabel(channel);
    const message =
      result.mode === 'created'
        ? `已创建${scopeLabel}内测码，当前端用户现在可以绑定进入该页面。`
        : result.mode === 'restored'
          ? `已恢复并更新${scopeLabel}内测码，新用户现在可以重新绑定进入该页面。`
          : `已更新${scopeLabel}内测码设置。`;
    return NextResponse.json({ success: true, data: rows, message });
  } catch (error) {
    console.error('保存页面内测码失败:', error);
    const resolved = resolvePageCenterAdminError(error, {
      fallbackMessage: '保存页面内测码失败',
      duplicateMessage: '该内测码已存在，请更换内测码后重试。',
    });
    return NextResponse.json({ error: resolved.message }, { status: resolved.status });
  }
}
