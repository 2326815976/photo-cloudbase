import { NextResponse } from 'next/server';
import { getAuthContextFromRequest } from '@/lib/auth/context';
import { executeRpc } from '@/lib/cloudbase/rpc-engine';
import { DbRpcPayload } from '@/lib/cloudbase/query-types';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as DbRpcPayload;
    const authContext = await getAuthContextFromRequest(request);
    const result = await executeRpc(payload.functionName, payload.args ?? {}, authContext);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        data: null,
        error: {
          message: error instanceof Error ? error.message : 'RPC 调用失败',
        },
      },
      { status: 500 }
    );
  }
}

