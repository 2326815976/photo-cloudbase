import { NextRequest, NextResponse } from 'next/server';
import { batchDeleteFromCOS } from '@/lib/storage/cos-client';

export async function DELETE(request: NextRequest) {
  try {
    const { keys } = await request.json();

    if (!keys || !Array.isArray(keys) || keys.length === 0) {
      return NextResponse.json(
        { error: '缺少文件路径数组参数' },
        { status: 400 }
      );
    }

    await batchDeleteFromCOS(keys);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('批量删除失败:', error);
    return NextResponse.json(
      { error: '批量删除失败' },
      { status: 500 }
    );
  }
}
