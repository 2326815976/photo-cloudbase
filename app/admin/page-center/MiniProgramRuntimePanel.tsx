'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle, RefreshCw, Smartphone } from 'lucide-react';
import {
  buildRuntimeConfigPreset,
  MINIPROGRAM_TAB_PAGE_OPTIONS,
  MiniProgramAuthMode,
  MiniProgramFeatureFlags,
  MiniProgramGuestProfileMode,
  MiniProgramHomeMode,
  MiniProgramRuntimeConfig,
  MiniProgramRuntimeConfigSource,
  MiniProgramSceneCode,
  MiniProgramTabBarItem,
  serializeFeatureFlags,
  serializeTabBarItems,
} from '@/lib/miniprogram/runtime-config';

const EMPTY_MESSAGE = '暂无配置';

interface FormState {
  configKey: string;
  configName: string;
  sceneCode: MiniProgramSceneCode;
  hideAudit: boolean;
  homeMode: MiniProgramHomeMode;
  guestProfileMode: MiniProgramGuestProfileMode;
  authMode: MiniProgramAuthMode;
  tabBarItems: MiniProgramTabBarItem[];
  featureFlags: MiniProgramFeatureFlags;
  notes: string;
}

interface RuntimeSettingsPayload {
  rowId?: number | null;
  data?: MiniProgramRuntimeConfig;
  effectiveData?: MiniProgramRuntimeConfig;
  meta?: {
    envOverrideActive?: boolean;
    envHideAuditOverride?: boolean | null;
  };
  error?: string;
}

function cloneTabBarItems(items: MiniProgramTabBarItem[]): MiniProgramTabBarItem[] {
  return (Array.isArray(items) ? items : []).map((item) => ({ ...item }));
}

function cloneFeatureFlags(flags: MiniProgramFeatureFlags): MiniProgramFeatureFlags {
  return {
    showProfileEdit: Boolean(flags.showProfileEdit),
    showProfileBookings: Boolean(flags.showProfileBookings),
    showDonationQrCode: Boolean(flags.showDonationQrCode),
    allowPoseBetaBypass: Boolean(flags.allowPoseBetaBypass),
  };
}

function toFormState(config: MiniProgramRuntimeConfig): FormState {
  return {
    configKey: config.configKey,
    configName: config.configName,
    sceneCode: config.sceneCode,
    hideAudit: config.hideAudit,
    homeMode: config.homeMode,
    guestProfileMode: config.guestProfileMode,
    authMode: config.authMode,
    tabBarItems: cloneTabBarItems(config.tabBarItems),
    featureFlags: cloneFeatureFlags(config.featureFlags),
    notes: config.notes,
  };
}

function buildPayload(form: FormState) {
  return {
    config_key: form.configKey || 'default',
    config_name: form.configName.trim(),
    scene_code: form.sceneCode,
    legacy_hide_audit: form.hideAudit,
    home_mode: form.homeMode,
    guest_profile_mode: form.guestProfileMode,
    auth_mode: form.authMode,
    tab_bar_items_json: serializeTabBarItems(form.tabBarItems),
    feature_flags_json: serializeFeatureFlags(form.featureFlags),
    notes: form.notes.trim() || null,
    is_active: true,
  };
}

function getSceneLabel(sceneCode: MiniProgramSceneCode): string {
  if (sceneCode === 'review') return '审核版';
  if (sceneCode === 'custom') return '自定义';
  return '正式版';
}

function getTabLabel(item: MiniProgramTabBarItem, loggedIn: boolean): string {
  return loggedIn ? item.text : item.guestText || item.text;
}

