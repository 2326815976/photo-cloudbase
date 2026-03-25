import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/cloudbase/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import {
  BETA_FEATURE_CODE_LENGTH,
  generateAdminBetaFeatureCode,
  normalizeBetaDescription,
  normalizeBetaExpiresAt,
  normalizeBetaFeatureCode,
  normalizeDbBoolean,
} from '@/lib/utils/admin-beta';

export const dynamic = 'force-dynamic';

const VERSION_COLUMNS =
  'id, feature_name, feature_description, feature_code, route_id, is_active, expires_at, created_by, created_at, updated_at';
const ROUTE_COLUMNS = 'id, route_title, route_path';
const MAX_LIMIT = 500;

interface RouteMeta {
  id: number;
  route_title: string;
  route_path: string;
}

function parseLimit(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get('limit') ?? 200);
  if (!Number.isFinite(raw)) {
    return 200;
  }
  return Math.max(1, Math.min(MAX_LIMIT, Math.floor(raw)));
}

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

function buildRouteMap(rows: unknown): Map<number, RouteMeta> {
  const routeMap = new Map<number, RouteMeta>();

  if (!Array.isArray(rows)) {
    return routeMap;
  }

  rows.forEach((item) => {
    const routeId = Number((item as { id?: unknown }).id ?? 0);
    if (!Number.isInteger(routeId) || routeId <= 0) {
      return;
    }

    routeMap.set(routeId, {
      id: routeId,
      route_title: String((item as { route_title?: unknown }).route_title ?? '').trim(),
      route_path: String((item as { route_path?: unknown }).route_path ?? '').trim(),
    });
  });

  return routeMap;
}

function attachRouteMeta<T extends Record<string, unknown>>(row: T, routeMap: Map<number, RouteMeta>) {
  const routeId = Number(row.route_id ?? 0);
  const routeMeta = routeMap.get(routeId);

  return {
    ...row,
    feature_code: normalizeBetaFeatureCode(row.feature_code),
    route_title: routeMeta?.route_title ?? '',
    route_path: routeMeta?.route_path ?? '',
  };
}

