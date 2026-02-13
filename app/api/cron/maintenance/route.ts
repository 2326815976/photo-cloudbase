import { NextRequest, NextResponse } from 'next/server';
import { executeRpc } from '@/lib/cloudbase/rpc-engine';
import { AuthContext } from '@/lib/auth/types';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET 未配置');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
      console.error('[Cron] 认证失败');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const systemContext: AuthContext = {
      role: 'system',
      user: {
        id: 'system',
        email: 'system@slogan.app',
        phone: null,
        role: 'admin',
        name: 'system',
      },
    };

    const result = await executeRpc('run_maintenance_tasks', {}, systemContext);

    if (result.error) {
      console.error('[Cron] 维护任务执行失败:', result.error);
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    console.log('[Cron] 维护任务执行成功:', result.data);
    return NextResponse.json({ success: true, data: result.data });
  } catch (error) {
    console.error('[Cron] 维护任务异常:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
