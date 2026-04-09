'use client';

import type { ReactNode } from 'react';
import type { AppChannel, PageCenterOverviewItem } from '@/lib/page-center/config';
import {
  MINIPROGRAM_TAB_PAGE_OPTIONS,
  type MiniProgramIconKey,
  type MiniProgramTabKey,
} from '@/lib/miniprogram/runtime-config';

export interface RegistryDraft {
  pageKey: string;
  pageName: string;
  pageDescription: string;
  routePathWeb: string;
  routePathMiniProgram: string;
  previewRoutePathWeb: string;
  previewRoutePathMiniProgram: string;
  tabKey: MiniProgramTabKey | '';
  iconKey: MiniProgramIconKey | '';
  defaultTabText: string;
  defaultGuestTabText: string;
  isNavCandidateWeb: boolean;
  isTabCandidateMiniProgram: boolean;
  supportsBeta: boolean;
  supportsPreview: boolean;
  isBuiltIn: boolean;
  isActive: boolean;
}

export type RegistryTextField =
  | 'pageKey'
  | 'pageName'
  | 'pageDescription'
  | 'routePathWeb'
  | 'routePathMiniProgram'
  | 'previewRoutePathWeb'
  | 'previewRoutePathMiniProgram'
  | 'defaultTabText'
  | 'defaultGuestTabText';

export type RegistryBooleanField =
  | 'isNavCandidateWeb'
  | 'isTabCandidateMiniProgram'
  | 'supportsBeta'
  | 'supportsPreview'
  | 'isBuiltIn'
  | 'isActive';

export type RegistryOptionField = 'iconKey' | 'tabKey';

interface RegistryOption {
  value: string;
  label: string;
  iconKey?: string;
  pagePath?: string;
  defaultText?: string;
  defaultGuestText?: string;
}

interface PageRegistryFormProps {
  channel: AppChannel;
  title: string;
  badge: string;
  value: RegistryDraft;
  expanded?: boolean;
  collapseHint?: string;
  headerActions?: ReactNode;
  pageKeyReadOnly?: boolean;
  sharedFieldsReadOnly?: boolean;
  onTextChange: (field: RegistryTextField, value: string) => void;
  onBooleanChange: (field: RegistryBooleanField, value: boolean) => void;
  onOptionSelect: (field: RegistryOptionField, value: string) => void;
  onSave: () => void;
  saving: boolean;
  saveText: string;
  savingText: string;
  onReset?: () => void;
}

export const PAGE_CENTER_ICON_OPTIONS: RegistryOption[] = [
  { value: '', label: '不设置图标' },
  { value: 'home', label: 'home / 首页' },
  { value: 'album', label: 'album / 提取' },
  { value: 'gallery', label: 'gallery / 照片墙' },
  { value: 'booking', label: 'booking / 约拍' },
  { value: 'profile', label: 'profile / 我的' },
  { value: 'about', label: 'about / 关于' },
];

export const PAGE_CENTER_TAB_OPTIONS: RegistryOption[] = [{ value: '', label: '不绑定小程序菜单' }].concat(
  MINIPROGRAM_TAB_PAGE_OPTIONS.map((item) => ({
    value: item.key,
    label: `${item.key} / ${item.defaultText}`,
    iconKey: item.iconKey,
    pagePath: item.pagePath,
    defaultText: item.defaultText,
    defaultGuestText: item.defaultGuestText,
  }))
);

const PAGE_CENTER_TAB_OPTION_MAP = new Map(
  PAGE_CENTER_TAB_OPTIONS.filter((item) => item.value).map((item) => [item.value, item])
);

const INPUT_CLASS = 'mt-1 h-11 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 outline-none';
const TEXTAREA_CLASS = 'mt-1 min-h-24 w-full rounded-2xl border border-[#5D4037]/12 bg-white px-4 py-3 outline-none';
const READONLY_INPUT_CLASS = `${INPUT_CLASS} cursor-not-allowed bg-[#F7F3EE] text-[#8D6E63]`;

function normalizeRegistryText(value: unknown) {
  return String(value ?? '').trim();
}

