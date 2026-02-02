import { NextRequest, NextResponse } from 'next/server';
import { batchDeleteFromCOS } from '@/lib/storage/cos-client';
import { createClient } from '@/lib/supabase/server';

const MAX_BATCH_DELETE = 100; // 最多一次删除100个文件

export async function DELETE(request: NextRequest) {
  try {
    // 权限验证
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: '未授权：请先登录' },
        { status: 401 }
      );
    }

    // 检查管理员权限
    const { data: profile } = await supabase
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

    const { keys } = await request.json();

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: '缺少文件路径数组参数' },
        { status: 400 }
      );
    }

    // 批量删除数量限制
    if (keys.length > MAX_BATCH_DELETE) {
      return NextResponse.json(
        { error: `批量删除数量超过限制（最多${MAX_BATCH_DELETE}个）` },
        { status: 400 }
      );
    }

    await batchDeleteFromCOS(keys);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('批量删除失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量删除失败' },
      { status: 500 }
    );
  }
}
