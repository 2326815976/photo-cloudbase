import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { canUsePageCenterBeta, unbindUserPageBetaFeature } from '@/lib/page-center/user-beta';

export const dynamic = 'force-dynamic';

function normalizeChannel(input: string | null) {
  return input === 'miniprogram' ? 'miniprogram' : 'web';
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ featureId: string }> }
) {
  try {
    const params = await context.params;
    const featureId = String(params.featureId || '').trim();
    const channel = normalizeChannel(new URL(request.url).searchParams.get('channel'));

    if (!featureId) {
      return NextResponse.json({ error: '缺少功能标识' }, { status: 400 });
    }

    const dbClient = await createClient();
    const {
      data: { user },
    } = await dbClient.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const pageCenterEnabled = await canUsePageCenterBeta();
    if (!pageCenterEnabled) {
      return NextResponse.json(
        {
          error: '页面内测新体系尚未就绪，请先完成页面中心内测配置',
          source: 'page_center_only',
        },
        { status: 503 }
      );
    }

    const removed = await unbindUserPageBetaFeature(String(user.id), featureId, channel);
    return NextResponse.json({
      success: true,
      removed,
      source: 'page_center',
    });
  } catch (error) {
    console.error('解绑页面内测功能失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '解绑页面内测功能失败' },
      { status: 500 }
    );
  }
}
