import { NextRequest, NextResponse } from 'next/server';
import { deleteFromCOS } from '@/lib/storage/cos-client';

export async function DELETE(request: NextRequest) {
  try {
    const { key } = await request.json();

    if (!key) {
      return NextResponse.json(
        { error: '缺少文件路径参数' },
        { status: 400 }
      );
    }

    await deleteFromCOS(key);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除失败:', error);
    return NextResponse.json(
      { error: '删除失败' },
      { status: 500 }
    );
  }
}