export async function GET(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const adminDbClient = createAdminClient();
    const limit = parseLimit(request);

    const [versionResult, routeResult] = await Promise.all([
      adminDbClient
        .from('feature_beta_versions')
        .select(VERSION_COLUMNS)
        .order('is_active', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(limit),
      adminDbClient.from('feature_beta_routes').select(ROUTE_COLUMNS),
    ]);

    if (versionResult.error) {
      console.error('获取内测版本失败:', versionResult.error);
      return NextResponse.json({ error: '获取内测版本失败' }, { status: 500 });
    }

    if (routeResult.error) {
      console.error('获取内测路由失败:', routeResult.error);
      return NextResponse.json({ error: '获取内测路由失败' }, { status: 500 });
    }

    const routeMap = buildRouteMap(routeResult.data);
    const rows = Array.isArray(versionResult.data) ? versionResult.data : [];
    return NextResponse.json({ data: rows.map((row) => attachRouteMeta(row, routeMap)) });
  } catch (error) {
    console.error('读取内测版本时发生异常:', error);
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
    const versionId = String(body.id ?? '').trim();
    const featureName = String(body.feature_name ?? '').trim().slice(0, 128);
    const featureDescription = normalizeBetaDescription(body.feature_description, 255);
    const routeId = Number(body.route_id ?? 0);
    const isActive = normalizeDbBoolean(body.is_active, true);
    const expiresAt = normalizeBetaExpiresAt(body.expires_at);
    const featureCode = normalizeBetaFeatureCode(body.feature_code) || generateAdminBetaFeatureCode();

    if (!featureName) {
      return NextResponse.json({ error: '内测功能名称不能为空' }, { status: 400 });
    }

    if (!Number.isInteger(routeId) || routeId <= 0) {
      return NextResponse.json({ error: '请选择有效的功能路由' }, { status: 400 });
    }

    if (!featureCode) {
      return NextResponse.json({ error: '内测码不能为空' }, { status: 400 });
    }

    if (featureCode.length !== BETA_FEATURE_CODE_LENGTH) {
      return NextResponse.json(
        { error: `内测码必须是 ${BETA_FEATURE_CODE_LENGTH} 位大写字母或数字` },
        { status: 400 }
      );
    }

    const adminDbClient = createAdminClient();
    const { data: routeRow, error: routeError } = await adminDbClient
      .from('feature_beta_routes')
      .select(ROUTE_COLUMNS)
      .eq('id', routeId)
      .maybeSingle();

    if (routeError) {
      console.error('读取内测路由失败:', routeError);
      return NextResponse.json({ error: '读取功能路由失败' }, { status: 500 });
    }

    if (!routeRow) {
      return NextResponse.json({ error: '所选功能路由不存在' }, { status: 400 });
    }

    const { data: duplicateVersion, error: duplicateError } = await adminDbClient
      .from('feature_beta_versions')
      .select('id')
      .eq('feature_code', featureCode)
      .maybeSingle();

    if (duplicateError) {
      console.error('校验内测码重复失败:', duplicateError);
      return NextResponse.json({ error: '校验内测码失败' }, { status: 500 });
    }

    const duplicateVersionId = String((duplicateVersion as { id?: unknown } | null)?.id ?? '').trim();
    if (duplicateVersionId && duplicateVersionId !== versionId) {
      return NextResponse.json({ error: '该内测码已存在，请更换后重试' }, { status: 409 });
    }

    const values = {
      feature_name: featureName,
      feature_description: featureDescription,
      feature_code: featureCode,
      route_id: routeId,
      is_active: isActive,
      expires_at: expiresAt,
    };

    if (versionId) {
      const { data, error } = await adminDbClient
        .from('feature_beta_versions')
        .update(values)
        .eq('id', versionId)
        .select(VERSION_COLUMNS)
        .maybeSingle();

      if (error) {
        if (isDuplicateDbError(error)) {
          return NextResponse.json({ error: '该内测码已存在，请更换后重试' }, { status: 409 });
        }
        console.error('更新内测版本失败:', error);
        return NextResponse.json({ error: '更新内测版本失败' }, { status: 500 });
      }

      if (!data) {
        return NextResponse.json({ error: '目标内测版本不存在' }, { status: 404 });
      }

      const routeMap = buildRouteMap([routeRow]);
      return NextResponse.json({ success: true, data: attachRouteMeta(data, routeMap) });
    }

    const { data, error } = await adminDbClient
      .from('feature_beta_versions')
      .insert({
        id: randomUUID(),
        ...values,
        created_by: adminCheck.userId || null,
      })
      .select(VERSION_COLUMNS)
      .maybeSingle();

    if (error) {
      if (isDuplicateDbError(error)) {
        return NextResponse.json({ error: '该内测码已存在，请更换后重试' }, { status: 409 });
      }
      console.error('新增内测版本失败:', error);
      return NextResponse.json({ error: '新增内测版本失败' }, { status: 500 });
    }

    if (!data) {
      const { data: fallback, error: fallbackError } = await adminDbClient
        .from('feature_beta_versions')
        .select(VERSION_COLUMNS)
        .eq('feature_code', featureCode)
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (fallbackError) {
        console.error('回读内测版本失败:', fallbackError);
        return NextResponse.json({ error: '新增内测版本成功，但读取结果失败' }, { status: 500 });
      }

      const routeMap = buildRouteMap([routeRow]);
      return NextResponse.json({ success: true, data: fallback ? attachRouteMeta(fallback, routeMap) : null });
    }

    const routeMap = buildRouteMap([routeRow]);
    return NextResponse.json({ success: true, data: attachRouteMeta(data, routeMap) });
  } catch (error) {
    const message = readErrorMessage(error);
    console.error('保存内测版本时发生异常:', error);
    return NextResponse.json({ error: message || '服务器错误' }, { status: 500 });
  }
}


