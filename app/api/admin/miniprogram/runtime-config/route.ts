import { NextResponse } from 'next/server';
import { ensureAdminSession } from '@/app/api/admin/_utils/ensure-admin-session';
import { createClient } from '@/lib/cloudbase/server';
import { loadEffectiveMiniProgramRuntimeConfig } from '@/lib/page-center/runtime';
import {
  buildRuntimeConfigPreset,
  normalizeRuntimeConfigRow,
} from '@/lib/miniprogram/runtime-config';

export const dynamic = 'force-dynamic';

const SELECT_COLUMNS = [
  'id',
  'config_key',
  'config_name',
  'scene_code',
  'home_mode',
  'guest_profile_mode',
  'auth_mode',
  'tab_bar_items_json',
  'feature_flags_json',
  'notes',
  'is_active',
  'updated_at',
].join(', ');

function normalizeBooleanInput(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value !== 0 : fallback;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(text)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(text)) return false;
  return fallback;
}

function serializeJsonInput(fallback: string, ...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const text = candidate.trim();
      if (text) {
        return text;
      }
      continue;
    }

    if (candidate !== null && candidate !== undefined) {
      try {
        return JSON.stringify(candidate);
      } catch {
        // ignore invalid payloads and continue
      }
    }
  }

  return fallback;
}

async function loadLatestRuntimeConfig() {
  try {
    const dbClient = await createClient();
    const { data, error } = await dbClient
      .from('miniprogram_runtime_settings')
      .select(SELECT_COLUMNS)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const runtimeConfig = normalizeRuntimeConfigRow(data || null);
    return {
      rowId: Number((data as { id?: number })?.id || 0) || null,
      runtimeConfig: runtimeConfig || buildRuntimeConfigPreset('standard'),
    };
  } catch {
    return {
      rowId: null,
      runtimeConfig: buildRuntimeConfigPreset('standard'),
    };
  }
}

export async function GET() {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const [payload, effectiveRuntimeConfig] = await Promise.all([
      loadLatestRuntimeConfig(),
      loadEffectiveMiniProgramRuntimeConfig(),
    ]);
    return NextResponse.json({
      ...payload,
      effectiveData: effectiveRuntimeConfig,
    });
  } catch (error) {
    console.error('读取小程序运行时配置失败:', error);
    return NextResponse.json({ error: '读取小程序运行时配置失败' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const adminCheck = await ensureAdminSession();
    if (!adminCheck.ok) {
      return adminCheck.response;
    }

    const body = (await request.json()) as Record<string, unknown>;
    const dbClient = await createClient();
    const payload = {
      config_key: String(body.config_key || body.configKey || 'default').trim() || 'default',
      config_name: String(body.config_name || body.configName || '').trim(),
      scene_code: String(body.scene_code || body.sceneCode || 'standard').trim(),
      home_mode: String(body.home_mode || body.homeMode || 'pose').trim(),
      guest_profile_mode: String(body.guest_profile_mode || body.guestProfileMode || 'login').trim(),
      auth_mode: String(body.auth_mode || body.authMode || 'wechat_only').trim(),
      tab_bar_items_json: serializeJsonInput(
        '[]',
        body.tab_bar_items_json,
        body.tabBarItemsJson,
        body.tabBarItems
      ),
      feature_flags_json: serializeJsonInput(
        '{}',
        body.feature_flags_json,
        body.featureFlagsJson,
        body.featureFlags
      ),
      notes: String(body.notes || '').trim() || null,
      is_active: true,
    };

    if (!payload.config_name) {
      return NextResponse.json({ error: '缺少配置名称' }, { status: 400 });
    }

    const rowId = Number(body.id || body.rowId || 0) || null;
    if (rowId) {
      const { data, error } = await dbClient
        .from('miniprogram_runtime_settings')
        .update(payload)
        .eq('id', rowId)
        .select(SELECT_COLUMNS)
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return NextResponse.json({ error: '目标运行时配置不存在' }, { status: 404 });
      }

      const runtimeConfig = normalizeRuntimeConfigRow(data || null);
      return NextResponse.json({ rowId, data: runtimeConfig || buildRuntimeConfigPreset('standard') });
    }

    const { data, error } = await dbClient
      .from('miniprogram_runtime_settings')
      .insert(payload)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      throw error;
    }

    const nextRowId = Number((data as { id?: number })?.id || 0) || null;
    const runtimeConfig = normalizeRuntimeConfigRow(data || null);
    return NextResponse.json({ rowId: nextRowId, data: runtimeConfig || buildRuntimeConfigPreset('standard') });
  } catch (error) {
    console.error('保存小程序运行时配置失败:', error);
    return NextResponse.json({ error: '保存小程序运行时配置失败' }, { status: 500 });
  }
}
