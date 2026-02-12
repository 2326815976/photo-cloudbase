import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';

export async function DELETE(request: NextRequest) {
  try {
    const dbClient = await createClient();
    const { data: { user } } = await dbClient.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: '未授权：请先登录' },
        { status: 401 }
      );
    }

    const { data: profile } = await dbClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json(
        { error: '未授权：需要管理员权限' },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => ({} as any));
    const key = String(body?.key ?? '').trim();
    const url = String(body?.url ?? '').trim();
    const fileId = String(body?.fileId ?? '').trim();

    const targets = [key, url, fileId].filter(Boolean);
    if (targets.length === 0) {
      return NextResponse.json(
        { error: '缺少文件标识参数' },
        { status: 400 }
      );
    }

    await deleteCloudBaseObjects(targets);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除失败' },
      { status: 500 }
    );
  }
}


