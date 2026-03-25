'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import {
  BETA_FEATURE_CODE_LENGTH,
  BETA_PRESET_ROUTE_OPTIONS,
  generateAdminBetaFeatureCode,
  normalizeBetaFeatureCode,
  normalizeBetaRoutePath,
  normalizeDbBoolean,
} from '@/lib/utils/admin-beta';
import { parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import { setClipboardText } from '@/lib/android';

type ActiveTab = 'routes' | 'versions';
type ModalMode = 'create' | 'edit';
type ToastType = 'success' | 'error';
type RouteStateClass = 'beta-admin-state--active' | 'beta-admin-state--inactive';
type VersionStateClass = 'beta-admin-state--active' | 'beta-admin-state--inactive' | 'beta-admin-state--expired';

interface ListResponse<T> {
  data?: T[];
  error?: string;
}

interface RouteApiRow {
  id?: unknown;
  route_path?: unknown;
  route_title?: unknown;
  route_description?: unknown;
  is_active?: unknown;
}

interface VersionApiRow {
  id?: unknown;
  feature_name?: unknown;
  feature_description?: unknown;
  feature_code?: unknown;
  route_id?: unknown;
  route_title?: unknown;
  route_path?: unknown;
  is_active?: unknown;
  expires_at?: unknown;
}

interface RoutePresetRow {
  route_path: string;
  route_title: string;
}

interface RouteRow {
  id: number;
  route_path: string;
  route_title: string;
  route_description: string;
  is_active: boolean;
  stateText: string;
  stateClass: RouteStateClass;
}

interface VersionRow {
  id: string;
  feature_name: string;
  feature_description: string;
  feature_code: string;
  route_id: number;
  route_title: string;
  route_path: string;
  is_active: boolean;
  expires_at: string;
  expires_date: string;
  expires_text: string;
  is_expired: boolean;
  stateText: string;
  stateClass: VersionStateClass;
}

interface RouteFormState {
  id: number;
  route_path: string;
  route_title: string;
  route_description: string;
  is_active: boolean;
}

interface VersionFormState {
  id: string;
  feature_name: string;
  feature_description: string;
  feature_code: string;
  route_id: number;
  is_active: boolean;
  has_expiry: boolean;
  expires_date: string;
}

interface ToastState {
  type: ToastType;
  message: string;
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  if (typeof error === 'object' && error !== null) {
    const message = String((error as { message?: unknown; error?: unknown }).message ?? '').trim();
    if (message) return message;
    const altMessage = String((error as { error?: unknown }).error ?? '').trim();
    if (altMessage) return altMessage;
  }
  if (typeof error === 'string' && error.trim()) {
    return error.trim();
  }
  return fallback;
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(typeof payload.error === 'string' && payload.error.trim() ? payload.error : '请求失败');
  }
  return payload;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function formatDateTime(value: unknown): string {
  const parsed = parseDateTimeUTC8(value);
  if (!parsed) return '';
  const shifted = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  const hour = pad2(shifted.getUTCHours());
  const minute = pad2(shifted.getUTCMinutes());
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

function formatDateOnly(value: unknown): string {
  const parsed = parseDateTimeUTC8(value);
  if (!parsed) return '';
  const shifted = new Date(parsed.getTime() + 8 * 60 * 60 * 1000);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  return `${year}-${month}-${day}`;
}

function buildRoutePresetRows(currentRoutePath: string): RoutePresetRow[] {
  const normalizedCurrent = normalizeBetaRoutePath(currentRoutePath);
  const rows = BETA_PRESET_ROUTE_OPTIONS.map((item) => ({
    route_path: normalizeBetaRoutePath(item.route_path),
    route_title: String(item.route_title || '').trim(),
  })).filter((item) => item.route_path);

  if (normalizedCurrent && !rows.some((item) => item.route_path === normalizedCurrent)) {
    rows.unshift({
      route_path: normalizedCurrent,
      route_title: '历史路由（请核对）',
    });
  }

  return rows;
}

function resolveRoutePresetState(routePath: string, presetRows: RoutePresetRow[]) {
  if (!presetRows.length) {
    return { index: 0, previewTitle: '', previewPath: '', presetTitle: '' };
  }

  const normalizedPath = normalizeBetaRoutePath(routePath);
  const matchedIndex = presetRows.findIndex((item) => item.route_path === normalizedPath);
  const nextIndex = matchedIndex >= 0 ? matchedIndex : 0;
  const selected = presetRows[nextIndex] || presetRows[0];
  return {
    index: nextIndex,
    previewTitle: String(selected?.route_title || ''),
    previewPath: String(selected?.route_path || ''),
    presetTitle: String(selected?.route_title || ''),
  };
}

function buildDefaultRouteForm(): RouteFormState {
  const presetRows = buildRoutePresetRows('');
  const firstRoute = presetRows[0] || null;
  return {
    id: 0,
    route_path: firstRoute?.route_path || '',
    route_title: firstRoute?.route_title || '',
    route_description: '',
    is_active: true,
  };
}

function buildDefaultVersionForm(routes: RouteRow[]): VersionFormState {
  const firstRoute = routes[0] || null;
  return {
    id: '',
    feature_name: '',
    feature_description: '',
    feature_code: generateAdminBetaFeatureCode(),
    route_id: firstRoute?.id || 0,
    is_active: true,
    has_expiry: false,
    expires_date: '',
  };
}

function createRouteRow(row: RouteApiRow): RouteRow | null {
  const routeId = Number(row.id ?? 0);
  if (!Number.isInteger(routeId) || routeId <= 0) return null;
  const isActive = normalizeDbBoolean(row.is_active, true);
  return {
    id: routeId,
    route_path: normalizeBetaRoutePath(row.route_path),
    route_title: String(row.route_title ?? '').trim(),
    route_description: String(row.route_description ?? '').trim(),
    is_active: isActive,
    stateText: isActive ? '启用中' : '已停用',
    stateClass: isActive ? 'beta-admin-state--active' : 'beta-admin-state--inactive',
  };
}

function createVersionRows(versionRowsInput: VersionApiRow[], routeRows: RouteRow[]): VersionRow[] {
  const routeMap = new Map<number, RouteRow>();
  routeRows.forEach((item) => routeMap.set(item.id, item));

  const now = Date.now();
  return versionRowsInput
    .map((row) => {
      const versionId = String(row.id ?? '').trim();
      if (!versionId) return null;

      const routeId = Number(row.route_id ?? 0);
      const routeMeta = routeMap.get(routeId);
      const routePath = normalizeBetaRoutePath(row.route_path ?? routeMeta?.route_path ?? '');
      const routeTitle = String(row.route_title ?? routeMeta?.route_title ?? '').trim();
      const expiresAt = String(row.expires_at ?? '').trim();
      const parsedExpiresAt = parseDateTimeUTC8(expiresAt);
      const isExpired = Boolean(parsedExpiresAt && parsedExpiresAt.getTime() < now);
      const isActive = normalizeDbBoolean(row.is_active, true);

      let stateText = '生效中';
      let stateClass: VersionStateClass = 'beta-admin-state--active';
      if (!isActive) {
        stateText = '已停用';
        stateClass = 'beta-admin-state--inactive';
      } else if (isExpired) {
        stateText = '已过期';
        stateClass = 'beta-admin-state--expired';
      }

      return {
        id: versionId,
        feature_name: String(row.feature_name ?? '').trim(),
        feature_description: String(row.feature_description ?? '').trim(),
        feature_code: normalizeBetaFeatureCode(row.feature_code),
        route_id: Number.isInteger(routeId) ? routeId : 0,
        route_title: routeTitle,
        route_path: routePath,
        is_active: isActive,
        expires_at: expiresAt,
        expires_date: formatDateOnly(expiresAt),
        expires_text: formatDateTime(expiresAt),
        is_expired: isExpired,
        stateText,
        stateClass,
      } satisfies VersionRow;
    })
    .filter((item): item is VersionRow => Boolean(item));
}

export default function AdminBetaPage() {
  const toastTimerRef = useRef<number | null>(null);
  const bootstrapLoadTokenRef = useRef(0);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('routes');
  const [routeRows, setRouteRows] = useState<RouteRow[]>([]);
  const [versionRows, setVersionRows] = useState<VersionRow[]>([]);

  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const [routeModalMode, setRouteModalMode] = useState<ModalMode>('create');
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeForm, setRouteForm] = useState<RouteFormState>(buildDefaultRouteForm());
  const [routePresetRows, setRoutePresetRows] = useState<RoutePresetRow[]>(buildRoutePresetRows(''));
  const [routePresetIndex, setRoutePresetIndex] = useState(0);
  const [routePresetPreviewTitle, setRoutePresetPreviewTitle] = useState('');
  const [routePresetPreviewPath, setRoutePresetPreviewPath] = useState('');
  const [routePresetLastTitle, setRoutePresetLastTitle] = useState('');
  const [routeDeleteConfirmOpen, setRouteDeleteConfirmOpen] = useState(false);
  const [routeDeletingId, setRouteDeletingId] = useState(0);
  const [routeDeletingTitle, setRouteDeletingTitle] = useState('');
  const [routeDeleting, setRouteDeleting] = useState(false);

  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionModalMode, setVersionModalMode] = useState<ModalMode>('create');
  const [versionSaving, setVersionSaving] = useState(false);
  const [versionForm, setVersionForm] = useState<VersionFormState>(buildDefaultVersionForm([]));
  const [versionRoutePickerIndex, setVersionRoutePickerIndex] = useState(0);
  const [versionRoutePreviewTitle, setVersionRoutePreviewTitle] = useState('');
  const [versionRoutePreviewPath, setVersionRoutePreviewPath] = useState('');
  const [versionDeleteConfirmOpen, setVersionDeleteConfirmOpen] = useState(false);
  const [versionDeletingId, setVersionDeletingId] = useState('');
  const [versionDeletingName, setVersionDeletingName] = useState('');
  const [versionDeleting, setVersionDeleting] = useState(false);

  const [toast, setToast] = useState<ToastState | null>(null);

  const clearToastTimer = () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const showToast = useCallback((type: ToastType, message: string) => {
    clearToastTimer();
    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2600);
  }, []);

  useEffect(() => {
    return () => clearToastTimer();
  }, []);

  const applyRows = useCallback(
    (routes: RouteApiRow[], versions: VersionApiRow[]) => {
      const nextRouteRows = (Array.isArray(routes) ? routes : [])
        .map((item) => createRouteRow(item))
        .filter((item): item is RouteRow => Boolean(item));
      const nextVersionRows = createVersionRows(Array.isArray(versions) ? versions : [], nextRouteRows);

      const selectedRouteId = Number(versionForm.route_id || 0);
      const nextRouteIndex = Math.max(0, nextRouteRows.findIndex((item) => item.id === selectedRouteId));
      const previewRoute = nextRouteRows[nextRouteIndex] || nextRouteRows[0] || null;

      setRouteRows(nextRouteRows);
      setVersionRows(nextVersionRows);
      setVersionRoutePickerIndex(nextRouteIndex);
      setVersionRoutePreviewTitle(previewRoute?.route_title || '');
      setVersionRoutePreviewPath(previewRoute?.route_path || '');
    },
    [versionForm.route_id]
  );

  const bootstrap = useCallback(async () => {
    const loadToken = bootstrapLoadTokenRef.current + 1;
    bootstrapLoadTokenRef.current = loadToken;

    setLoading(true);
    try {
      const [routeResult, versionResult] = await Promise.all([
        apiRequest<ListResponse<RouteApiRow>>('/api/admin/beta/routes?limit=500'),
        apiRequest<ListResponse<VersionApiRow>>('/api/admin/beta/versions?limit=500'),
      ]);

      if (loadToken !== bootstrapLoadTokenRef.current) {
        return;
      }

      applyRows(routeResult.data || [], versionResult.data || []);
    } catch (error) {
      if (loadToken !== bootstrapLoadTokenRef.current) {
        return;
      }
      showToast('error', toErrorMessage(error, '加载内测数据失败'));
    } finally {
      if (loadToken === bootstrapLoadTokenRef.current) {
        setLoading(false);
      }
    }
  }, [applyRows, showToast]);

  useEffect(() => {
    void bootstrap();

    return () => {
      bootstrapLoadTokenRef.current += 1;
    };
  }, [bootstrap]);

  const onOpenCreateRoute = () => {
    const nextPresetRows = buildRoutePresetRows('');
    const nextPresetState = resolveRoutePresetState('', nextPresetRows);
    const nextRouteForm = buildDefaultRouteForm();
    setRouteModalOpen(true);
    setRouteModalMode('create');
    setRouteForm(nextRouteForm);
    setRoutePresetRows(nextPresetRows);
    setRoutePresetIndex(nextPresetState.index);
    setRoutePresetPreviewTitle(nextPresetState.previewTitle);
    setRoutePresetPreviewPath(nextPresetState.previewPath);
    setRoutePresetLastTitle(nextPresetState.presetTitle);
  };

  const onOpenEditRoute = (routeId: number) => {
    const target = routeRows.find((item) => item.id === routeId);
    if (!target) return;

    const nextPresetRows = buildRoutePresetRows(target.route_path);
    const nextPresetState = resolveRoutePresetState(target.route_path, nextPresetRows);

    setRouteModalOpen(true);
    setRouteModalMode('edit');
    setRouteForm({
      id: target.id,
      route_path: target.route_path,
      route_title: target.route_title,
      route_description: target.route_description,
      is_active: target.is_active,
    });
    setRoutePresetRows(nextPresetRows);
    setRoutePresetIndex(nextPresetState.index);
    setRoutePresetPreviewTitle(nextPresetState.previewTitle);
    setRoutePresetPreviewPath(nextPresetState.previewPath);
    setRoutePresetLastTitle(nextPresetState.presetTitle);
  };

  const onCloseRouteModal = (forceClose = false) => {
    if (routeSaving && !forceClose) return;
    setRouteModalOpen(false);
    setRouteModalMode('create');
    setRouteForm(buildDefaultRouteForm());
    setRoutePresetRows(buildRoutePresetRows(''));
    setRoutePresetIndex(0);
    setRoutePresetPreviewTitle('');
    setRoutePresetPreviewPath('');
    setRoutePresetLastTitle('');
  };

  const onRouteInput = (field: keyof Pick<RouteFormState, 'route_title' | 'route_description'>, value: string) => {
    setRouteForm((current) => ({ ...current, [field]: value }));
  };

  const onRoutePresetChange = (indexValue: string) => {
    const index = Number(indexValue || 0);
    const rows = Array.isArray(routePresetRows) ? routePresetRows : [];
    if (!rows.length) return;

    const safeIndex = index >= 0 && index < rows.length ? index : 0;
    const selected = rows[safeIndex] || rows[0];
    const selectedPath = normalizeBetaRoutePath(selected?.route_path);
    const selectedTitle = String(selected?.route_title || '').trim();
    const currentTitle = String(routeForm.route_title || '').trim();
    const lastPresetTitle = String(routePresetLastTitle || '').trim();
    const shouldAutoFillTitle = !currentTitle || currentTitle === lastPresetTitle;

    setRoutePresetIndex(safeIndex);
    setRoutePresetPreviewTitle(selectedTitle);
    setRoutePresetPreviewPath(selectedPath);
    setRoutePresetLastTitle(selectedTitle);
    setRouteForm((current) => ({
      ...current,
      route_path: selectedPath,
      route_title: shouldAutoFillTitle ? selectedTitle : current.route_title,
    }));
  };

  const onSubmitRoute = async () => {
    if (routeSaving) return;
    const routePath = normalizeBetaRoutePath(routeForm.route_path);
    const routeTitle = String(routeForm.route_title || '').trim();

    if (!routePath) {
      showToast('error', '请选择功能路由');
      return;
    }
    if (!routeTitle) {
      showToast('error', '请输入功能名称');
      return;
    }

    setRouteSaving(true);
    try {
      await apiRequest('/api/admin/beta/routes', {
        method: 'POST',
        body: JSON.stringify({
          id: Number(routeForm.id || 0),
          route_path: routePath,
          route_title: routeTitle,
          route_description: String(routeForm.route_description || '').trim(),
          is_active: Boolean(routeForm.is_active),
        }),
      });
      showToast('success', routeModalMode === 'edit' ? '路由已更新' : '路由已创建');
      onCloseRouteModal(true);
      await bootstrap();
    } catch (error) {
      showToast('error', toErrorMessage(error, '保存内测路由失败'));
    } finally {
      setRouteSaving(false);
    }
  };

  const onOpenRouteDeleteConfirm = (routeId: number) => {
    const target = routeRows.find((item) => item.id === routeId);
    if (!target) return;
    setRouteDeleteConfirmOpen(true);
    setRouteDeletingId(routeId);
    setRouteDeletingTitle(target.route_title);
  };

  const onCloseRouteDeleteConfirm = (forceClose = false) => {
    if (routeDeleting && !forceClose) return;
    setRouteDeleteConfirmOpen(false);
    setRouteDeletingId(0);
    setRouteDeletingTitle('');
  };

  const onConfirmRouteDelete = async () => {
    if (!routeDeletingId || routeDeleting) return;
    setRouteDeleting(true);
    try {
      await apiRequest(`/api/admin/beta/routes/${routeDeletingId}`, { method: 'DELETE' });
      showToast('success', '路由已删除');
      onCloseRouteDeleteConfirm(true);
      await bootstrap();
    } catch (error) {
      showToast('error', toErrorMessage(error, '删除内测路由失败'));
    } finally {
      setRouteDeleting(false);
    }
  };

  const onOpenCreateVersion = () => {
    if (!routeRows.length) {
      showToast('error', '请先创建至少一个内测路由');
      return;
    }

    const nextForm = buildDefaultVersionForm(routeRows);
    setVersionModalOpen(true);
    setVersionModalMode('create');
    setVersionForm(nextForm);
    setVersionRoutePickerIndex(0);
    setVersionRoutePreviewTitle(routeRows[0]?.route_title || '');
    setVersionRoutePreviewPath(routeRows[0]?.route_path || '');
  };

  const onOpenEditVersion = (versionId: string) => {
    const target = versionRows.find((item) => item.id === versionId);
    if (!target) return;

    const targetIndex = Math.max(0, routeRows.findIndex((item) => item.id === Number(target.route_id || 0)));
    setVersionModalOpen(true);
    setVersionModalMode('edit');
    setVersionForm({
      id: target.id,
      feature_name: target.feature_name,
      feature_description: target.feature_description,
      feature_code: target.feature_code,
      route_id: target.route_id,
      is_active: target.is_active,
      has_expiry: Boolean(target.expires_date),
      expires_date: target.expires_date,
    });
    setVersionRoutePickerIndex(targetIndex);
    setVersionRoutePreviewTitle(target.route_title || '');
    setVersionRoutePreviewPath(target.route_path || '');
  };

  const onCloseVersionModal = (forceClose = false) => {
    if (versionSaving && !forceClose) return;
    setVersionModalOpen(false);
    setVersionModalMode('create');
    setVersionForm(buildDefaultVersionForm(routeRows));
    setVersionRoutePickerIndex(0);
    setVersionRoutePreviewTitle('');
    setVersionRoutePreviewPath('');
  };

  const onVersionInput = (
    field: keyof Pick<VersionFormState, 'feature_name' | 'feature_description' | 'feature_code'>,
    value: string
  ) => {
    setVersionForm((current) => ({
      ...current,
      [field]: field === 'feature_code' ? normalizeBetaFeatureCode(value) : value,
    }));
  };

  const onVersionRouteChange = (indexValue: string) => {
    const index = Number(indexValue || 0);
    if (!routeRows.length) return;
    const target = routeRows[index] || routeRows[0];
    setVersionForm((current) => ({ ...current, route_id: Number(target.id || 0) }));
    setVersionRoutePickerIndex(index);
    setVersionRoutePreviewTitle(String(target.route_title || ''));
    setVersionRoutePreviewPath(String(target.route_path || ''));
  };

  const onGenerateVersionCode = () => {
    setVersionForm((current) => ({ ...current, feature_code: generateAdminBetaFeatureCode() }));
  };

  const onSubmitVersion = async () => {
    if (versionSaving) return;

    const featureName = String(versionForm.feature_name || '').trim();
    const featureCode = normalizeBetaFeatureCode(versionForm.feature_code);
    const routeId = Number(versionForm.route_id || 0);

    if (!featureName) {
      showToast('error', '请输入内测功能名称');
      return;
    }
    if (!routeId || !Number.isInteger(routeId)) {
      showToast('error', '请选择功能路由');
      return;
    }
    if (!featureCode) {
      showToast('error', '请输入内测码');
      return;
    }
    if (featureCode.length !== BETA_FEATURE_CODE_LENGTH) {
      showToast('error', `内测码必须是 ${BETA_FEATURE_CODE_LENGTH} 位大写字母或数字`);
      return;
    }
    if (versionForm.has_expiry && !String(versionForm.expires_date || '').trim()) {
      showToast('error', '请选择有效期日期');
      return;
    }

    const expiresAt = versionForm.has_expiry ? `${String(versionForm.expires_date || '').trim()} 23:59:59` : null;

    setVersionSaving(true);
    try {
      await apiRequest('/api/admin/beta/versions', {
        method: 'POST',
        body: JSON.stringify({
          id: String(versionForm.id || '').trim(),
          feature_name: featureName,
          feature_description: String(versionForm.feature_description || '').trim(),
          feature_code: featureCode,
          route_id: routeId,
          is_active: Boolean(versionForm.is_active),
          expires_at: expiresAt,
        }),
      });
      showToast('success', versionModalMode === 'edit' ? '版本已更新' : '版本已创建');
      onCloseVersionModal(true);
      await bootstrap();
    } catch (error) {
      showToast('error', toErrorMessage(error, '保存内测版本失败'));
    } finally {
      setVersionSaving(false);
    }
  };

  const onOpenVersionDeleteConfirm = (versionId: string) => {
    const target = versionRows.find((item) => item.id === versionId);
    if (!target) return;
    setVersionDeleteConfirmOpen(true);
    setVersionDeletingId(versionId);
    setVersionDeletingName(target.feature_name);
  };

  const onCloseVersionDeleteConfirm = (forceClose = false) => {
    if (versionDeleting && !forceClose) return;
    setVersionDeleteConfirmOpen(false);
    setVersionDeletingId('');
    setVersionDeletingName('');
  };

  const onConfirmVersionDelete = async () => {
    const versionId = String(versionDeletingId || '').trim();
    if (!versionId || versionDeleting) return;

    setVersionDeleting(true);
    try {
      await apiRequest(`/api/admin/beta/versions/${versionId}`, { method: 'DELETE' });
      showToast('success', '版本已删除');
      onCloseVersionDeleteConfirm(true);
      await bootstrap();
    } catch (error) {
      showToast('error', toErrorMessage(error, '删除内测版本失败'));
    } finally {
      setVersionDeleting(false);
    }
  };

  const onCopyVersionCode = async (code: string) => {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) return;

    if (setClipboardText(normalizedCode)) {
      showToast('success', '内测码已复制');
      return;
    }

    try {
      await navigator.clipboard.writeText(normalizedCode);
      showToast('success', '内测码已复制');
    } catch {
      showToast('error', '复制失败，请重试');
    }
  };

  return (
    <div className="admin-mobile-page beta-admin-page">
      <div className="beta-admin-head">
        <Link href="/admin/stats" className="beta-admin-head__back" aria-label="返回管理首页">
          <ArrowLeft className="beta-admin-head__back-icon" strokeWidth={2.4} />
        </Link>
        <div className="beta-admin-head__main">
          <h1 className="beta-admin-head__title">内测管理</h1>
          <p className="beta-admin-head__desc">🧪 功能灰度配置</p>
        </div>
      </div>

      {loading ? (
        <div className="beta-admin-loading">
          <div className="beta-admin-loading__spinner" />
          <span className="beta-admin-loading__text">正在加载内测数据...</span>
        </div>
      ) : (
        <>
          <div className="beta-admin-tabs">
            <button
              type="button"
              className={`beta-admin-tab ${activeTab === 'routes' ? 'beta-admin-tab--active' : ''}`}
              onClick={() => setActiveTab('routes')}
            >
              路由管理
            </button>
            <button
              type="button"
              className={`beta-admin-tab ${activeTab === 'versions' ? 'beta-admin-tab--active' : ''}`}
              onClick={() => setActiveTab('versions')}
            >
              版本管理
            </button>
          </div>

          {activeTab === 'routes' ? (
            <>
              <div className="beta-admin-toolbar">
                <button type="button" className="beta-admin-toolbar__btn beta-admin-toolbar__btn--primary" onClick={onOpenCreateRoute}>
                  + 新增路由
                </button>
              </div>

              {!routeRows.length ? (
                <div className="beta-admin-empty">
                  <span className="beta-admin-empty__icon">🧭</span>
                  <span className="beta-admin-empty__text">暂无内测路由</span>
                </div>
              ) : (
                <div className="beta-admin-cards">
                  {routeRows.map((item) => (
                    <div key={item.id} className="beta-admin-card">
                      <div className="beta-admin-card__head">
                        <div className="beta-admin-card__main">
                          <span className="beta-admin-card__title">{item.route_title}</span>
                          <span className="beta-admin-card__path">{item.route_path}</span>
                        </div>
                        <span className={`beta-admin-state ${item.stateClass}`}>{item.stateText}</span>
                      </div>
                      {item.route_description ? <span className="beta-admin-card__desc">{item.route_description}</span> : null}
                      <div className="beta-admin-card__actions">
                        <button type="button" className="beta-admin-action-btn beta-admin-action-btn--edit" onClick={() => onOpenEditRoute(item.id)}>
                          编辑
                        </button>
                        <button type="button" className="beta-admin-action-btn beta-admin-action-btn--delete" onClick={() => onOpenRouteDeleteConfirm(item.id)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="beta-admin-toolbar">
                <button type="button" className="beta-admin-toolbar__btn beta-admin-toolbar__btn--primary" onClick={onOpenCreateVersion}>
                  + 新增版本
                </button>
              </div>

              {!routeRows.length ? (
                <div className="beta-admin-empty">
                  <span className="beta-admin-empty__icon">🗂️</span>
                  <span className="beta-admin-empty__text">请先在路由管理中创建路由</span>
                </div>
              ) : !versionRows.length ? (
                <div className="beta-admin-empty">
                  <span className="beta-admin-empty__icon">🧪</span>
                  <span className="beta-admin-empty__text">暂无内测版本</span>
                </div>
              ) : (
                <div className="beta-admin-cards">
                  {versionRows.map((item) => (
                    <div key={item.id} className="beta-admin-card">
                      <div className="beta-admin-card__head">
                        <div className="beta-admin-card__main">
                          <span className="beta-admin-card__title">{item.feature_name}</span>
                          <span className="beta-admin-card__path">
                            {item.route_title || '未绑定路由'} · {item.route_path || '未设置路径'}
                          </span>
                        </div>
                        <span className={`beta-admin-state ${item.stateClass}`}>{item.stateText}</span>
                      </div>
                      {item.feature_description ? <span className="beta-admin-card__desc">{item.feature_description}</span> : null}
                      <div className="beta-admin-code-row">
                        <span className="beta-admin-code">内测码：{item.feature_code}</span>
                        <button type="button" className="beta-admin-mini-btn" onClick={() => void onCopyVersionCode(item.feature_code)}>
                          复制
                        </button>
                      </div>
                      <span className="beta-admin-expire">
                        {item.expires_text ? `有效期至：${item.expires_text}` : '有效期：长期有效'}
                      </span>
                      <div className="beta-admin-card__actions">
                        <button type="button" className="beta-admin-action-btn beta-admin-action-btn--edit" onClick={() => onOpenEditVersion(item.id)}>
                          编辑
                        </button>
                        <button type="button" className="beta-admin-action-btn beta-admin-action-btn--delete" onClick={() => onOpenVersionDeleteConfirm(item.id)}>
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {routeModalOpen ? (
        <div className="beta-admin-modal-mask" onClick={() => onCloseRouteModal()}>
          <div className="beta-admin-modal" onClick={(event) => event.stopPropagation()}>
            <div className="beta-admin-modal__head">
              <h2 className="beta-admin-modal__title">{routeModalMode === 'edit' ? '编辑内测路由' : '新增内测路由'}</h2>
            </div>
            <div className="beta-admin-modal__body">
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-route-preset">功能路由</label>
                <select id="beta-route-preset" className="beta-admin-field__select" value={String(routePresetIndex)} onChange={(event) => onRoutePresetChange(event.target.value)} disabled={routeSaving}>
                  {routePresetRows.map((item, index) => (
                    <option key={`${item.route_path}-${index}`} value={index}>{item.route_title}</option>
                  ))}
                </select>
                {routePresetPreviewPath ? <span className="beta-admin-field__hint">{routePresetPreviewPath}</span> : null}
              </div>
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-route-title">功能名称</label>
                <input id="beta-route-title" className="beta-admin-field__input" value={routeForm.route_title} onChange={(event) => onRouteInput('route_title', event.target.value)} placeholder="例如：摆姿推荐" maxLength={128} disabled={routeSaving} />
              </div>
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-route-desc">功能简介（选填）</label>
                <textarea id="beta-route-desc" className="beta-admin-field__textarea" value={routeForm.route_description} onChange={(event) => onRouteInput('route_description', event.target.value)} placeholder="简要描述该内测功能" maxLength={255} disabled={routeSaving} />
              </div>
              <div className="beta-admin-switch-row">
                <span className="beta-admin-switch-row__label">启用状态</span>
                <button type="button" className={`beta-admin-switch ${routeForm.is_active ? 'beta-admin-switch--on' : ''}`} onClick={() => setRouteForm((current) => ({ ...current, is_active: !current.is_active }))} disabled={routeSaving} aria-pressed={routeForm.is_active}>
                  <span className={`beta-admin-switch__thumb ${routeForm.is_active ? 'beta-admin-switch__thumb--on' : ''}`} />
                </button>
              </div>
            </div>
            <div className="beta-admin-modal__foot">
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--ghost" onClick={() => onCloseRouteModal()} disabled={routeSaving}>取消</button>
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--primary" onClick={() => void onSubmitRoute()} disabled={routeSaving}>{routeSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {versionModalOpen ? (
        <div className="beta-admin-modal-mask" onClick={() => onCloseVersionModal()}>
          <div className="beta-admin-modal beta-admin-modal--scrollable" onClick={(event) => event.stopPropagation()}>
            <div className="beta-admin-modal__head">
              <h2 className="beta-admin-modal__title">{versionModalMode === 'edit' ? '编辑内测版本' : '新增内测版本'}</h2>
            </div>
            <div className="beta-admin-modal__body beta-admin-modal__body--scroll">
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-version-name">内测功能名称</label>
                <input id="beta-version-name" className="beta-admin-field__input" value={versionForm.feature_name} onChange={(event) => onVersionInput('feature_name', event.target.value)} placeholder="例如：摆姿推荐" maxLength={128} disabled={versionSaving} />
              </div>
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-version-desc">内测功能简介（选填）</label>
                <textarea id="beta-version-desc" className="beta-admin-field__textarea" value={versionForm.feature_description} onChange={(event) => onVersionInput('feature_description', event.target.value)} placeholder="用于展示给用户的说明" maxLength={255} disabled={versionSaving} />
              </div>
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-version-route">功能路由</label>
                <select id="beta-version-route" className="beta-admin-field__select" value={String(versionRoutePickerIndex)} onChange={(event) => onVersionRouteChange(event.target.value)} disabled={versionSaving}>
                  {routeRows.map((item, index) => (
                    <option key={item.id} value={index}>{item.route_title}</option>
                  ))}
                </select>
                {versionRoutePreviewPath ? <span className="beta-admin-field__hint">{versionRoutePreviewPath}</span> : null}
              </div>
              <div className="beta-admin-field">
                <label className="beta-admin-field__label" htmlFor="beta-feature-code">内测码</label>
                <div className="beta-admin-code-input-row">
                  <input id="beta-feature-code" className="beta-admin-field__input beta-admin-field__input--code" value={versionForm.feature_code} onChange={(event) => onVersionInput('feature_code', event.target.value)} placeholder="输入或生成内测码" maxLength={BETA_FEATURE_CODE_LENGTH} disabled={versionSaving} />
                  <button type="button" className="beta-admin-mini-btn" onClick={onGenerateVersionCode} disabled={versionSaving}>随机生成</button>
                </div>
              </div>
              <div className="beta-admin-switch-row">
                <span className="beta-admin-switch-row__label">启用状态</span>
                <button type="button" className={`beta-admin-switch ${versionForm.is_active ? 'beta-admin-switch--on' : ''}`} onClick={() => setVersionForm((current) => ({ ...current, is_active: !current.is_active }))} disabled={versionSaving} aria-pressed={versionForm.is_active}>
                  <span className={`beta-admin-switch__thumb ${versionForm.is_active ? 'beta-admin-switch__thumb--on' : ''}`} />
                </button>
              </div>
              <div className="beta-admin-switch-row">
                <span className="beta-admin-switch-row__label">设置有效期</span>
                <button type="button" className={`beta-admin-switch ${versionForm.has_expiry ? 'beta-admin-switch--on' : ''}`} onClick={() => setVersionForm((current) => ({ ...current, has_expiry: !current.has_expiry, expires_date: current.has_expiry ? '' : current.expires_date }))} disabled={versionSaving} aria-pressed={versionForm.has_expiry}>
                  <span className={`beta-admin-switch__thumb ${versionForm.has_expiry ? 'beta-admin-switch__thumb--on' : ''}`} />
                </button>
              </div>
              {versionForm.has_expiry ? (
                <div className="beta-admin-field">
                  <label className="beta-admin-field__label" htmlFor="beta-expiry-date">有效期日期</label>
                  <input id="beta-expiry-date" type="date" className="beta-admin-field__input" value={versionForm.expires_date} onChange={(event) => setVersionForm((current) => ({ ...current, expires_date: event.target.value }))} disabled={versionSaving} />
                </div>
              ) : null}
            </div>
            <div className="beta-admin-modal__foot">
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--ghost" onClick={() => onCloseVersionModal()} disabled={versionSaving}>取消</button>
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--primary" onClick={() => void onSubmitVersion()} disabled={versionSaving}>{versionSaving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {routeDeleteConfirmOpen ? (
        <div className="beta-admin-modal-mask" onClick={() => onCloseRouteDeleteConfirm()}>
          <div className="beta-admin-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="beta-admin-confirm-modal__title">删除内测路由</h3>
            <p className="beta-admin-confirm-modal__desc">确认删除「{routeDeletingTitle || '该路由'}」吗？</p>
            <div className="beta-admin-confirm-modal__actions">
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--ghost" onClick={() => onCloseRouteDeleteConfirm()} disabled={routeDeleting}>取消</button>
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--danger" onClick={() => void onConfirmRouteDelete()} disabled={routeDeleting}>{routeDeleting ? '删除中...' : '删除'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {versionDeleteConfirmOpen ? (
        <div className="beta-admin-modal-mask" onClick={() => onCloseVersionDeleteConfirm()}>
          <div className="beta-admin-confirm-modal" onClick={(event) => event.stopPropagation()}>
            <h3 className="beta-admin-confirm-modal__title">删除内测版本</h3>
            <p className="beta-admin-confirm-modal__desc">确认删除「{versionDeletingName || '该版本'}」吗？</p>
            <div className="beta-admin-confirm-modal__actions">
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--ghost" onClick={() => onCloseVersionDeleteConfirm()} disabled={versionDeleting}>取消</button>
              <button type="button" className="beta-admin-modal-btn beta-admin-modal-btn--danger" onClick={() => void onConfirmVersionDelete()} disabled={versionDeleting}>{versionDeleting ? '删除中...' : '删除'}</button>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`beta-admin-toast beta-admin-toast--${toast.type}`}>{toast.message}</div> : null}
    </div>
  );
}
