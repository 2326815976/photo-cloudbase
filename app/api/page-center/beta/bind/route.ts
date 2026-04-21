import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import {
  bindUserToLegacyPageBetaByCode,
  canUseLegacyPageCenterBeta,
} from '@/lib/page-center/legacy-beta-compat';
import { bindUserToPageBetaByCode, canUsePageCenterBeta } from '@/lib/page-center/user-beta';

export const dynamic = 'force-dynamic';

function normalizeChannel(input: unknown) {
  return String(input || '').trim() === 'miniprogram' ? 'miniprogram' : 'web';
}

function readBusinessErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.trim() : '';
}

function isPageCenterBusinessError(error: unknown) {
  const message = readBusinessErrorMessage(error);
  if (!message) return false;
  return [
    '请输入内测码',
    '内测码必须是',
    '该页面当前未开放内测入口',
    '该内测功能已下线',
    '该内测功能已过期',
    '该内测码已过期',
    '该内测码仅适用于',
  ].some((item) => message.includes(item));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const featureCode = String(body.featureCode || body.code || '').trim();
    const channel = normalizeChannel(body.channel);

    if (!featureCode) {
      return NextResponse.json({ error: '请输入内测码' }, { status: 400 });
    }

    const dbClient = await createClient();
    const {
      data: { user },
    } = await dbClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const [pageCenterEnabled, legacyAvailable] = await Promise.all([
      canUsePageCenterBeta(),
      canUseLegacyPageCenterBeta(),
    ]);
    const legacyEnabled = channel === 'web' && legacyAvailable;

    if (pageCenterEnabled) {
      try {
        const row = await bindUserToPageBetaByCode(String(user.id), featureCode, channel);
        if (row) {
          return NextResponse.json({ data: row, source: 'page_center' });
        }
      } catch (error) {
        if (isPageCenterBusinessError(error)) {
          return NextResponse.json(
            { error: readBusinessErrorMessage(error), source: 'page_center' },
            { status: 400 }
          );
        }
        if (!legacyEnabled) {
          throw error;
        }
        console.error('绑定页面内测码失败（新体系，Web 兼容旧体系）:', error);
      }
    }

    if (legacyEnabled) {
      try {
        const row = await bindUserToLegacyPageBetaByCode(String(user.id), featureCode, channel);
        if (row) {
          return NextResponse.json({ data: row, source: 'legacy_compatible' });
        }
      } catch (error) {
        return NextResponse.json(
          { error: readBusinessErrorMessage(error) || '绑定内测码失败', source: 'legacy_compatible' },
          { status: 400 }
        );
      }
    }

    if (!pageCenterEnabled && !legacyEnabled) {
      return NextResponse.json(
        { error: '页面内测新体系未就绪，请先完成页面中心内测配置', source: 'page_center_only' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      {
        error: '该内测码不存在或当前不可用',
        source: legacyEnabled && !pageCenterEnabled ? 'legacy_compatible' : 'page_center',
      },
      { status: 400 }
    );
  } catch (error) {
    console.error('绑定页面内测码失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '绑定页面内测码失败' },
      { status: 500 }
    );
  }
}