export function createEmptyRegistryDraft(): RegistryDraft {
  return {
    pageKey: '',
    pageName: '',
    pageDescription: '',
    routePathWeb: '',
    routePathMiniProgram: '',
    previewRoutePathWeb: '',
    previewRoutePathMiniProgram: '',
    tabKey: '',
    iconKey: '',
    defaultTabText: '',
    defaultGuestTabText: '',
    isNavCandidateWeb: false,
    isTabCandidateMiniProgram: false,
    supportsBeta: true,
    supportsPreview: true,
    isBuiltIn: false,
    isActive: true,
  };
}

export function createRegistryDraftFromPage(item: PageCenterOverviewItem): RegistryDraft {
  return {
    pageKey: item.pageKey,
    pageName: item.pageName,
    pageDescription: item.pageDescription,
    routePathWeb: item.routePathWeb,
    routePathMiniProgram: item.routePathMiniProgram,
    previewRoutePathWeb: item.previewRoutePathWeb,
    previewRoutePathMiniProgram: item.previewRoutePathMiniProgram,
    tabKey: item.tabKey || '',
    iconKey: item.iconKey || '',
    defaultTabText: item.defaultTabText,
    defaultGuestTabText: item.defaultGuestTabText,
    isNavCandidateWeb: item.isNavCandidateWeb,
    isTabCandidateMiniProgram: item.isTabCandidateMiniProgram,
    supportsBeta: item.supportsBeta,
    supportsPreview: item.supportsPreview,
    isBuiltIn: item.isBuiltIn,
    isActive: item.isActive,
  };
}

export function buildRegistryPayload(input: RegistryDraft): RegistryDraft {
  return {
    pageKey: normalizeRegistryText(input.pageKey),
    pageName: normalizeRegistryText(input.pageName),
    pageDescription: normalizeRegistryText(input.pageDescription),
    routePathWeb: normalizeRegistryText(input.routePathWeb),
    routePathMiniProgram: normalizeRegistryText(input.routePathMiniProgram),
    previewRoutePathWeb: normalizeRegistryText(input.previewRoutePathWeb),
    previewRoutePathMiniProgram: normalizeRegistryText(input.previewRoutePathMiniProgram),
    tabKey: normalizeRegistryText(input.tabKey),
    iconKey: normalizeRegistryText(input.iconKey),
    defaultTabText: normalizeRegistryText(input.defaultTabText),
    defaultGuestTabText: normalizeRegistryText(input.defaultGuestTabText),
    isNavCandidateWeb: Boolean(input.isNavCandidateWeb),
    isTabCandidateMiniProgram: Boolean(input.isTabCandidateMiniProgram),
    supportsBeta: Boolean(input.supportsBeta),
    supportsPreview: Boolean(input.supportsPreview),
    isBuiltIn: Boolean(input.isBuiltIn),
    isActive: Boolean(input.isActive),
  };
}

export function validateRegistryDraft(input: RegistryDraft, channel: AppChannel | 'all' = 'all') {
  if (!normalizeRegistryText(input.pageKey)) {
    return '请先填写页面标识';
  }
  if (channel !== 'miniprogram' && !normalizeRegistryText(input.routePathWeb)) {
    return '请先填写 Web 路由';
  }
  if (channel !== 'web' && !normalizeRegistryText(input.routePathMiniProgram)) {
    return '请先填写小程序路由';
  }
  return '';
}

export function buildRegistryOptionPatch(
  current: RegistryDraft,
  field: RegistryOptionField,
  value: string
): Partial<RegistryDraft> {
  const patch: Partial<RegistryDraft> = { [field]: value };
  if (field === 'iconKey' && !value) {
    patch.isNavCandidateWeb = false;
    patch.isTabCandidateMiniProgram = false;
  }
  if (field === 'tabKey') {
    if (!value) {
      patch.isTabCandidateMiniProgram = false;
    }
    const option = PAGE_CENTER_TAB_OPTION_MAP.get(value);
    if (option) {
      if (!normalizeRegistryText(current.iconKey)) {
        patch.iconKey = option.iconKey || '';
      }
      if (!normalizeRegistryText(current.routePathMiniProgram)) {
        patch.routePathMiniProgram = option.pagePath || '';
      }
      if (!normalizeRegistryText(current.defaultTabText)) {
        patch.defaultTabText = option.defaultText || '';
      }
      if (!normalizeRegistryText(current.defaultGuestTabText)) {
        patch.defaultGuestTabText = option.defaultGuestText || '';
      }
    }
  }
  return patch;
}

