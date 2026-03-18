import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.MAINTENANCE_TOKEN;
    const dbClient = await createClient();

    const tokenValid = expectedToken && authHeader === `Bearer ${expectedToken}`;

    if (!tokenValid) {
      const {
        data: { user },
      } = await dbClient.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: '未授权访问' }, { status: 401 });
      }

      const { data: profile } = await dbClient.from('profiles').select('role').eq('id', user.id).single();

      if (profile?.role !== 'admin') {
        return NextResponse.json({ error: '未授权访问' }, { status: 401 });
      }
    }

    const { data, error } = await dbClient.rpc('run_maintenance_tasks');

    if (error) {
      console.error('维护任务执行失败:', error);
      return NextResponse.json(
        { error: '维护任务执行失败', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '维护任务执行完成',
      result: data,
    });
  } catch (error) {
    console.error('维护任务执行失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '维护任务执行异常' },
      { status: 500 }
    );
  }
}
