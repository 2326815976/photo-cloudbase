import { NextResponse } from 'next/server';
import {
  executeSQL,
  isRetryableSqlError,
  TRANSIENT_BACKEND_ERROR_CODE,
  TRANSIENT_BACKEND_ERROR_MESSAGE,
} from '@/lib/cloudbase/sql-executor';

export const dynamic = 'force-dynamic';

const READY_SUCCESS_CACHE_MS = 1_000;
const READY_FAILURE_CACHE_MS = 1_000;

type ReadyPayload = {
  ok: boolean;
  error: { message: string; code?: string } | null;
  checked_at: string;
};

type ReadyResult = {
  payload: ReadyPayload;
  status: number;
};

type ReadyProbeState = {
  pending: Promise<ReadyResult> | null;
  cached: ReadyResult | null;
  cachedUntil: number;
};

declare global {
  var __photoReadyProbeState__: ReadyProbeState | undefined;
}

function getReadyProbeState(): ReadyProbeState {
  if (!globalThis.__photoReadyProbeState__) {
    globalThis.__photoReadyProbeState__ = {
      pending: null,
      cached: null,
      cachedUntil: 0,
    };
  }

  return globalThis.__photoReadyProbeState__;
}

function buildReadyResult(ok: boolean, status: number, error: ReadyPayload['error']): ReadyResult {
  return {
    payload: {
      ok,
      error,
      checked_at: new Date().toISOString(),
    },
    status,
  };
}

async function runReadyProbe(): Promise<ReadyResult> {
  try {
    await executeSQL('SELECT 1 AS ok');
    return buildReadyResult(true, 200, null);
  } catch (error) {
    const isTransient = isRetryableSqlError(error);
    return buildReadyResult(
      false,
      isTransient ? 503 : 500,
      {
        message: isTransient
          ? TRANSIENT_BACKEND_ERROR_MESSAGE
          : error instanceof Error
            ? error.message
            : '????????',
        code: isTransient ? TRANSIENT_BACKEND_ERROR_CODE : undefined,
      }
    );
  }
}

async function resolveReadyProbe(): Promise<ReadyResult> {
  const state = getReadyProbeState();
  const now = Date.now();

  if (state.cached && state.cachedUntil > now) {
    return state.cached;
  }

  if (state.pending) {
    return state.pending;
  }

  state.pending = runReadyProbe()
    .then((result) => {
      state.cached = result;
      state.cachedUntil = Date.now() + (result.status === 200 ? READY_SUCCESS_CACHE_MS : READY_FAILURE_CACHE_MS);
      return result;
    })
    .finally(() => {
      state.pending = null;
    });

  return state.pending;
}

export async function GET() {
  const result = await resolveReadyProbe();
  return NextResponse.json(result.payload, { status: result.status });
}
