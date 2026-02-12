import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth/context';
import { executeQuery } from '@/lib/cloudbase/query-engine';
import { DbQueryPayload } from '@/lib/cloudbase/query-types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DbQueryPayload;
    const authContext = await getAuthContextFromRequest(request);
    const result = await executeQuery(payload, authContext);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : '数据库查询失败',
        },
        count: null,
      },
      { status: 500 }
    );
  }
}

