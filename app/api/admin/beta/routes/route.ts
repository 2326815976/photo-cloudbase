import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/cloudbase/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import {
  normalizeBetaDescription,
  normalizeBetaRoutePath,
  normalizeDbBoolean,
} from '@/lib/utils/admin-beta';

export const dynamic = 'force-dynamic';

const ROUTE_COLUMNS = 'id, route_path, route_title, route_description, is_active, created_at, updated_at';
const MAX_LIMIT = 500;

function readErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  if (typeof error === 'object' && error !== null) {
    const message = String((error as { message?: unknown }).message ?? '').trim();
    if (message) {
      return message;
    }
  }

  return '未知错误';
}

function isDuplicateDbError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const code = String((error as { code?: unknown }).code ?? '').trim();
  const message = String((error as { message?: unknown }).message ?? '').toLowerCase();
  return code === '23505' || code === '1062' || message.includes('duplicate entry');
}

function parseLimit(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get('limit') ?? 200);
  if (!Number.isFinite(raw)) {
    return 200;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(raw)));
}

export async function GET(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const adminDbClient = createAdminClient();
    const limit = parseLimit(request);
    const { data, error } = await adminDbClient
      .from('feature_beta_routes')
      .select(ROUTE_COLUMNS)
      .order('is_active', { ascending: false })
      .order('id', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('获取内测路由失败:', error);
      return NextResponse.json({ error: '获取内测路由失败' }, { status: 500 });
    }

    return NextResponse.json({ data: Array.isArray(data) ? data : [] });
  } catch (error) {
    console.error('读取内测路由时发生异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as Record<string, unknown>;
    const routeId = Number(body.id ?? 0);
    const routePath = normalizeBetaRoutePath(body.route_path);
    const routeTitle = String(body.route_title ?? '').trim().slice(0, 128);
    const routeDescription = normalizeBetaDescription(body.route_description, 255);
    const isActive = normalizeDbBoolean(body.is_active, true);

    if (body.id !== undefined && (!Number.isInteger(routeId) || routeId <= 0)) {
      return NextResponse.json({ error: '内测路由 ID 不合法' }, { status: 400 });
    }

    if (!routePath) {
      return NextResponse.json({ error: '功能路由不能为空' }, { status: 400 });
    }

    if (!routeTitle) {
      return NextResponse.json({ error: '功能名称不能为空' }, { status: 400 });
    }

    const adminDbClient = createAdminClient();
    const { data: duplicateRoute, error: duplicateError } = await adminDbClient
      .from('feature_beta_routes')
      .select('id')
      .eq('route_path', routePath)
      .maybeSingle();

    if (duplicateError) {
      console.error('校验内测路由重复失败:', duplicateError);
      return NextResponse.json({ error: '校验内测路由失败' }, { status: 500 });
    }

    const duplicateRouteId = Number((duplicateRoute as { id?: unknown } | null)?.id ?? 0);
    if (duplicateRouteId > 0 && duplicateRouteId !== routeId) {
      return NextResponse.json({ error: '该功能路由已存在' }, { status: 409 });
    }

    const values = {
      route_path: routePath,
      route_title: routeTitle,
      route_description: routeDescription,
      is_active: isActive,
    };

    if (routeId > 0) {
      const { data, error } = await adminDbClient
        .from('feature_beta_routes')
        .update(values)
        .eq('id', routeId)
        .select(ROUTE_COLUMNS)
        .maybeSingle();

      if (error) {
        if (isDuplicateDbError(error)) {
          return NextResponse.json({ error: '该功能路由已存在' }, { status: 409 });
        }
        console.error('更新内测路由失败:', error);
        return NextResponse.json({ error: '更新内测路由失败' }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: '目标内测路由不存在' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data });
    }

    const { data, error } = await adminDbClient
      .from('feature_beta_routes')
      .insert(values)
      .select(ROUTE_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isDuplicateDbError(error)) {
        return NextResponse.json({ error: '该功能路由已存在' }, { status: 409 });
      }
      console.error('新增内测路由失败:', error);
      return NextResponse.json({ error: '新增内测路由失败' }, { status: 500 });
    }

    if (!data) {
      const { data: fallback, error: fallbackError } = await adminDbClient
        .from('feature_beta_routes')
        .select(ROUTE_COLUMNS)
        .eq('route_path', routePath)
        .maybeSingle();

      if (fallbackError) {
        console.error('回读内测路由失败:', fallbackError);
        return NextResponse.json({ error: '新增内测路由成功，但读取结果失败' }, { status: 500 });
      }

      return NextResponse.json({ success: true, data: fallback ?? null });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = readErrorMessage(error);
    console.error('保存内测路由时发生异常:', error);
    return NextResponse.json({ error: message || '服务器错误' }, { status: 500 });
  }
}