export default function PageRegistryForm({
  channel,
  title,
  badge,
  value,
  expanded = true,
  collapseHint,
  headerActions,
  pageKeyReadOnly = false,
  sharedFieldsReadOnly = false,
  onTextChange,
  onBooleanChange,
  onOptionSelect,
  onSave,
  saving,
  saveText,
  savingText,
  onReset,
}: PageRegistryFormProps) {
  const showWebFields = channel === 'web';
  const showMiniProgramFields = channel === 'miniprogram';
  const descriptionText = pageKeyReadOnly
    ? '已有页面的 pageKey 为稳定主键，当前仅支持查看，不支持直接改名。'
    : showWebFields
      ? '当前界面只维护 Web 路由、Web 查看路由与 Web 底栏候选；小程序页面规则请到“小程序页面管理”中完成。'
      : '当前界面只维护小程序路由、小程序查看路由、小程序菜单键与小程序底栏候选；Web 页面规则请到“Web 页面管理”中完成。';
  const sharedFieldHint = sharedFieldsReadOnly
    ? '为避免 Web 页面管理与小程序页面管理互相影响，现有页面的大部分共享注册信息已锁定；这里只允许编辑当前端专属路由、查看路由、底栏候选能力，以及必要的共享访问能力。'
    : '新建页面时可一次性填写共享注册信息；页面创建后，再分别到 Web 页面管理或小程序页面管理维护各自的端侧配置。';

  return (
    <div className="rounded-[24px] border border-[#5D4037]/10 bg-[#FFFBF7] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8D6E63]">{badge}</div>
          <h3 className="mt-3 text-lg font-bold text-[#5D4037]">{title}</h3>
          {!expanded && collapseHint ? (
            <p className="mt-2 text-sm leading-6 text-[#8D6E63]">{collapseHint}</p>
          ) : null}
        </div>
        {headerActions ? <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">{headerActions}</div> : null}
      </div>

      {expanded ? (
        <>
          <p className="mt-4 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm leading-6 text-[#8D6E63]">
            {sharedFieldHint}
          </p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm text-[#5D4037]/80">
              页面标识
              <input
                value={value.pageKey}
                onChange={(event) => onTextChange('pageKey', event.target.value)}
                readOnly={pageKeyReadOnly}
                placeholder="如 pose-plus"
                className={pageKeyReadOnly ? READONLY_INPUT_CLASS : INPUT_CLASS}
              />
            </label>
            {!sharedFieldsReadOnly ? (
              <label className="text-sm text-[#5D4037]/80">
                页面名称
                <input
                  value={value.pageName}
                  onChange={(event) => onTextChange('pageName', event.target.value)}
                  placeholder="如 摆姿 Plus"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            {showWebFields ? (
              <label className="text-sm text-[#5D4037]/80">
                Web 路由
                <input
                  value={value.routePathWeb}
                  onChange={(event) => onTextChange('routePathWeb', event.target.value)}
                  placeholder="如 /pose-plus"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            {showMiniProgramFields ? (
              <label className="text-sm text-[#5D4037]/80">
                小程序路由
                <input
                  value={value.routePathMiniProgram}
                  onChange={(event) => onTextChange('routePathMiniProgram', event.target.value)}
                  placeholder="如 pages/pose-plus/index"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            {showWebFields ? (
              <label className="text-sm text-[#5D4037]/80">
                Web 查看路由
                <input
                  value={value.previewRoutePathWeb}
                  onChange={(event) => onTextChange('previewRoutePathWeb', event.target.value)}
                  placeholder="可留空自动生成"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            {showMiniProgramFields ? (
              <label className="text-sm text-[#5D4037]/80">
                小程序查看路由
                <input
                  value={value.previewRoutePathMiniProgram}
                  onChange={(event) => onTextChange('previewRoutePathMiniProgram', event.target.value)}
                  placeholder="可留空自动生成"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            {!sharedFieldsReadOnly ? (
              <label className="text-sm text-[#5D4037]/80">
                默认菜单名称
                <input
                  value={value.defaultTabText}
                  onChange={(event) => onTextChange('defaultTabText', event.target.value)}
                  placeholder="如 摆姿"
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
          </div>

          {!sharedFieldsReadOnly ? (
            <label className="mt-4 block text-sm text-[#5D4037]/80">
              页面说明
              <textarea
                value={value.pageDescription}
                onChange={(event) => onTextChange('pageDescription', event.target.value)}
                placeholder="页面用途、入口定位、适用说明"
                className={TEXTAREA_CLASS}
              />
            </label>
          ) : null}

          {!sharedFieldsReadOnly ? (
            <div className="mt-4 space-y-4">
              <div>
                <p className="text-sm text-[#5D4037]/80">图标键（支持 home / album / gallery / booking / profile / about）</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {PAGE_CENTER_ICON_OPTIONS.map((option) => (
                    <button
                      key={option.value || 'empty'}
                      type="button"
                      onClick={() => onOptionSelect('iconKey', option.value)}
                      className={[
                        'rounded-full px-4 py-2 text-sm font-semibold transition',
                        value.iconKey === option.value
                          ? 'border border-[#5D4037] bg-[#FFC857] text-[#5D4037]'
                          : 'border border-[#5D4037]/15 bg-white text-[#5D4037]',
                      ].join(' ')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {showMiniProgramFields ? (
                <div>
                  <p className="text-sm text-[#5D4037]/80">小程序菜单键（留空则默认使用 pageKey）</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {PAGE_CENTER_TAB_OPTIONS.map((option) => (
                      <button
                        key={option.value || 'empty'}
                        type="button"
                        onClick={() => onOptionSelect('tabKey', option.value)}
                        className={[
                          'rounded-full px-4 py-2 text-sm font-semibold transition',
                          value.tabKey === option.value
                            ? 'border border-[#5D4037] bg-[#FFC857] text-[#5D4037]'
                            : 'border border-[#5D4037]/15 bg-white text-[#5D4037]',
                        ].join(' ')}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {showWebFields ? (
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
                <span>Web 底栏候选</span>
                <input
                  type="checkbox"
                  checked={value.isNavCandidateWeb}
                  onChange={(event) => onBooleanChange('isNavCandidateWeb', event.target.checked)}
                />
              </label>
            ) : null}
            {showMiniProgramFields ? (
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
                <span>小程序底栏候选</span>
                <input
                  type="checkbox"
                  checked={value.isTabCandidateMiniProgram}
                  onChange={(event) => onBooleanChange('isTabCandidateMiniProgram', event.target.checked)}
                />
              </label>
            ) : null}
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
              <span>{sharedFieldsReadOnly ? '支持内测（双端共享）' : '支持内测'}</span>
              <input
                type="checkbox"
                checked={value.supportsBeta}
                onChange={(event) => onBooleanChange('supportsBeta', event.target.checked)}
              />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
              <span>{sharedFieldsReadOnly ? '支持查看（双端共享）' : '支持查看'}</span>
              <input
                type="checkbox"
                checked={value.supportsPreview}
                onChange={(event) => onBooleanChange('supportsPreview', event.target.checked)}
              />
            </label>
            {!sharedFieldsReadOnly ? (
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
                <span>标记为内置页</span>
                <input
                  type="checkbox"
                  checked={value.isBuiltIn}
                  onChange={(event) => onBooleanChange('isBuiltIn', event.target.checked)}
                />
              </label>
            ) : null}
            {!sharedFieldsReadOnly ? (
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[#5D4037]/10 bg-white px-4 py-3 text-sm text-[#5D4037]">
                <span>启用页面</span>
                <input
                  type="checkbox"
                  checked={value.isActive}
                  onChange={(event) => onBooleanChange('isActive', event.target.checked)}
                />
              </label>
            ) : null}
          </div>

          {sharedFieldsReadOnly ? (
            <p className="mt-3 text-xs leading-6 text-[#8D6E63]">
              “支持内测 / 支持查看”属于必要的共享能力，会同时影响 Web 与小程序；其余共享字段继续保持锁定，避免双端互相干扰。
            </p>
          ) : null}

          <p className="mt-3 text-xs leading-6 text-[#8D6E63]">{descriptionText}</p>

          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="w-full rounded-full border-2 border-[#5D4037] bg-[#FFC857] px-5 py-2 text-sm font-bold text-[#5D4037] shadow-[4px_4px_0_#5D4037] disabled:opacity-60 sm:w-auto"
            >
              {saving ? savingText : saveText}
            </button>
            {onReset ? (
              <button
                type="button"
                onClick={onReset}
                disabled={saving}
                className="w-full rounded-full border border-[#5D4037]/15 bg-white px-5 py-2 text-sm font-semibold text-[#5D4037] sm:w-auto"
              >
                清空草稿
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