export default function MiniProgramRuntimePanel() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rowId, setRowId] = useState<number | null>(null);
  const [source, setSource] = useState<MiniProgramRuntimeConfigSource>('default_fallback');
  const [updatedAt, setUpdatedAt] = useState('');
  const [envOverrideActive, setEnvOverrideActive] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(buildRuntimeConfigPreset('review')));
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2800);
  };

  const loadRuntimeSettings = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/miniprogram/runtime-config', { cache: 'no-store' });
      const payload = (await response.json()) as RuntimeSettingsPayload;
      if (!response.ok) {
        throw new Error(payload.error || '读取小程序运行时配置失败');
      }

      const runtimeConfig = payload.data || buildRuntimeConfigPreset('review');
      const effectiveRuntimeConfig = payload.effectiveData || runtimeConfig;
      setRowId(Number(payload.rowId || 0) || null);
      setSource(effectiveRuntimeConfig.source || runtimeConfig.source || 'default_fallback');
      setUpdatedAt(effectiveRuntimeConfig.updatedAt || runtimeConfig.updatedAt || '');
      setEnvOverrideActive(Boolean(payload.meta?.envOverrideActive));
      setForm(toFormState(runtimeConfig));
    } catch (error) {
      const runtimeConfig = buildRuntimeConfigPreset('review');
      setRowId(null);
      setSource('default_fallback');
      setUpdatedAt('');
      setEnvOverrideActive(false);
      setForm(toFormState(runtimeConfig));
      showToast('error', error instanceof Error ? error.message : '读取小程序运行时配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRuntimeSettings();
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const enabledTabItems = useMemo(() => form.tabBarItems.filter((item) => item.enabled), [form.tabBarItems]);

  const hasDuplicateEnabledRoutes = useMemo(() => {
    const values = enabledTabItems.map((item) => item.pagePath);
    return new Set(values).size !== values.length;
  }, [enabledTabItems]);

  const applyPreset = (sceneCode: Exclude<MiniProgramSceneCode, 'custom'>) => {
    const preset = buildRuntimeConfigPreset(sceneCode);
    setForm((current) => ({
      ...current,
      configName: preset.configName,
      sceneCode: preset.sceneCode,
      hideAudit: preset.hideAudit,
      homeMode: preset.homeMode,
      guestProfileMode: preset.guestProfileMode,
      authMode: preset.authMode,
      tabBarItems: cloneTabBarItems(preset.tabBarItems),
      featureFlags: cloneFeatureFlags(preset.featureFlags),
    }));
  };

  const updateField = <Key extends keyof FormState>(key: Key, value: FormState[Key]) => {
    setForm((current) => ({
      ...current,
      sceneCode: current.sceneCode === 'custom' ? current.sceneCode : 'custom',
      [key]: value,
    }));
  };

  const updateTabItem = <Key extends keyof MiniProgramTabBarItem>(
    index: number,
    key: Key,
    value: MiniProgramTabBarItem[Key]
  ) => {
    setForm((current) => {
      const rows = cloneTabBarItems(current.tabBarItems);
      if (!rows[index]) return current;

      const nextRow = { ...rows[index], [key]: value };
      if (key === 'pagePath') {
        const matched = MINIPROGRAM_TAB_PAGE_OPTIONS.find((item) => item.pagePath === value);
        if (matched) {
          nextRow.key = matched.key;
          nextRow.iconKey = matched.iconKey;
          if (!String(rows[index].text || '').trim()) nextRow.text = matched.defaultText;
          if (!String(rows[index].guestText || '').trim()) nextRow.guestText = matched.defaultGuestText;
        }
      }

      rows[index] = nextRow;
      return {
        ...current,
        sceneCode: current.sceneCode === 'custom' ? current.sceneCode : 'custom',
        tabBarItems: rows,
      };
    });
  };

  const addTabItem = () => {
    setForm((current) => {
      if (current.tabBarItems.length >= MINIPROGRAM_TAB_PAGE_OPTIONS.length) return current;
      const usedPaths = new Set(current.tabBarItems.map((item) => item.pagePath));
      const nextOption =
        MINIPROGRAM_TAB_PAGE_OPTIONS.find((item) => !usedPaths.has(item.pagePath)) ||
        MINIPROGRAM_TAB_PAGE_OPTIONS[0];

      return {
        ...current,
        sceneCode: current.sceneCode === 'custom' ? current.sceneCode : 'custom',
        tabBarItems: [
          ...current.tabBarItems,
          {
            key: nextOption.key,
            iconKey: nextOption.iconKey,
            pagePath: nextOption.pagePath,
            text: nextOption.defaultText,
            guestText: nextOption.defaultGuestText,
            enabled: true,
          },
        ],
      };
    });
  };

  const removeTabItem = (index: number) => {
    setForm((current) => {
      if (current.tabBarItems.length <= 1) return current;
      return {
        ...current,
        sceneCode: current.sceneCode === 'custom' ? current.sceneCode : 'custom',
        tabBarItems: current.tabBarItems.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const toggleFeatureFlag = (key: keyof MiniProgramFeatureFlags) => {
    setForm((current) => ({
      ...current,
      sceneCode: current.sceneCode === 'custom' ? current.sceneCode : 'custom',
      featureFlags: {
        ...current.featureFlags,
        [key]: !current.featureFlags[key],
      },
    }));
  };

  const onSave = async () => {
    const normalizedName = form.configName.trim();
    if (!normalizedName) {
      showToast('error', '请先填写配置名称');
      return;
    }
    if (enabledTabItems.length === 0) {
      showToast('error', '底部菜单至少保留一个启用项');
      return;
    }
    if (hasDuplicateEnabledRoutes) {
      showToast('error', '启用中的底部菜单路由不能重复');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/miniprogram/runtime-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rowId, ...buildPayload(form) }),
      });
      const payload = (await response.json()) as { rowId?: number | null; data?: MiniProgramRuntimeConfig; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || '保存小程序运行时配置失败');
      }

      const runtimeConfig = payload.data || buildRuntimeConfigPreset('review');
      setRowId(Number(payload.rowId || 0) || null);
      setSource(runtimeConfig.source || 'default_fallback');
      setUpdatedAt(runtimeConfig.updatedAt || '');
      setForm(toFormState(runtimeConfig));
      showToast('success', '小程序运行时配置已保存');
    } catch (error) {
      showToast('error', error instanceof Error ? error.message : '保存小程序运行时配置失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mini-runtime-panel rounded-[28px] border border-[#5D4037]/10 bg-white p-4 shadow-[0_12px_30px_rgba(93,64,55,0.06)] sm:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="max-w-3xl space-y-2">
          <p className="text-sm font-semibold text-[#5D4037]">微信小程序运行时配置</p>
          <p className="text-sm leading-6 text-[#5D4037]/70">
            这里统一管理首页、登录方式、底部菜单与 `HIDE_AUDIT` 兼容策略，保存后 Web 与小程序后台都会读取同一份配置。
          </p>
        </div>
        <div className="mini-runtime-panel__actions flex flex-wrap gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => void loadRuntimeSettings()}
            disabled={loading || saving}
            className="w-full rounded-full border border-[#5D4037]/15 bg-white px-5 py-2 text-sm font-semibold text-[#5D4037] sm:w-auto"
          >
            <span className="inline-flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {loading ? '刷新中…' : '重新加载'}
            </span>
          </button>
          <button
            type="button"
            onClick={() => applyPreset('standard')}
            disabled={loading || saving}
            className="w-full rounded-full border border-[#5D4037]/15 bg-white px-5 py-2 text-sm font-semibold text-[#5D4037] sm:w-auto"
          >
            正式版预设
          </button>
          <button
            type="button"
            onClick={() => applyPreset('review')}
            disabled={loading || saving}
            className="w-full rounded-full border border-[#5D4037]/15 bg-white px-5 py-2 text-sm font-semibold text-[#5D4037] sm:w-auto"
          >
            审核版预设
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={loading || saving}
            className="w-full rounded-full border-2 border-[#5D4037] bg-[#FFC857] px-5 py-2 text-sm font-bold text-[#5D4037] shadow-[4px_4px_0_#5D4037] disabled:opacity-60 sm:w-auto"
          >
            {saving ? '保存中…' : '保存配置'}
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 text-xs text-[#8D6E63]">
        <span className="rounded-full bg-[#5D4037]/8 px-3 py-1">来源：{loading ? '加载中' : source}</span>
        <span className="rounded-full bg-[#5D4037]/8 px-3 py-1">场景：{getSceneLabel(form.sceneCode)}</span>
        <span className="rounded-full bg-[#5D4037]/8 px-3 py-1">更新时间：{updatedAt || EMPTY_MESSAGE}</span>
      </div>

      {envOverrideActive ? (
        <div className="mt-4 rounded-[22px] border border-[#946200]/18 bg-[#FFF6E0] px-4 py-3 text-sm leading-6 text-[#946200]">
          当前环境变量 `HIDE_AUDIT` 正在覆盖运行态配置；本面板保存的是数据库配置，会在移除环境变量覆盖后自动接管。
        </div>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6">
          <div className="rounded-[24px] border border-[#5D4037]/10 bg-[#FFFBF3] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#5D4037]">运行时基础配置</h3>
                <p className="mt-1 text-xs text-[#8D6E63]">这里维护小程序运行态的兼容配置；页面管理里的首页入口、底栏顺序优先级更高，此处主要用于旧逻辑回退。</p>
              </div>
              <Smartphone className="h-5 w-5 text-[#8D6E63]" />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-[#5D4037]/80">
                配置名称
                <input
                  value={form.configName}
                  onChange={(event) => updateField('configName', event.target.value)}
                  disabled={loading || saving}
                  className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                />
              </label>
              <label className="text-sm text-[#5D4037]/80">
                运行场景
                <select
                  value={form.sceneCode}
                  onChange={(event) => updateField('sceneCode', event.target.value as MiniProgramSceneCode)}
                  disabled={loading || saving}
                  className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                >
                  <option value="standard">正式版</option>
                  <option value="review">审核版</option>
                  <option value="custom">自定义</option>
                </select>
              </label>
              <label className="text-sm text-[#5D4037]/80">
                兼容首页回退
                <select
                  value={form.homeMode}
                  onChange={(event) => updateField('homeMode', event.target.value as MiniProgramHomeMode)}
                  disabled={loading || saving}
                  className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                >
                  <option value="pose">摆姿推荐首页</option>
                  <option value="gallery">跳转照片墙</option>
                </select>
              </label>
              <label className="text-sm text-[#5D4037]/80">
                未登录【我的】模式
                <select
                  value={form.guestProfileMode}
                  onChange={(event) => updateField('guestProfileMode', event.target.value as MiniProgramGuestProfileMode)}
                  disabled={loading || saving}
                  className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                >
                  <option value="login">显示登录页</option>
                  <option value="about">显示关于页</option>
                </select>
              </label>
              <label className="text-sm text-[#5D4037]/80">
                登录模式
                <select
                  value={form.authMode}
                  onChange={(event) => updateField('authMode', event.target.value as MiniProgramAuthMode)}
                  disabled={loading || saving}
                  className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                >
                  <option value="phone_password">手机号 + 密码</option>
                  <option value="wechat_only">仅微信登录</option>
                  <option value="mixed">混合登录</option>
                </select>
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
                <span>保留 `HIDE_AUDIT` 兼容</span>
                <button
                  type="button"
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${form.hideAudit ? 'bg-[#FFC857] text-[#5D4037]' : 'bg-[#F4EDE6] text-[#5D4037]/70'}`}
                  onClick={() => updateField('hideAudit', !form.hideAudit)}
                  disabled={loading || saving}
                  aria-pressed={form.hideAudit}
                >
                  {form.hideAudit ? '开启' : '关闭'}
                </button>
              </label>
              <div />
            </div>

            <label className="mt-4 block text-sm text-[#5D4037]/80">
              备注
              <textarea
                value={form.notes}
                onChange={(event) => updateField('notes', event.target.value)}
                disabled={loading || saving}
                placeholder="记录当前上架策略、审核说明或发布备注"
                className="mt-1 min-h-24 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 py-3 outline-none"
              />
            </label>
          </div>

          <div className="rounded-[24px] border border-[#5D4037]/10 bg-[#FFFBF3] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#5D4037]">底部菜单</h3>
                <p className="mt-1 text-xs text-[#8D6E63]">支持顺序调整、启停和首页映射。</p>
              </div>
              <button
                type="button"
                onClick={addTabItem}
                disabled={loading || saving || form.tabBarItems.length >= MINIPROGRAM_TAB_PAGE_OPTIONS.length}
                className="rounded-full border border-[#5D4037]/15 bg-white px-4 py-2 text-sm font-semibold text-[#5D4037] disabled:opacity-60"
              >
                + 添加菜单项
              </button>
            </div>

            <div className="space-y-3">
              {form.tabBarItems.map((item, index) => (
                <div key={`${item.key}-${index}`} className="rounded-2xl border border-[#5D4037]/10 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-[#5D4037]">
                      {index + 1}. {item.key}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => updateTabItem(index, 'enabled', !item.enabled)}
                        disabled={loading || saving}
                        className={`rounded-full px-4 py-2 text-sm font-semibold ${item.enabled ? 'bg-[#E8F5E9] text-[#2E7D32]' : 'bg-[#F4EDE6] text-[#5D4037]/70'}`}
                      >
                        {item.enabled ? '启用' : '停用'}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeTabItem(index)}
                        disabled={loading || saving || form.tabBarItems.length <= 1}
                        className="rounded-full border border-[#D46A6A]/20 bg-[#FDECEC] px-4 py-2 text-sm font-semibold text-[#A34C4C] disabled:opacity-60"
                      >
                        删除
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-3">
                    <label className="text-sm text-[#5D4037]/80">
                      菜单名称
                      <input
                        value={item.text}
                        onChange={(event) => updateTabItem(index, 'text', event.target.value)}
                        disabled={loading || saving}
                        className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                      />
                    </label>
                    <label className="text-sm text-[#5D4037]/80">
                      游客名称
                      <input
                        value={item.guestText}
                        onChange={(event) => updateTabItem(index, 'guestText', event.target.value)}
                        disabled={loading || saving}
                        className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                      />
                    </label>
                    <label className="text-sm text-[#5D4037]/80">
                      菜单路由
                      <select
                        value={item.pagePath}
                        onChange={(event) => updateTabItem(index, 'pagePath', event.target.value)}
                        disabled={loading || saving}
                        className="mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none"
                      >
                        {MINIPROGRAM_TAB_PAGE_OPTIONS.map((option) => (
                          <option key={option.pagePath} value={option.pagePath}>
                            {option.pagePath}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-[24px] border border-[#5D4037]/10 bg-[#FFFBF3] p-5">
            <div className="mb-4">
              <h3 className="text-lg font-bold text-[#5D4037]">模块开关</h3>
              <p className="mt-1 text-xs text-[#8D6E63]">控制个人页和首页的关键功能展示。</p>
            </div>
            <div className="space-y-3">
              {[
                ['showProfileEdit', '显示编辑资料'],
                ['showProfileBookings', '显示预约记录'],
                ['showDonationQrCode', '显示赞赏码'],
                ['allowPoseBetaBypass', '允许摆姿内测绕过'],
              ].map(([key, label]) => {
                const flagKey = key as keyof MiniProgramFeatureFlags;
                return (
                  <div key={flagKey} className="flex flex-col items-start gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-[#5D4037]">{label}</span>
                    <button
                      type="button"
                      className={`w-full rounded-full px-4 py-2 text-sm font-semibold sm:w-auto ${form.featureFlags[flagKey] ? 'bg-[#FFC857] text-[#5D4037]' : 'bg-[#F4EDE6] text-[#5D4037]/70'}`}
                      onClick={() => toggleFeatureFlag(flagKey)}
                      disabled={loading || saving}
                      aria-pressed={form.featureFlags[flagKey]}
                    >
                      {form.featureFlags[flagKey] ? '开启' : '关闭'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[24px] border border-[#5D4037]/10 bg-[#FFFBF3] p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-[#5D4037]">效果预览</h3>
                <p className="mt-1 text-xs text-[#8D6E63]">用于快速确认保存后前台会呈现什么。</p>
              </div>
              <Smartphone className="h-5 w-5 text-[#8D6E63]" />
            </div>

            <div className="space-y-4 rounded-[22px] border border-[#5D4037]/10 bg-white p-4">
              <div>
                <div className="text-sm font-semibold text-[#5D4037]">访客视角</div>
                <div className="mt-1 text-sm leading-6 text-[#5D4037]/70">
                  兼容回退首页：{form.homeMode === 'pose' ? '摆姿推荐' : '照片墙'} · 我的：{form.guestProfileMode === 'about' ? '关于页' : '登录页'} · 登录：{form.authMode === 'wechat_only' ? '微信登录' : form.authMode === 'mixed' ? '手机号 + 微信' : '手机号 + 密码'}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {enabledTabItems.map((item) => (
                    <span key={`guest-${item.pagePath}`} className="rounded-full bg-[#FFFBF0] px-3 py-1 text-sm text-[#5D4037]">
                      {getTabLabel(item, false)}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold text-[#5D4037]">登录后视角</div>
                <div className="mt-1 text-sm leading-6 text-[#5D4037]/70">
                  编辑资料：{form.featureFlags.showProfileEdit ? '显示' : '隐藏'} · 预约记录：{form.featureFlags.showProfileBookings ? '显示' : '隐藏'} · 赞赏码：{form.featureFlags.showDonationQrCode ? '显示' : '隐藏'}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {enabledTabItems.map((item) => (
                    <span key={`member-${item.pagePath}`} className="rounded-full bg-[#FFFBF0] px-3 py-1 text-sm text-[#5D4037]">
                      {getTabLabel(item, true)}
                    </span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-dashed border-[#5D4037]/14 bg-[#FFFBF7] p-4 text-sm leading-6 text-[#5D4037]/72">
                <p>兼容说明：当前生效配置优先读取 `HIDE_AUDIT` 环境变量；未设置时再回退到数据库运行态配置；若数据库也没有记录，则继续回退旧版默认逻辑。</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {toast ? (
        <div className={`fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-medium text-white shadow-lg sm:left-auto sm:right-6 sm:translate-x-0 ${toast.type === 'success' ? 'bg-[#2E7D32]' : 'bg-[#A34C4C]'}`}>
          <span className="inline-flex items-center gap-2">
            {toast.type === 'success' ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{toast.message}</span>
          </span>
        </div>
      ) : null}
    </section>
  );
}
