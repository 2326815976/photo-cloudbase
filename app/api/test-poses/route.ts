import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET() {
  try {
    const supabase = await createClient();

    // 查询摆姿数据
    const { data: poses, error: posesError, count } = await supabase
      .from('poses')
      .select('*', { count: 'exact' })
      .limit(5);

    // 查询标签数据
    const { data: tags, error: tagsError } = await supabase
      .from('pose_tags')
      .select('*')
      .limit(5);

    return NextResponse.json({
      success: true,
      posesCount: count,
      poses: poses || [],
      posesError: posesError?.message,
      tags: tags || [],
      tagsError: tagsError?.message,
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
