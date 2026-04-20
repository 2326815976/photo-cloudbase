'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import type {
  AppChannel,
  AppPageBetaCodeItem,
  PageCenterOverviewItem,
  PagePublishState,
} from '@/lib/page-center/config';
import {
  isProfileAuthenticatedSecondaryPageKey,
  isProfileGuestSecondaryPageKey,
  isSecondaryPageKey,
  resolveSecondaryParentPageKey,
} from '@/lib/page-center/config';
import { canPageShowInNav } from '@/lib/page-center/capabilities';
import {
  buildRegistryOptionPatch,
  buildRegistryPayload,
  createEmptyRegistryDraft,
  createRegistryDraftFromPage,
  type RegistryBooleanField,
  type RegistryDraft,
  type RegistryOptionField,
  type RegistryTextField,
  validateRegistryDraft,
} from './PageRegistryForm';

interface RuleForm {
  publishState: PagePublishState;
  showInNav: boolean;
  navOrder: number;
  navText: string;
  guestNavText: string;
  headerTitle: string;
  headerSubtitle: string;
  isHomeEntry: boolean;
  notes: string;
}

interface BetaDraft {
  codeId: string;
  betaName: string;
  betaCode: string;
  expiresAt: string;
  channel: 'web' | 'miniprogram' | 'shared';
}

type BetaCodeLifecycleKey = 'usable' | 'expiring' | 'expired' | 'destroyed';

interface DecoratedBetaCode extends AppPageBetaCodeItem {
  scopeLabel: string;
  scopeHint: string;
  lifecycleKey: BetaCodeLifecycleKey;
  lifecycleLabel: string;
  lifecycleHint: string;
  lifecycleClassName: string;
  isUsable: boolean;
  expiresDateText: string;
  editActionText: string;
}

interface DecoratedBetaCodeSummary {
  total: number;
  usable: number;
  expiring: number;
  expired: number;
  destroyed: number;
}

interface PageManagementWorkspaceProps {
  channel: AppChannel;
}

type StateFilter = 'all' | PagePublishState;
type ActionModalState = { pageKey: string; mode: 'edit' | 'offline' } | null;

const CHANNEL_META: Record<
  AppChannel,
  {
    title: string;
    shortTitle: string;
    badge: string;
    description: string;
    navName: string;
    previewHint: string;
  }
> = {
  web: {
    title: 'Web 页面管理',
    shortTitle: 'Web',
    badge: '只管理 Web 页面',
    description: '列表管理，仅保留编辑、状态切换、查看。',
    navName: 'Web 底部菜单',
    previewHint: '查看与内测均走无底栏路由；上线后进入 Web 底部菜单并支持顺序调整，第 1 项自动作为首页。',
  },
  miniprogram: {
    title: '小程序页面管理',
    shortTitle: '小程序',
    badge: '只管理微信小程序页面',
    description: '列表管理，仅保留编辑、状态切换、查看。',
    navName: '小程序底部菜单',
    previewHint: '查看与内测均走无底栏路由；上线后进入小程序底部菜单并支持顺序调整，第 1 项自动作为首页。',
  },
};

const MINIPROGRAM_HIDDEN_PAGE_KEYS = new Set(['login', 'register']);

function shouldHidePageForChannel(pageKey: string, channel: AppChannel) {
  const normalizedPageKey = String(pageKey || '').trim();
  return channel === 'miniprogram' && MINIPROGRAM_HIDDEN_PAGE_KEYS.has(normalizedPageKey);
}

function isProfileGuestSecondaryPageForChannel(pageKey: string, channel: AppChannel) {
  return !shouldHidePageForChannel(pageKey, channel) && isProfileGuestSecondaryPageKey(pageKey);
}

function getCollectionSectionDescription(channel: AppChannel, shortTitle: string) {
  if (channel === 'miniprogram') {
    return `维护当前${shortTitle}端页面集合。一级页面可展开查看所属二级菜单；“我的”页仅保留登录后菜单排序，微信登录入口不再作为独立二级页维护。`;
  }
  return `维护当前${shortTitle}端页面集合。一级页面可展开查看所属二级菜单；“我的”页已区分登录前流程页与登录后菜单，登录后入口支持单独排序。`;
}

function getSecondaryOrderHelperText(channel: AppChannel) {
  if (channel === 'miniprogram') {
    return '这里的顺序会同步到登录后的「我的」页列表。只有登录后菜单会参与这里的排序。';
  }
  return '这里的顺序会同步到登录后的「我的」页列表。登录前流程页不会参与这里的排序。';
}

const STATE_FILTER_OPTIONS: Array<{ value: StateFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'online', label: '上线中' },
  { value: 'beta', label: '内测中' },
  { value: 'offline', label: '已下线' },
];

const BETA_SETTINGS_SECONDARY_BUTTON_CLASS =
  'w-full rounded-full border border-[#5D4037]/12 bg-white px-3 py-2 text-sm font-semibold text-[#5D4037] whitespace-nowrap disabled:opacity-60';

const BETA_SETTINGS_PRIMARY_BUTTON_CLASS =
  'w-full rounded-full bg-[#FFF6E0] px-3 py-2 text-sm font-bold text-[#946200] whitespace-nowrap disabled:opacity-60';

const PAGE_CENTER_LIST_ACTION_BASE_CLASS =
  'min-w-0 whitespace-nowrap rounded-full border px-3 py-2 text-[13px] font-semibold disabled:opacity-60 sm:px-4 sm:text-sm';

const PAGE_CENTER_ACTION_EDIT_CLASS =
  `${PAGE_CENTER_LIST_ACTION_BASE_CLASS} border-[#B86A2D]/18 bg-[#FFF1E6] text-[#B86A2D]`;

const PAGE_CENTER_ACTION_VIEW_CLASS =
  `${PAGE_CENTER_LIST_ACTION_BASE_CLASS} border-[#2F6FD6]/18 bg-[#EEF4FF] text-[#2F6FD6]`;

const PAGE_CENTER_ACTION_ONLINE_CLASS =
  `${PAGE_CENTER_LIST_ACTION_BASE_CLASS} border-[#2E7D32]/18 bg-[#E8F5E9] text-[#2E7D32]`;

const PAGE_CENTER_ACTION_BETA_CLASS =
  `${PAGE_CENTER_LIST_ACTION_BASE_CLASS} border-[#946200]/18 bg-[#FFF6E0] text-[#946200]`;

const PAGE_CENTER_ACTION_OFFLINE_CLASS =
  `${PAGE_CENTER_LIST_ACTION_BASE_CLASS} border-[#A34C4C]/18 bg-[#FDECEC] text-[#A34C4C]`;

const PAGE_CENTER_MODAL_VIEW_BUTTON_CLASS =
  'rounded-full border border-[#2F6FD6]/18 bg-[#EEF4FF] px-5 py-2.5 text-sm font-semibold text-[#2F6FD6] disabled:opacity-60';

const PAGE_CENTER_MODAL_ONLINE_BUTTON_CLASS =
  'rounded-full border border-[#2E7D32]/18 bg-[#E8F5E9] px-5 py-2.5 text-sm font-bold text-[#2E7D32] disabled:opacity-60';

const EDIT_MODAL_SAVE_BUTTON_CLASS =
  'rounded-full border border-transparent bg-[#FFC857] px-5 py-2.5 text-sm font-bold text-[#5D4037] disabled:opacity-60';

const BETA_SETTINGS_SAVE_BUTTON_CLASS =
  'w-full rounded-full bg-[#FFC857] px-3 py-2 text-sm font-semibold text-[#5D4037] whitespace-nowrap disabled:opacity-60';

function buildRuleFormMap(rows: PageCenterOverviewItem[]) {
  const next: Record<string, RuleForm> = {};
  rows.forEach((item) => {
    (['web', 'miniprogram'] as AppChannel[]).forEach((channel) => {
      const view = item.channels[channel];
      next[`${item.pageKey}:${channel}`] = {
        publishState: view.publishState,
        showInNav: view.showInNav,
        navOrder: view.navOrder,
        navText: view.navText,
        guestNavText: view.guestNavText,
        headerTitle: view.headerTitle,
        headerSubtitle: view.headerSubtitle,
        isHomeEntry: view.isHomeEntry,
        notes: view.notes,
      };
    });
  });
  return next;
}

function buildRegistryDraftMap(rows: PageCenterOverviewItem[]) {
  const next: Record<string, RegistryDraft> = {};
  rows.forEach((item) => {
    next[item.pageKey] = createRegistryDraftFromPage(item);
  });
  return next;
}

function createEmptyBetaDraft(channel: BetaDraft['channel'] = 'shared'): BetaDraft {
  return {
    codeId: '',
    betaName: '',
    betaCode: '',
    expiresAt: '',
    channel,
  };
}

const BETA_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const BETA_CODE_LENGTH = 8;

function generateRandomBetaCode(length = BETA_CODE_LENGTH) {
  let next = '';
  for (let index = 0; index < length; index += 1) {
    const randomIndex = Math.floor(Math.random() * BETA_CODE_CHARS.length);
    next += BETA_CODE_CHARS[randomIndex] || 'A';
  }
  return next;
}

function extractDateText(value: string) {
  const matched = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : '';
}

function filterBetaCodesByChannel(codes: AppPageBetaCodeItem[], channel: AppChannel) {
  return (Array.isArray(codes) ? codes : []).filter((item) => item.channel === channel);
}

function getTodayDateText() {
  const current = new Date();
  const year = current.getFullYear();
  const month = String(current.getMonth() + 1).padStart(2, '0');
  const date = String(current.getDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}

function getDateDiffFromToday(dateText: string) {
  if (!dateText) return null;
  const today = new Date(`${getTodayDateText()}T00:00:00`);
  const target = new Date(`${dateText}T00:00:00`);
  const diff = target.getTime() - today.getTime();
  if (Number.isNaN(diff)) {
    return null;
  }
  return Math.round(diff / 86400000);
}

function resolveBetaScopeMeta(codeChannel: AppPageBetaCodeItem['channel'], channel: AppChannel) {
  if (codeChannel === 'shared') {
    return {
      scopeLabel: '双端通用',
      scopeHint: 'Web 与小程序登录用户都可绑定这条内测码进入当前页面。',
    };
  }

  return {
    scopeLabel: channel === 'web' ? '仅 Web' : '仅小程序',
    scopeHint:
      channel === 'web'
        ? '只有 Web 端登录用户可绑定并进入当前页面。'
        : '只有小程序端登录用户可绑定并进入当前页面。',
  };
}

function decorateBetaCodeForChannel(
  code: AppPageBetaCodeItem,
  channel: AppChannel
): DecoratedBetaCode {
  const expiresDateText = extractDateText(code.expiresAt);
  const scopeMeta = resolveBetaScopeMeta(code.channel, channel);

  if (!code.isActive) {
    return {
      ...code,
      ...scopeMeta,
      lifecycleKey: 'destroyed',
      lifecycleLabel: '已销毁',
      lifecycleHint: '已销毁后新用户不能再绑定；重新编辑并保存可恢复使用。',
      lifecycleClassName: 'bg-[#F4E9E2] text-[#8D6E63]',
      isUsable: false,
      expiresDateText,
      editActionText: '恢复并编辑',
    };
  }

  const diffDays = getDateDiffFromToday(expiresDateText);
  if (typeof diffDays === 'number' && diffDays < 0) {
    return {
      ...code,
      ...scopeMeta,
      lifecycleKey: 'expired',
      lifecycleLabel: '已失效',
      lifecycleHint: '内测码已过期，需调整到期日期后才可继续绑定。',
      lifecycleClassName: 'bg-[#FDECEC] text-[#A34C4C]',
      isUsable: false,
      expiresDateText,
      editActionText: '续期并编辑',
    };
  }

  if (typeof diffDays === 'number' && diffDays <= 3) {
    return {
      ...code,
      ...scopeMeta,
      lifecycleKey: 'expiring',
      lifecycleLabel: diffDays === 0 ? '今日到期' : '即将到期',
      lifecycleHint:
        diffDays === 0
          ? '今天到期，建议立即续期。'
          : `还有 ${diffDays} 天到期，建议提前续期。`,
      lifecycleClassName: 'bg-[#FFF6E0] text-[#946200]',
      isUsable: true,
      expiresDateText,
      editActionText: '续期并编辑',
    };
  }

  return {
    ...code,
    ...scopeMeta,
    lifecycleKey: 'usable',
    lifecycleLabel: expiresDateText ? '有效中' : '长期有效',
    lifecycleHint: expiresDateText
      ? `有效期至 ${expiresDateText}`
      : '未设置到期日期，当前长期有效。',
    lifecycleClassName: 'bg-[#E8F5E9] text-[#2E7D32]',
    isUsable: true,
    expiresDateText,
    editActionText: '编辑',
  };
}

function decorateBetaCodesByChannel(codes: AppPageBetaCodeItem[], channel: AppChannel) {
  return filterBetaCodesByChannel(codes, channel).map((item) => decorateBetaCodeForChannel(item, channel));
}

function countUsableBetaCodesByChannel(codes: AppPageBetaCodeItem[], channel: AppChannel) {
  return decorateBetaCodesByChannel(codes, channel).filter((item) => item.isUsable).length;
}

function summarizeDecoratedBetaCodes(codes: DecoratedBetaCode[]): DecoratedBetaCodeSummary {
  return codes.reduce<DecoratedBetaCodeSummary>(
    (summary, item) => {
      summary.total += 1;
      if (item.isUsable) summary.usable += 1;
      if (item.lifecycleKey === 'expiring') summary.expiring += 1;
      if (item.lifecycleKey === 'expired') summary.expired += 1;
      if (item.lifecycleKey === 'destroyed') summary.destroyed += 1;
      return summary;
    },
    { total: 0, usable: 0, expiring: 0, expired: 0, destroyed: 0 }
  );
}

function buildBetaDraftHelperText(
  draft: BetaDraft,
  channel: AppChannel,
  codes: DecoratedBetaCode[]
) {
  const currentCode = codes.find((item) => item.id === draft.codeId) || null;
  if (currentCode) {
    if (currentCode.lifecycleKey === 'destroyed') {
      return '当前内测码已销毁，重新保存后可恢复使用。';
    }
    if (currentCode.lifecycleKey === 'expired') {
      return '当前内测码已失效，更新到期日期后可继续使用。';
    }
    return `${currentCode.scopeLabel} · ${currentCode.lifecycleHint}`;
  }

  return channel === 'web' ? '新建后仅 Web 端可使用。' : '新建后仅小程序端可使用。';
}

function buildBetaSaveButtonText(draft: BetaDraft, codes: DecoratedBetaCode[]) {
  const currentCode = codes.find((item) => item.id === draft.codeId) || null;
  if (!currentCode) {
    return '创建内测码';
  }
  if (currentCode.lifecycleKey === 'destroyed') {
    return '恢复并保存';
  }
  if (currentCode.lifecycleKey === 'expired') {
    return '续期并保存';
  }
  return '更新内测码';
}

function getPublishStateMeta(state: PagePublishState) {
  if (state === 'online') {
    return { label: '上线', className: 'bg-[#E8F5E9] text-[#2E7D32]' };
  }

  if (state === 'beta') {
    return { label: '内测', className: 'bg-[#FFF6E0] text-[#946200]' };
  }

  return { label: '下线', className: 'bg-[#FDECEC] text-[#A34C4C]' };
}

function getDisplayStateMeta(item: PageCenterOverviewItem, channel: AppChannel) {
  const currentState = item.channels[channel].publishState;
  if (isSecondaryPageKey(item.pageKey)) {
    if (currentState === 'online') {
      return { label: '显示中', className: 'bg-[#E8F5E9] text-[#2E7D32]' };
    }
    if (currentState === 'beta') {
      return { label: '内测中', className: 'bg-[#FFF6E0] text-[#946200]' };
    }
    return { label: '已隐藏', className: 'bg-[#FDECEC] text-[#A34C4C]' };
  }
  return getPublishStateMeta(currentState);
}

function sortNavRows(rows: PageCenterOverviewItem[], channel: AppChannel) {
  return rows
    .filter((item) => {
      const view = item.channels[channel];
      return (
        !isSecondaryPageKey(item.pageKey) &&
        canPageShowInNav(item, channel) &&
        view.publishState === 'online' &&
        view.showInNav
      );
    })
    .slice()
    .sort((left, right) => {
      const leftView = left.channels[channel];
      const rightView = right.channels[channel];
      if (leftView.navOrder !== rightView.navOrder) {
        return leftView.navOrder - rightView.navOrder;
      }
      return left.pageName.localeCompare(right.pageName, 'zh-CN');
    });
}

function compareSecondaryRows(
  left: PageCenterOverviewItem,
  right: PageCenterOverviewItem,
  channel: AppChannel
) {
  const leftView = left.channels[channel];
  const rightView = right.channels[channel];
  if (leftView.navOrder !== rightView.navOrder) {
    return leftView.navOrder - rightView.navOrder;
  }
  return left.pageName.localeCompare(right.pageName, 'zh-CN');
}

function sortSecondaryRows(rows: PageCenterOverviewItem[], channel: AppChannel) {
  return rows.slice().sort((left, right) => compareSecondaryRows(left, right, channel));
}

function buildSecondaryChildGroups(
  parent: PageCenterOverviewItem,
  children: PageCenterOverviewItem[],
  channel: AppChannel
) {
  const orderedChildren = sortSecondaryRows(children, channel);
  if (parent.pageKey !== 'profile') {
    return orderedChildren.length > 0
      ? [
          {
            key: `${parent.pageKey}:all`,
            title: '',
            description: '',
            rows: orderedChildren,
          },
        ]
      : [];
  }

  const guestRows = orderedChildren.filter((item) =>
    isProfileGuestSecondaryPageForChannel(item.pageKey, channel)
  );
  const authenticatedRows = orderedChildren.filter((item) =>
    isProfileAuthenticatedSecondaryPageKey(item.pageKey)
  );
  const otherRows = orderedChildren.filter(
    (item) =>
      !isProfileGuestSecondaryPageForChannel(item.pageKey, channel) &&
      !isProfileAuthenticatedSecondaryPageKey(item.pageKey)
  );

  return [
    guestRows.length > 0
      ? {
          key: `${parent.pageKey}:guest`,
          title: '认证流程页',
          description: '用于登录前流程，不参与登录后“我的”菜单排序。',
          rows: guestRows,
        }
      : null,
    authenticatedRows.length > 0
      ? {
          key: `${parent.pageKey}:authenticated`,
          title: '登录后菜单',
          description: '这里的入口会出现在登录后的“我的”页内，并支持单独调整展示顺序。',
          rows: authenticatedRows,
        }
      : null,
    otherRows.length > 0
      ? {
          key: `${parent.pageKey}:other`,
          title: '其他二级页',
          description: '当前仍属于该一级页的二级页面。',
          rows: otherRows,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; title: string; description: string; rows: PageCenterOverviewItem[] }>;
}

function sortProfileAuthenticatedSecondaryRows(rows: PageCenterOverviewItem[], channel: AppChannel) {
  return rows
    .filter(
      (item) =>
        resolveSecondaryParentPageKey(item.pageKey) === 'profile' &&
        isProfileAuthenticatedSecondaryPageKey(item.pageKey) &&
        item.channels[channel].publishState === 'online'
    )
    .slice()
    .sort((left, right) => compareSecondaryRows(left, right, channel));
}

function buildDisplayedNavRows(rows: PageCenterOverviewItem[], channel: AppChannel) {
  return sortNavRows(rows, channel);
}

function resolveDisplayedNavLabel(item: PageCenterOverviewItem, channel: AppChannel) {
  const view = item.channels[channel];
  return String(view.navText || '').trim() || item.defaultTabText || item.pageName;
}

function buildPreviewRows(
  rows: PageCenterOverviewItem[],
  channel: AppChannel,
  forms: Record<string, RuleForm>
): PageCenterOverviewItem[] {
  return rows
    .filter((item) => !shouldHidePageForChannel(item.pageKey, channel))
    .map((item) => {
      const key = `${item.pageKey}:${channel}`;
      const nextView = {
        ...item.channels[channel],
        ...normalizeRuleForm(item, channel, forms[key] || buildRuleFormMap([item])[key]),
      };
      return {
        ...item,
        channels: {
          ...item.channels,
          [channel]: nextView,
        },
      };
    });
}

function normalizeRuleForm(
  item: PageCenterOverviewItem,
  channel: AppChannel,
  current: RuleForm
): RuleForm {
  const publishState = current.publishState;
  const navSupported = canPageShowInNav(item, channel);
  const isSecondaryPage = isSecondaryPageKey(item.pageKey);
  const showInNav = publishState === 'online' && navSupported;
  const resolvedNavOrder = Number(current.navOrder);
  const isMiniProgramProfilePrimaryPage =
    channel === 'miniprogram' && item.pageKey === 'profile' && !isSecondaryPage;
  const navText = isMiniProgramProfilePrimaryPage
    ? '我的'
    : String(current.navText || '').trim() || item.defaultTabText || item.pageName;
  const guestNavText = isSecondaryPage
    ? navText
    : isMiniProgramProfilePrimaryPage
      ? '我的'
    : String(current.guestNavText || '').trim() ||
      item.defaultGuestTabText ||
      navText ||
      item.defaultTabText ||
      item.pageName;

  return {
    publishState,
    showInNav,
    navOrder: Number.isFinite(resolvedNavOrder) ? resolvedNavOrder : 0,
    navText,
    guestNavText,
    headerTitle: isSecondaryPage ? navText : String(current.headerTitle || '').trim(),
    headerSubtitle: String(current.headerSubtitle || '').trim(),
    isHomeEntry: false,
    notes: String(current.notes || '').trim(),
  };
}

function resolveMiniProgramForcedState(
  pageKey: string,
  channel: AppChannel
): PagePublishState | null {
  void pageKey;
  void channel;
  return null;
}

function isMiniProgramForcedHomeEntry(pageKey: string, channel: AppChannel) {
  void pageKey;
  void channel;
  return false;
}

function buildMiniProgramForcedStateHint(forcedState: PagePublishState | null) {
  void forcedState;
  return '';
}

function sanitizePageCenterUiMessage(message: string, fallback = '操作失败，请重试') {
  const text = String(message || '').trim();
  if (!text) {
    return fallback;
  }

  return text;
}

function buildQuickStateSuccessToast(
  pageName: string,
  channel: AppChannel,
  state: PagePublishState,
  isSecondaryPage = false
) {
  if (isSecondaryPage) {
    if (state === 'online') {
      return `${pageName} 入口已显示，页面顶部标题会同步更新`;
    }
    if (state === 'beta') {
      return `${pageName} 已切换为内测`;
    }
    return `${pageName} 入口已隐藏，所属一级页中不再展示`;
  }

  if (state === 'online') {
    return `${pageName} 已上线并进入${channel === 'web' ? 'Web' : '小程序'}底部菜单`;
  }
  if (state === 'beta') {
    return `${pageName} 已切换为内测，需登录并绑定内测码后从无底栏入口进入`;
  }
  return `${pageName} 已下线，普通用户无法访问`;
}

function resolveQuickStateAction(
  item: PageCenterOverviewItem,
  channel: AppChannel
) {
  const view = item.channels[channel];
  const isSecondaryPage = isSecondaryPageKey(item.pageKey);
  const forcedState = resolveMiniProgramForcedState(item.pageKey, channel);
  const betaSummary = summarizeDecoratedBetaCodes(decorateBetaCodesByChannel(item.betaCodes, channel));
  const canOnline = canPageShowInNav(item, channel) && (!forcedState || forcedState === 'online');
  const canBeta = item.supportsBeta && betaSummary.usable > 0 && (!forcedState || forcedState === 'beta');
  const canOffline = !forcedState || forcedState === 'offline';

  const createMeta = (
    state: PagePublishState,
    disabled: boolean,
    requiresConfirm: boolean
  ) => ({
    state,
    disabled,
    requiresConfirm,
    label: state === 'online' ? '上线' : state === 'beta' ? '内测' : '下线',
    loadingLabel: state === 'online' ? '上线中...' : state === 'beta' ? '切换中...' : '下线中...',
    className:
      state === 'online'
        ? PAGE_CENTER_ACTION_ONLINE_CLASS
        : state === 'beta'
          ? PAGE_CENTER_ACTION_BETA_CLASS
          : PAGE_CENTER_ACTION_OFFLINE_CLASS,
  });

  if (isSecondaryPage) {
    return view.publishState === 'online'
      ? {
          state: 'offline' as PagePublishState,
          disabled: !canOffline,
          requiresConfirm: true,
          label: '隐藏',
          loadingLabel: '隐藏中...',
          className: PAGE_CENTER_ACTION_OFFLINE_CLASS,
        }
      : {
          state: 'online' as PagePublishState,
          disabled: Boolean(forcedState && forcedState !== 'online'),
          requiresConfirm: false,
          label: '显示',
          loadingLabel: '显示中...',
          className: PAGE_CENTER_ACTION_ONLINE_CLASS,
        };
  }

  if (view.publishState === 'offline') {
    if (canOnline) {
      return createMeta('online', false, false);
    }
    if (canBeta) {
      return createMeta('beta', false, false);
    }
    if (item.supportsBeta && (!forcedState || forcedState === 'beta')) {
      return createMeta('beta', true, false);
    }
    return createMeta('online', true, false);
  }

  if (view.publishState === 'beta') {
    if (canOnline) {
      return createMeta('online', false, false);
    }
    return createMeta('offline', !canOffline, true);
  }

  return createMeta('offline', !canOffline, true);
}

export default function PageManagementWorkspace({ channel }: PageManagementWorkspaceProps) {
  const channelMeta = CHANNEL_META[channel];
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [toast, setToast] = useState('');
  const [rows, setRows] = useState<PageCenterOverviewItem[]>([]);
  const [forms, setForms] = useState<Record<string, RuleForm>>({});
  const [registryDrafts, setRegistryDrafts] = useState<Record<string, RegistryDraft>>({});
  const [betaDrafts, setBetaDrafts] = useState<Record<string, BetaDraft>>({});
  const [expandedPageKey, setExpandedPageKey] = useState('');
  const [createDraftExpanded, setCreateDraftExpanded] = useState(false);
  const [createRegistryDraft, setCreateRegistryDraft] = useState<RegistryDraft>(createEmptyRegistryDraft());
  const [keyword, setKeyword] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [actionModal, setActionModal] = useState<ActionModalState>(null);
  const betaEditorSectionRef = useRef<HTMLElement | null>(null);
  const betaNameInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (message: string) => {
    setToast(String(message || '').trim());
  };

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(''), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const loadOverview = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/page-center/overview', { cache: 'no-store' });
      const payload = (await response.json()) as {
        data?: PageCenterOverviewItem[];
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error || '读取页面管理数据失败');
      }
      const nextRows = Array.isArray(payload.data) ? payload.data : [];
      setRows(nextRows);
      setForms(buildRuleFormMap(nextRows));
      setRegistryDrafts(buildRegistryDraftMap(nextRows));
      setBetaDrafts((current) => {
        const next: Record<string, BetaDraft> = {};
        nextRows.forEach((item) => {
          next[item.pageKey] = current[item.pageKey] || createEmptyBetaDraft(channel);
        });
        return next;
      });
    } catch (error) {
      showToast(sanitizePageCenterUiMessage(error instanceof Error ? error.message : '读取页面管理数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
  }, [channel]);

  const previewRows = useMemo(() => buildPreviewRows(rows, channel, forms), [channel, forms, rows]);

  const navRows = useMemo(() => buildDisplayedNavRows(previewRows, channel), [previewRows, channel]);
  const profileAuthenticatedSecondaryRows = useMemo(
    () => sortProfileAuthenticatedSecondaryRows(previewRows, channel),
    [previewRows, channel]
  );

  const savedRowMap = useMemo(() => new Map(previewRows.map((item) => [item.pageKey, item])), [previewRows]);
  const modalRow = useMemo(() => {
    if (!actionModal) {
      return null;
    }

    return (
      previewRows.find((item) => item.pageKey === actionModal.pageKey) ||
      savedRowMap.get(actionModal.pageKey) ||
      null
    );
  }, [actionModal, previewRows, savedRowMap]);
  const modalForm = useMemo(() => (modalRow ? getForm(modalRow) : null), [modalRow, forms]);

  const modalBetaDraft = useMemo(
    () => (modalRow ? betaDrafts[modalRow.pageKey] || createEmptyBetaDraft(channel) : null),
    [betaDrafts, channel, modalRow]
  );
  const modalBetaCodes = useMemo(
    () => (modalRow ? decorateBetaCodesByChannel(modalRow.betaCodes, channel) : []),
    [channel, modalRow]
  );
  const modalForcedState = useMemo(
    () => (modalRow ? resolveMiniProgramForcedState(modalRow.pageKey, channel) : null),
    [channel, modalRow]
  );

  const openActionModal = (pageKey: string, mode: NonNullable<ActionModalState>['mode']) => {
    setActionModal({ pageKey, mode });
  };

  const closeActionModal = () => {
    setActionModal(null);
  };


  const filteredRows = useMemo(() => {
    const keywordText = keyword.trim().toLowerCase();
    const displayOrderMap = new Map(navRows.map((item, index) => [item.pageKey, index]));
    const fallbackOrderMap = new Map(previewRows.map((item, index) => [item.pageKey, index]));
    return previewRows
      .slice()
      .sort((left, right) => {
        const leftDisplayOrder = displayOrderMap.has(left.pageKey)
          ? Number(displayOrderMap.get(left.pageKey))
          : 1000 + Number(fallbackOrderMap.get(left.pageKey) ?? 0);
        const rightDisplayOrder = displayOrderMap.has(right.pageKey)
          ? Number(displayOrderMap.get(right.pageKey))
          : 1000 + Number(fallbackOrderMap.get(right.pageKey) ?? 0);
        if (leftDisplayOrder !== rightDisplayOrder) {
          return leftDisplayOrder - rightDisplayOrder;
        }
        if (left.isBuiltIn !== right.isBuiltIn) {
          return left.isBuiltIn ? -1 : 1;
        }
        return left.pageName.localeCompare(right.pageName, 'zh-CN');
      })
      .filter((item) => {
        const view = item.channels[channel];
        if (stateFilter !== 'all' && view.publishState !== stateFilter) {
          return false;
        }

        if (!keywordText) {
          return true;
        }

        const haystacks = [
          item.pageKey,
          item.pageName,
          item.pageDescription,
          item.routePathWeb,
          item.routePathMiniProgram,
          view.routePath,
          view.previewRoutePath,
        ];
        return haystacks.some((value) => String(value || '').toLowerCase().includes(keywordText));
      });
  }, [channel, keyword, navRows, previewRows, stateFilter]);

  const hasActiveFilter = Boolean(keyword.trim()) || stateFilter !== 'all';
  const visibleRowKeys = useMemo(() => new Set(filteredRows.map((item) => item.pageKey)), [filteredRows]);
  const secondaryRowsByParent = useMemo(() => {
    const nextMap = new Map<string, PageCenterOverviewItem[]>();
    filteredRows.forEach((item) => {
      const parentPageKey = resolveSecondaryParentPageKey(item.pageKey);
      if (!parentPageKey) {
        return;
      }

      const currentRows = nextMap.get(parentPageKey) || [];
      currentRows.push(item);
      nextMap.set(parentPageKey, currentRows);
    });
    nextMap.forEach((items, parentPageKey) => {
      nextMap.set(parentPageKey, sortSecondaryRows(items, channel));
    });
    return nextMap;
  }, [channel, filteredRows]);
  const collectionGroups = useMemo(
    () =>
      previewRows
        .filter((item) => !isSecondaryPageKey(item.pageKey))
        .filter((item) => visibleRowKeys.has(item.pageKey) || (secondaryRowsByParent.get(item.pageKey)?.length ?? 0) > 0)
        .map((item) => {
          const children = secondaryRowsByParent.get(item.pageKey) || [];
          const isExpanded = children.length > 0 && (expandedPageKey === item.pageKey || hasActiveFilter);
          return {
            parent: item,
            children,
            childGroups: buildSecondaryChildGroups(item, children, channel),
            isExpanded,
          };
        }),
    [channel, expandedPageKey, hasActiveFilter, previewRows, secondaryRowsByParent, visibleRowKeys]
  );
  const pageSections = useMemo(
    () =>
      collectionGroups.length > 0
        ? [
            {
              key: 'collection',
              title: '页面集合',
              description: getCollectionSectionDescription(channel, channelMeta.shortTitle),
              groups: collectionGroups,
            },
          ]
        : [],
    [channel, channelMeta.shortTitle, collectionGroups]
  );

  const workspaceSummary = useMemo(
    () =>
      previewRows.reduce(
        (stats, item) => {
          const view = item.channels[channel];
          stats.total += 1;
          if (view.publishState === 'online') stats.online += 1;
          if (view.publishState === 'beta') stats.beta += 1;
          if (view.publishState === 'offline') stats.offline += 1;
          if (view.publishState === 'online' && view.showInNav) stats.nav += 1;
          stats.betaCodes += countUsableBetaCodesByChannel(item.betaCodes, channel);
          return stats;
        },
        { total: 0, online: 0, beta: 0, offline: 0, nav: 0, betaCodes: 0 }
      ),
    [channel, previewRows]
  );


  const onboardingSteps = useMemo(
    () => [
      {
        title: '先看范围',
        description: `先确认这里只影响${channelMeta.shortTitle}端，避免误以为会同步改动另一端页面。`,
      },
      {
        title: '再选状态',
        description: '优先在卡片顶部使用“内测 / 上线 / 下线 / 查看”，先决定页面当前对用户是否可见。',
      },
      {
        title: '编排入口',
        description: `上线后的页面会进入${channelMeta.navName}；菜单名称可改，顺序第 1 项自动作为首页。`,
      },
      {
        title: '补充细节',
        description: '展开详情后再维护大标题、小标题、内测码、查看路由与当前端专属配置。',
      },
    ],
    [channelMeta.navName, channelMeta.shortTitle]
  );

  const overviewCards = useMemo(
    () => [
      {
        label: '已登记页面',
        value: workspaceSummary.total,
        note: `${channelMeta.shortTitle}端当前可见总数`,
        className: 'bg-white/85 text-[#5D4037]',
      },
      {
        label: '上线中',
        value: workspaceSummary.online,
        note: '普通用户当前可访问',
        className: 'bg-[#E8F5E9] text-[#2E7D32]',
      },
      {
        label: '内测中',
        value: workspaceSummary.beta,
        note: '需要登录 + 内测码',
        className: 'bg-[#FFF6E0] text-[#946200]',
      },
      {
        label: '已下线',
        value: workspaceSummary.offline,
        note: '普通用户不可访问',
        className: 'bg-[#FDECEC] text-[#A34C4C]',
      },
      {
        label: '底栏已占用',
        value: `${workspaceSummary.nav}/5`,
        note: `${channelMeta.navName}容量`,
        className: 'bg-[#FFF8EA] text-[#5D4037]',
      },
      {
        label: '可用内测码',
        value: workspaceSummary.betaCodes,
        note: '当前端仍可绑定进入',
        className: 'bg-white/85 text-[#5D4037]',
      },
    ],
    [channelMeta.navName, channelMeta.shortTitle, workspaceSummary]
  );

  function getForm(item: PageCenterOverviewItem) {
    return forms[`${item.pageKey}:${channel}`] || normalizeRuleForm(item, channel, buildRuleFormMap([item])[`${item.pageKey}:${channel}`]);
  }

  const readFormFromState = (state: Record<string, RuleForm>, item: PageCenterOverviewItem) => {
    const key = `${item.pageKey}:${channel}`;
    return normalizeRuleForm(item, channel, state[key] || buildRuleFormMap([item])[key]);
  };

  const updateForm = (pageKey: string, patch: Partial<RuleForm>) => {
    const targetItem = rows.find((item) => item.pageKey === pageKey);
    if (!targetItem) return;

    setForms((current) => {
      const next = { ...current };
      const targetKey = `${pageKey}:${channel}`;
      const merged = {
        ...readFormFromState(current, targetItem),
        ...patch,
      };

      const normalizedTarget = normalizeRuleForm(targetItem, channel, merged);
      next[targetKey] = normalizedTarget;

      return next;
    });
  };

  const requestSaveRule = async (item: PageCenterOverviewItem, form: RuleForm) => {
    const nextForm = normalizeRuleForm(item, channel, form);
    const response = await fetch('/api/admin/page-center/pages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pageKey: item.pageKey,
        channel,
        publishState: nextForm.publishState,
        showInNav: nextForm.showInNav,
        navOrder: nextForm.navOrder,
        navText: nextForm.navText,
        guestNavText: nextForm.guestNavText,
        headerTitle: nextForm.headerTitle,
        headerSubtitle: nextForm.headerSubtitle,
        notes: nextForm.notes,
      }),
    });
    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      throw new Error(payload.error || '保存页面规则失败');
    }
  };

  const saveRule = async (
    pageKey: string,
    overrides?: Partial<RuleForm>,
    actionKey?: string,
    successText?: string,
    preserveDraftKeys: Array<keyof RuleForm> = []
  ) => {
    const item = rows.find((row) => row.pageKey === pageKey);
    if (!item) return false;
    const currentForm = getForm(item);
    const nextForm = normalizeRuleForm(item, channel, { ...currentForm, ...overrides });
    const forcedState = resolveMiniProgramForcedState(pageKey, channel);
    if (forcedState && nextForm.publishState !== forcedState) {
      showToast(sanitizePageCenterUiMessage(buildMiniProgramForcedStateHint(forcedState)));
      return false;
    }
    const savingLabel = actionKey || `${pageKey}:${channel}:rule`;
    const formKey = `${pageKey}:${channel}`;
    const preservedDraft: Partial<RuleForm> = {};
    preserveDraftKeys.forEach((key) => {
      (preservedDraft as Record<keyof RuleForm, RuleForm[keyof RuleForm]>)[key] = currentForm[key];
    });
    setSavingKey(savingLabel);
    try {
      await requestSaveRule(item, nextForm);
      await loadOverview();
      if (preserveDraftKeys.length > 0) {
        setForms((current) => {
          const savedForm = current[formKey];
          if (!savedForm) {
            return current;
          }
          return {
            ...current,
            [formKey]: {
              ...savedForm,
              ...preservedDraft,
            },
          };
        });
      }
      showToast(successText || `${item.pageName} 的${channelMeta.shortTitle}规则已保存`);
      return true;
    } catch (error) {
      showToast(sanitizePageCenterUiMessage(error instanceof Error ? error.message : '保存页面规则失败'));
      return false;
    } finally {
      setSavingKey('');
    }
  };
  const handleQuickStateAction = async (item: PageCenterOverviewItem, nextState: PagePublishState) => {
    const forcedState = resolveMiniProgramForcedState(item.pageKey, channel);
    const isSecondaryPage = isSecondaryPageKey(item.pageKey);
    if (forcedState && nextState !== forcedState) {
      showToast(sanitizePageCenterUiMessage(buildMiniProgramForcedStateHint(forcedState)));
      return false;
    }

    if (nextState === 'beta' && !item.supportsBeta) {
      showToast('当前页面未开启内测能力，请先在页面注册信息中开启“支持内测”');
      return false;
    }

    if (nextState === 'beta') {
      const usableBetaCount = summarizeDecoratedBetaCodes(decorateBetaCodesByChannel(item.betaCodes, channel)).usable;
      if (usableBetaCount < 1) {
        showToast('请先创建至少一个当前端可用的内测码，再切换为内测');
        return false;
      }
    }

    if (nextState === 'online' && !canPageShowInNav(item, channel) && !isSecondaryPage) {
      showToast(`当前页面未标记为${channel === 'web' ? 'Web' : '小程序'}底栏候选，无法直接上线到底栏`);
      return false;
    }

    const nextForm = getForm(item);
    if (nextState === 'online') {
      return saveRule(
        item.pageKey,
        {
          ...nextForm,
          publishState: 'online',
        },
        `${item.pageKey}:${channel}:state:online`,
        buildQuickStateSuccessToast(item.pageName, channel, 'online', isSecondaryPage)
      );
    }

    return saveRule(
      item.pageKey,
      {
        ...nextForm,
        publishState: nextState,
        showInNav: false,
        isHomeEntry: false,
      },
      `${item.pageKey}:${channel}:state:${nextState}`,
      buildQuickStateSuccessToast(item.pageName, channel, nextState, isSecondaryPage)
    );
  };

  const moveNavOrder = async (
    pageKey: string,
    direction: 'up' | 'down',
    orderedRows: PageCenterOverviewItem[] = navRows,
    options?: {
      savingKeyPrefix?: string;
      successText?: string;
      errorText?: string;
      enforceHomeConstraint?: boolean;
    }
  ) => {
    const currentIndex = orderedRows.findIndex((item) => item.pageKey === pageKey);
    if (currentIndex < 0) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= orderedRows.length) return;

    const currentItem = orderedRows[currentIndex];
    const targetItem = orderedRows[targetIndex];
    if (
      (options?.enforceHomeConstraint ?? true) &&
      (isMiniProgramForcedHomeEntry(currentItem.pageKey, channel) ||
        isMiniProgramForcedHomeEntry(targetItem.pageKey, channel))
    ) {
      showToast('当前页面菜单顺序暂不可调整。');
      return;
    }
    const currentForm = normalizeRuleForm(currentItem, channel, getForm(currentItem));
    const targetForm = normalizeRuleForm(targetItem, channel, getForm(targetItem));

    setSavingKey(`${pageKey}:${channel}:${options?.savingKeyPrefix || 'move'}:${direction}`);
    try {
      await requestSaveRule(currentItem, { ...currentForm, navOrder: targetForm.navOrder });
      await requestSaveRule(targetItem, { ...targetForm, navOrder: currentForm.navOrder });
      await loadOverview();
      showToast(options?.successText || `${currentItem.pageName} 的菜单顺序已调整`);
    } catch (error) {
      showToast(
        sanitizePageCenterUiMessage(
          error instanceof Error ? error.message : options?.errorText || '调整菜单顺序失败'
        )
      );
    } finally {
      setSavingKey('');
    }
  };

  const viewPage = async (item: PageCenterOverviewItem) => {
    if (!item.supportsPreview) {
      showToast('当前页面未开启查看能力，请先在页面注册信息中开启“支持查看”');
      return;
    }

    const view = item.channels[channel];
    const previewRoute = String(view.previewRoutePath || '').trim();
    if (!previewRoute) {
      showToast('当前页面缺少查看路由');
      return;
    }

    const actionKey = `${item.pageKey}:${channel}:view`;
    setSavingKey(actionKey);
    try {
      if (channel === 'web') {
        const nextWindow = window.open(previewRoute, '_blank', 'noopener,noreferrer');
        if (!nextWindow) {
          window.location.assign(previewRoute);
        }
        showToast(`已打开 ${item.pageName} 的 Web 查看窗口`);
        return;
      }

      const response = await fetch('/api/admin/page-center/miniprogram-scheme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routePath: previewRoute }),
      });
      const payload = (await response.json()) as { openlink?: string; error?: string };
      if (!response.ok || !payload.openlink) {
        throw new Error(payload.error || '生成小程序查看链接失败');
      }

      try {
        await navigator.clipboard.writeText(payload.openlink);
      } catch {
        // ignore clipboard errors
      }
      window.open(payload.openlink, '_blank', 'noopener,noreferrer');
      showToast(`已生成 ${item.pageName} 的小程序查看链接`);
    } catch (error) {
      showToast(sanitizePageCenterUiMessage(error instanceof Error ? error.message : '生成查看链接失败'));
    } finally {
      setSavingKey('');
    }
  };

  const updateExistingRegistryDraft = (
    pageKey: string,
    updater: (draft: RegistryDraft, item: PageCenterOverviewItem) => RegistryDraft
  ) => {
    const item = rows.find((row) => row.pageKey === pageKey);
    if (!item) return;
    setRegistryDrafts((current) => ({
      ...current,
      [pageKey]: updater(current[pageKey] || createRegistryDraftFromPage(item), item),
    }));
  };

  const updateCreateRegistryText = (field: RegistryTextField, value: string) => {
    setCreateRegistryDraft((current) => ({ ...current, [field]: value }));
  };

  const updateCreateRegistryBoolean = (field: RegistryBooleanField, value: boolean) => {
    setCreateRegistryDraft((current) => ({ ...current, [field]: value }));
  };

  const updateCreateRegistryOption = (field: RegistryOptionField, value: string) => {
    setCreateRegistryDraft((current) => ({
      ...current,
      ...buildRegistryOptionPatch(current, field, value),
    }));
  };

  const saveRegistry = async (pageKey?: string) => {
    const isCreateMode = !pageKey;
    const item = pageKey ? rows.find((row) => row.pageKey === pageKey) : null;
    const draft = isCreateMode
      ? createRegistryDraft
      : item
        ? registryDrafts[pageKey] || createRegistryDraftFromPage(item)
        : null;

    if (!draft) return;

    const payload = buildRegistryPayload(draft);
    const validationMessage = validateRegistryDraft(payload, channel);
    if (validationMessage) {
      if (isCreateMode) {
        setCreateDraftExpanded(true);
      }
      showToast(validationMessage);
      return;
    }

    const actionKey = isCreateMode ? 'registry:create' : `${pageKey}:registry`;
    setSavingKey(actionKey);
    try {
      const response = await fetch('/api/admin/page-center/registry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, scopeChannel: channel }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(result.error || '保存页面注册信息失败');
      }

      if (isCreateMode) {
        setCreateRegistryDraft(createEmptyRegistryDraft());
        setCreateDraftExpanded(false);
      }
      await loadOverview();
      showToast(isCreateMode ? '新页面已注册成功' : '页面注册信息已保存');
    } catch (error) {
      showToast(sanitizePageCenterUiMessage(error instanceof Error ? error.message : '保存页面注册信息失败'));
    } finally {
      setSavingKey('');
    }
  };

  const resetExistingRegistryDraft = (pageKey: string) => {
    const item = rows.find((row) => row.pageKey === pageKey);
    if (!item) return;
    setRegistryDrafts((current) => ({
      ...current,
      [pageKey]: createRegistryDraftFromPage(item),
    }));
  };

  const updateBetaDraft = (pageKey: string, patch: Partial<BetaDraft>) => {
    setBetaDrafts((current) => ({
      ...current,
      [pageKey]: {
        ...(current[pageKey] || createEmptyBetaDraft(channel)),
        ...patch,
      },
    }));
  };

  const editBetaCode = (pageKey: string, code: DecoratedBetaCode) => {
    updateBetaDraft(pageKey, {
      codeId: code.id,
      betaName: code.betaName,
      betaCode: code.betaCode,
      expiresAt: extractDateText(code.expiresAt),
      channel: code.channel,
    });
    showToast(
      code.lifecycleKey === 'destroyed'
        ? '已载入已销毁内测码，重新保存后会恢复使用。'
        : code.lifecycleKey === 'expired'
          ? '已载入已失效内测码，调整到期日期后可继续使用。'
          : '已载入内测码，可直接修改并保存。'
    );
    window.requestAnimationFrame(() => {
      betaEditorSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => {
        betaNameInputRef.current?.focus();
        betaNameInputRef.current?.select();
      });
    });
  };

  const saveBetaCode = async (pageKey: string) => {
    const item = rows.find((row) => row.pageKey === pageKey);
    if (!item) return;
    if (!item.supportsBeta) {
      showToast('当前页面未开启内测能力');
      return;
    }

    const draft = betaDrafts[pageKey] || createEmptyBetaDraft(channel);
    if (!String(draft.betaName || '').trim()) {
      showToast('请先填写内测码名称');
      return;
    }

    const actionKey = `${pageKey}:beta:${draft.codeId || 'create'}`;
    setSavingKey(actionKey);
    try {
      const response = await fetch('/api/admin/page-center/beta-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pageKey,
          codeId: draft.codeId,
          betaName: draft.betaName,
          betaCode: draft.betaCode,
          expiresAt: draft.expiresAt,
          channel: draft.channel,
        }),
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || '保存内测码失败');
      }

      updateBetaDraft(pageKey, createEmptyBetaDraft(channel));
      await loadOverview();
      showToast(payload.message || '内测码已保存');
    } catch (error) {
      showToast(sanitizePageCenterUiMessage(error instanceof Error ? error.message : '保存内测码失败'));
    } finally {
      setSavingKey('');
    }
  };

  const destroyBetaCode = async (codeId: string) => {
    setSavingKey(`beta:destroy:${codeId}`);
    try {
      const response = await fetch(`/api/admin/page-center/beta-codes/${encodeURIComponent(codeId)}`, {
        method: 'DELETE',
      });
      const payload = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(payload.error || '删除内测码失败');
      }

      await loadOverview();
      showToast(payload.message || '内测码已删除');
    } catch (error) {
      showToast(sanitizePageCenterUiMessage(error instanceof Error ? error.message : '删除内测码失败'));
    } finally {
      setSavingKey('');
    }
  };

  const confirmDestroyBetaCode = async (codeId: string, betaName: string) => {
    const targetName = String(betaName || '').trim() || '该内测码';
    const confirmed = window.confirm(`确认删除“${targetName}”？\n\n删除后该内测码将立即失效，且无法继续使用。`);
    if (!confirmed) {
      return;
    }
    await destroyBetaCode(codeId);
  };

  const toggleCollectionGroup = (pageKey: string) => {
    setExpandedPageKey((current) => (current === pageKey ? '' : pageKey));
  };

  return (
    <div className="admin-mobile-page page-center-page space-y-6 pt-6">
      <div className="module-intro">
        <h1 className="module-title">{channelMeta.title}</h1>
        <p className="module-desc">{channelMeta.description}</p>
      </div>

      {loading ? (
        <section className="booking-panel">
          <div className="rounded-2xl border border-dashed border-[#5D4037]/14 bg-[#FFFBF7] p-6 text-center text-sm text-[#8D6E63]">
            正在读取页面管理数据...
          </div>
        </section>
      ) : filteredRows.length === 0 ? (
        <section className="booking-panel">
          <div className="rounded-2xl border border-dashed border-[#5D4037]/14 bg-[#FFFBF7] p-6 text-center text-sm text-[#8D6E63]">
            当前没有可管理的页面。
          </div>
        </section>
      ) : (
        <section className="space-y-4">
          {pageSections.map((section) => (
            <div key={section.key} className="space-y-3">
              {section.groups.map((group) => {
                const item = group.parent;
                const view = item.channels[channel];
                const stateMeta = getDisplayStateMeta(item, channel);
                const quickAction = resolveQuickStateAction(item, channel);
                const hasChildren = group.children.length > 0;

                return (
                  <article key={item.pageKey} className="booking-panel page-center-card">
                    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <h2 className="mr-1 text-xl font-bold text-[#5D4037]">{item.pageName}</h2>
                            <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${stateMeta.className}`}>
                              {stateMeta.label}
                            </span>
                            <span className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8D6E63]">
                              {item.pageKey}
                            </span>
                            {item.isBuiltIn ? (
                              <span className="whitespace-nowrap rounded-full bg-[#F4E9E2] px-3 py-1 text-xs font-semibold text-[#8D6E63]">
                                内置页
                              </span>
                            ) : null}
                          </div>
                          {item.pageDescription ? (
                            <p className="text-sm leading-6 text-[#8D6E63]">{item.pageDescription}</p>
                          ) : null}
                        </div>
                      </div>

                      <div className="page-center-card__actions grid w-full grid-cols-3 gap-2 lg:w-[288px] lg:self-start">
                        <button
                          type="button"
                          onClick={() => openActionModal(item.pageKey, 'edit')}
                          className={PAGE_CENTER_ACTION_EDIT_CLASS}
                        >
                          编辑
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (quickAction.requiresConfirm) {
                              openActionModal(item.pageKey, 'offline');
                              return;
                            }
                            void handleQuickStateAction(item, quickAction.state);
                          }}
                          disabled={quickAction.disabled || savingKey === `${item.pageKey}:${channel}:state:${quickAction.state}`}
                          className={quickAction.className}
                        >
                          {savingKey === `${item.pageKey}:${channel}:state:${quickAction.state}`
                            ? quickAction.loadingLabel
                            : quickAction.label}
                        </button>
                        <button
                          type="button"
                          onClick={() => void viewPage(item)}
                          disabled={!item.supportsPreview || !view.previewRoutePath || savingKey === `${item.pageKey}:${channel}:view`}
                          className={PAGE_CENTER_ACTION_VIEW_CLASS}
                        >
                          {savingKey === `${item.pageKey}:${channel}:view` ? '生成中...' : '查看'}
                        </button>
                      </div>
                    </div>

                    {hasChildren ? (
                      <div className="mt-4 rounded-[22px] border border-[#5D4037]/8 bg-[#FFF8F2] p-4">
                        <button
                          type="button"
                          onClick={() => toggleCollectionGroup(item.pageKey)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[#5D4037]">所属二级菜单</div>
                            <p className="mt-1 text-xs leading-5 text-[#8D6E63]">
                              这些入口会展示在「{item.pageName}」页面中，可单独编辑标题、显示或隐藏。
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <span className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#8D6E63]">
                              {group.children.length} 个入口
                            </span>
                            <span className="whitespace-nowrap rounded-full border border-[#5D4037]/12 bg-white px-3 py-1 text-xs font-semibold text-[#5D4037]">
                              {group.isExpanded ? '收起' : '展开'}
                            </span>
                          </div>
                        </button>

                        {group.isExpanded ? (
                          <div className="mt-4 space-y-4 border-t border-[#5D4037]/8 pt-4">
                            {group.childGroups.map((childGroup) => (
                              <div key={childGroup.key} className="space-y-3">
                                {childGroup.title || childGroup.description ? (
                                  <div className="rounded-[18px] border border-[#5D4037]/8 bg-white/80 px-4 py-3">
                                    {childGroup.title ? (
                                      <div className="text-sm font-bold text-[#5D4037]">{childGroup.title}</div>
                                    ) : null}
                                    {childGroup.description ? (
                                      <p className="mt-1 text-xs leading-5 text-[#8D6E63]">
                                        {childGroup.description}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}

                                {childGroup.rows.map((child) => {
                              const childView = child.channels[channel];
                              const childStateMeta = getDisplayStateMeta(child, channel);
                              const childQuickAction = resolveQuickStateAction(child, channel);

                              return (
                                <div
                                  key={child.pageKey}
                                  className="rounded-[20px] border border-[#5D4037]/8 bg-white p-4 shadow-[0_8px_24px_rgba(93,64,55,0.04)]"
                                >
                                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_288px] lg:items-start">
                                    <div className="min-w-0">
                                      <div className="flex flex-col gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <h3 className="mr-1 text-base font-bold text-[#5D4037]">{child.pageName}</h3>
                                          <span className={`whitespace-nowrap rounded-full px-3 py-1 text-xs font-semibold ${childStateMeta.className}`}>
                                            {childStateMeta.label}
                                          </span>
                                        </div>
                                        <p className="text-sm leading-6 text-[#8D6E63]">
                                          {child.pageDescription || `显示后将作为「${item.pageName}」页的入口名称与顶部标题。`}
                                        </p>
                                      </div>
                                    </div>

                                    <div className="grid w-full grid-cols-3 gap-2 lg:w-[288px] lg:self-start">
                                      <button
                                        type="button"
                                        onClick={() => openActionModal(child.pageKey, 'edit')}
                                        className={PAGE_CENTER_ACTION_EDIT_CLASS}
                                      >
                                        编辑
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (childQuickAction.requiresConfirm) {
                                            openActionModal(child.pageKey, 'offline');
                                            return;
                                          }
                                          void handleQuickStateAction(child, childQuickAction.state);
                                        }}
                                        disabled={childQuickAction.disabled || savingKey === `${child.pageKey}:${channel}:state:${childQuickAction.state}`}
                                        className={childQuickAction.className}
                                      >
                                        {savingKey === `${child.pageKey}:${channel}:state:${childQuickAction.state}`
                                          ? childQuickAction.loadingLabel
                                          : childQuickAction.label}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void viewPage(child)}
                                        disabled={!child.supportsPreview || !childView.previewRoutePath || savingKey === `${child.pageKey}:${channel}:view`}
                                        className={PAGE_CENTER_ACTION_VIEW_CLASS}
                                      >
                                        {savingKey === `${child.pageKey}:${channel}:view` ? '生成中...' : '查看'}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              );
                                })}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ))}
        </section>
      )}


      {actionModal && modalRow && modalForm && modalBetaDraft ? (
        <div className="booking-modal-mask" onClick={closeActionModal}>
          <div className="booking-modal booking-modal--form page-center-modal max-w-4xl" onClick={(event) => event.stopPropagation()}>
            <div className="booking-modal__head">
              <div className="min-w-0 flex-1">
                <h3 className="booking-modal__title">
                  {actionModal.mode === 'offline'
                    ? `${isSecondaryPageKey(modalRow.pageKey) ? '确认隐藏' : '确认下线'} · ${modalRow.pageName}`
                    : `编辑页面 · ${modalRow.pageName}`}
                </h3>
                {actionModal.mode === 'offline' ? (
                  <p className="mt-1 text-sm text-[#8D6E63]">
                    {isSecondaryPageKey(modalRow.pageKey)
                      ? '隐藏后所属一级页不再展示该入口，普通用户也无法继续访问该页面。'
                      : '下线后普通用户无法访问该页面，管理员仍可通过“查看”无底栏进入。'}
                  </p>
                ) : null}
              </div>
              <button type="button" className="icon-button action-icon-btn action-icon-btn--close" onClick={closeActionModal} aria-label="关闭页面编辑弹窗">
                <X className="action-icon-svg" aria-hidden="true" />
              </button>
            </div>

            <div className="booking-modal__body page-center-modal__body">
              {modalForcedState ? (
                <div className="rounded-2xl border border-[#946200]/16 bg-[#FFF6E0] px-4 py-3 text-sm leading-6 text-[#946200]">
                  {buildMiniProgramForcedStateHint(modalForcedState)}
                </div>
              ) : null}
              {actionModal.mode === 'offline' ? (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-[#A34C4C]/14 bg-[#FDECEC] p-4">
                    <div className="text-base font-bold text-[#A34C4C]">
                      {isSecondaryPageKey(modalRow.pageKey) ? '隐藏影响' : '下线影响'}
                    </div>
                    <ul className="mt-3 space-y-2 text-sm leading-6 text-[#A34C4C]">
                      <li>
                        •
                        {isSecondaryPageKey(modalRow.pageKey)
                          ? ' 所属一级页中不再展示该入口。'
                          : ' 普通用户无法通过正式路由访问该页面。'}
                      </li>
                      <li>
                        •
                        {isSecondaryPageKey(modalRow.pageKey)
                          ? ' 页面顶部标题配置仍会保留，后续重新显示即可继续使用。'
                          : ` 如果页面当前在底栏中，会立即从${channelMeta.navName}移除。`}
                      </li>
                      <li>• 管理员仍可继续在后台调整该页面的显示状态与标题配置。</li>
                    </ul>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[#5D4037]/10 bg-[#FFFBF7] p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8D6E63]">正式路由</div>
                      <div className="mt-2 break-all text-sm font-bold text-[#5D4037]">{modalRow.channels[channel].routePath || '未配置'}</div>
                    </div>
                    <div className="rounded-2xl border border-[#5D4037]/10 bg-[#FFFBF7] p-4">
                      <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8D6E63]">查看路由</div>
                      <div className="mt-2 break-all text-sm font-bold text-[#5D4037]">{modalRow.channels[channel].previewRoutePath || '未配置'}</div>
                    </div>
                  </div>
                  <div className="page-center-modal__offline-actions flex flex-col gap-2 sm:flex-row">
                    <button type="button" onClick={closeActionModal} className="flex-1 rounded-full border-2 border-[#5D4037]/20 px-4 py-2.5 text-sm font-medium text-[#5D4037]">取消</button>
                    <button
                      type="button"
                      onClick={async () => {
                        const success = await handleQuickStateAction(modalRow, 'offline');
                        if (success) {
                          closeActionModal();
                        }
                      }}
                      disabled={savingKey === `${modalRow.pageKey}:${channel}:state:offline`}
                      className="flex-1 rounded-full bg-red-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {savingKey === `${modalRow.pageKey}:${channel}:state:offline`
                        ? isSecondaryPageKey(modalRow.pageKey)
                          ? '隐藏中...'
                          : '下线中...'
                        : isSecondaryPageKey(modalRow.pageKey)
                          ? '确认隐藏'
                          : '确认下线'}
                    </button>
                  </div>
                </div>
              ) : (() => {
                const savedView = savedRowMap.get(modalRow.pageKey)?.channels[channel] || modalRow.channels[channel];
                const isSecondaryPage = isSecondaryPageKey(modalRow.pageKey);
                const isAuthenticatedProfileSecondaryPage =
                  isSecondaryPage && isProfileAuthenticatedSecondaryPageKey(modalRow.pageKey);
                const activeOrderRows = isAuthenticatedProfileSecondaryPage
                  ? profileAuthenticatedSecondaryRows
                  : navRows;
                const currentNavIndex = activeOrderRows.findIndex((item) => item.pageKey === modalRow.pageKey);
                const canMoveUp = currentNavIndex > 0;
                const canMoveDown = currentNavIndex >= 0 && currentNavIndex < activeOrderRows.length - 1;
                const forcedHome =
                  !isSecondaryPage && isMiniProgramForcedHomeEntry(modalRow.pageKey, channel);
                const usableBetaCount = modalBetaCodes.filter((item) => item.isUsable).length;
                const canSwitchToBeta = !Boolean(modalForcedState && modalForcedState !== 'beta') && usableBetaCount > 0;
                const canSwitchToOnline =
                  !Boolean(modalForcedState && modalForcedState !== 'online') &&
                  (isSecondaryPage || canPageShowInNav(modalRow, channel));
                const betaActionLabel = modalRow.channels[channel].publishState === 'beta' ? '保存内测设置' : '切换为内测';
                const onlineActionLabel = isSecondaryPage ? '保存并显示' : '保存';
                const betaSectionDesc = modalRow.channels[channel].publishState === 'beta'
                  ? '维护当前端可用的内测码，并可继续保留内测发布。'
                  : usableBetaCount > 0
                    ? '已满足切换为内测条件，可从当前状态切换为内测。'
                    : '请先创建至少一个当前端可用的内测码，才能切换为内测。';
                const onlineSectionDesc = isSecondaryPage
                  ? modalRow.channels[channel].publishState === 'online'
                    ? '当前入口正在所属一级页中展示，保存后会同步更新页面顶部标题。'
                    : '显示后会出现在所属一级页中，页面顶部标题会与入口名称保持一致。'
                  : canPageShowInNav(modalRow, channel)
                    ? modalRow.channels[channel].publishState === 'online'
                      ? `维护当前${channelMeta.navName}顺序与上线状态。`
                      : `满足上线条件，保存后会进入${channelMeta.navName}。`
                    : '当前页面不是底栏候选，不能直接上线到菜单。';
                const sectionClass = 'page-center-modal__section rounded-[24px] border border-[#5D4037]/8 bg-[#FFFBF7] p-5';
                const sectionTitleClass = 'text-lg font-black text-[#5D4037]';
                const sectionDescClass = 'mt-1 text-sm leading-6 text-[#8D6E63]';
                const isAlbumDetailSecondaryPage = modalRow.pageKey === 'album-detail';
                const secondarySectionTitle = isSecondaryPage
                  ? isAlbumDetailSecondaryPage
                    ? '默认名称'
                    : '页面标题'
                  : '标题设置';
                const secondarySectionDesc = isSecondaryPage
                  ? isAlbumDetailSecondaryPage
                    ? '实际页面顶部优先显示相册名；只有相册未命名时，才会使用这里的默认名称。'
                    : '这个名称会同步用于所属一级页入口和页面顶部标题。'
                  : '大标题如“拾光谣”，小标题如“定格美好瞬间”。';
                const secondaryFieldLabel = isAlbumDetailSecondaryPage
                  ? '默认名称（无相册名时使用）'
                  : '入口名称 / 顶部标题';
                const resolvedOnlineSectionDesc = isAlbumDetailSecondaryPage
                  ? modalRow.channels[channel].publishState === 'online'
                    ? '当前动态详情页已启用。实际页面顶部优先显示相册名；相册未命名时，才回退使用这里的默认名称。'
                    : '显示后允许进入动态详情页。实际页面顶部优先显示相册名；相册未命名时，才回退使用这里的默认名称。'
                  : isAuthenticatedProfileSecondaryPage
                    ? `${onlineSectionDesc} 这里的顺序会同步到登录后的「我的」页菜单。`
                    : onlineSectionDesc;
                return (
                  <div className="space-y-4">
                    <section className={sectionClass}>
                      <div className={sectionTitleClass}>{secondarySectionTitle}</div>
                      <p className={sectionDescClass}>{secondarySectionDesc}</p>
                      {isSecondaryPage ? (
                        <div className="mt-4">
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">{secondaryFieldLabel}</span>
                            <input
                              value={modalForm.navText}
                              onChange={(event) =>
                                updateForm(modalRow.pageKey, {
                                  navText: event.target.value,
                                  guestNavText: event.target.value,
                                  headerTitle: event.target.value,
                                })
                              }
                              placeholder="如：专属返图空间"
                              className="booking-modal__input"
                            />
                          </label>
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">顶部大标题</span>
                            <input value={modalForm.headerTitle} onChange={(event) => updateForm(modalRow.pageKey, { headerTitle: event.target.value })} placeholder="如：拾光谣" className="booking-modal__input" />
                          </label>
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">顶部小标题</span>
                            <input value={modalForm.headerSubtitle} onChange={(event) => updateForm(modalRow.pageKey, { headerSubtitle: event.target.value })} placeholder="如：定格美好瞬间" className="booking-modal__input" />
                          </label>
                        </div>
                      )}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            void saveRule(
                              modalRow.pageKey,
                              isSecondaryPage
                                ? {
                                    ...modalForm,
                                    publishState: modalForm.publishState,
                                  }
                                : {
                                    navText: savedView.navText,
                                    guestNavText: savedView.guestNavText,
                                  },
                              `${modalRow.pageKey}:${channel}:rule:title`,
                              isSecondaryPage
                                ? isAlbumDetailSecondaryPage
                                  ? '默认名称已保存'
                                  : '页面标题已保存'
                                : '标题设置已保存',
                              isSecondaryPage ? [] : ['navText', 'guestNavText']
                            )
                          }
                          disabled={savingKey === `${modalRow.pageKey}:${channel}:rule:title`}
                          className={EDIT_MODAL_SAVE_BUTTON_CLASS}
                        >
                          {savingKey === `${modalRow.pageKey}:${channel}:rule:title`
                            ? '保存中...'
                            : isSecondaryPage
                              ? isAlbumDetailSecondaryPage
                                ? '保存默认名称'
                                : '保存页面标题'
                              : '保存标题设置'}
                        </button>
                      </div>
                    </section>

                    {!isSecondaryPage ? (
                      <section className={sectionClass}>
                        <div className={sectionTitleClass}>菜单设置</div>
                        <p className={sectionDescClass}>只保留当前端真正需要修改的菜单文案。</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">底部菜单名称</span>
                            <input value={modalForm.navText} onChange={(event) => updateForm(modalRow.pageKey, { navText: event.target.value })} placeholder="如：首页" className="booking-modal__input" />
                          </label>
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">未登录菜单名称</span>
                            <input value={modalForm.guestNavText} onChange={(event) => updateForm(modalRow.pageKey, { guestNavText: event.target.value })} placeholder="未登录用户看到的名称" className="booking-modal__input" />
                          </label>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              void saveRule(
                                modalRow.pageKey,
                                {
                                  headerTitle: savedView.headerTitle,
                                  headerSubtitle: savedView.headerSubtitle,
                                },
                                `${modalRow.pageKey}:${channel}:rule:menu`,
                                '菜单设置已保存',
                                ['headerTitle', 'headerSubtitle']
                              )
                            }
                            disabled={savingKey === `${modalRow.pageKey}:${channel}:rule:menu`}
                            className={EDIT_MODAL_SAVE_BUTTON_CLASS}
                          >
                            {savingKey === `${modalRow.pageKey}:${channel}:rule:menu` ? '保存中...' : '保存菜单设置'}
                          </button>
                        </div>
                      </section>
                    ) : null}

                    {modalRow.supportsBeta ? (
                      <section ref={betaEditorSectionRef} className={sectionClass}>
                        <div className="flex flex-col gap-2">
                          <div>
                            <div className={sectionTitleClass}>内测设置</div>
                            <p className={sectionDescClass}>{betaSectionDesc}</p>
                          </div>
                          <span className="w-fit rounded-full bg-[#FFF6E0] px-3 py-1 text-xs font-semibold text-[#946200]">可用 {usableBetaCount} 个</span>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">内测码名称</span>
                            <input ref={betaNameInputRef} value={modalBetaDraft.betaName} onChange={(event) => updateBetaDraft(modalRow.pageKey, { betaName: event.target.value, channel })} placeholder="如：4 月摄影伙伴" className="booking-modal__input" />
                          </label>
                          <label className="booking-modal__field">
                            <span className="booking-modal__label">到期日期</span>
                            <input type="date" value={modalBetaDraft.expiresAt} onChange={(event) => updateBetaDraft(modalRow.pageKey, { expiresAt: event.target.value, channel })} className="booking-modal__input" />
                          </label>
                          <label className="booking-modal__field md:col-span-2">
                            <span className="booking-modal__label">内测码（留空则自动生成）</span>
                            <div className="page-center-modal__beta-code-row">
                              <input value={modalBetaDraft.betaCode} onChange={(event) => updateBetaDraft(modalRow.pageKey, { betaCode: event.target.value, channel })} placeholder="如：SGY2026" className="booking-modal__input page-center-modal__beta-code-input uppercase" />
                              <button type="button" onClick={() => updateBetaDraft(modalRow.pageKey, { betaCode: generateRandomBetaCode(), channel })} className="page-center-modal__beta-generate-btn">随机生成</button>
                            </div>
                          </label>
                        </div>
                        <p className="mt-3 text-sm leading-6 text-[#8D6E63]">{buildBetaDraftHelperText({ ...modalBetaDraft, channel }, channel, modalBetaCodes)}</p>
                        <div className="page-center-modal__beta-actions mt-4">
                          <button type="button" onClick={() => void saveBetaCode(modalRow.pageKey)} disabled={savingKey === `${modalRow.pageKey}:beta:${modalBetaDraft.codeId || 'create'}`} className={BETA_SETTINGS_SAVE_BUTTON_CLASS}>{savingKey === `${modalRow.pageKey}:beta:${modalBetaDraft.codeId || 'create'}` ? '保存中...' : buildBetaSaveButtonText(modalBetaDraft, modalBetaCodes)}</button>
                          <button
                            type="button"
                            onClick={() => void handleQuickStateAction(modalRow, 'beta')}
                            disabled={!canSwitchToBeta || savingKey === `${modalRow.pageKey}:${channel}:state:beta`}
                            className={BETA_SETTINGS_PRIMARY_BUTTON_CLASS}
                          >
                            {savingKey === `${modalRow.pageKey}:${channel}:state:beta`
                              ? '切换中...'
                              : '切换为内测'}
                          </button>
                        </div>
                        <div className="mt-4 space-y-3">
                          {modalBetaCodes.length > 0 ? modalBetaCodes.map((code) => (
                            <div key={code.id} className="rounded-2xl border border-[#5D4037]/10 bg-white p-4">
                              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <div className="text-base font-bold text-[#5D4037]">{code.betaName}</div>
                                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${code.lifecycleClassName}`}>{code.lifecycleLabel}</span>
                                  </div>
                                  <div className="mt-2 text-sm font-semibold tracking-[0.18em] text-[#5D4037]">{code.betaCode}</div>
                                </div>
                                <div className="page-center-modal__beta-item-actions flex w-full flex-wrap gap-2 sm:w-auto sm:flex-nowrap">
                                  <button type="button" onClick={() => editBetaCode(modalRow.pageKey, code)} className="whitespace-nowrap rounded-full border border-[#5D4037]/12 bg-white px-4 py-2 text-sm font-semibold text-[#5D4037]">{code.editActionText}</button>
                                  <button type="button" onClick={() => void confirmDestroyBetaCode(code.id, code.betaName)} disabled={savingKey === `beta:destroy:${code.id}`} className="whitespace-nowrap rounded-full border border-[#D46A6A]/20 bg-[#FDECEC] px-4 py-2 text-sm font-semibold text-[#A34C4C] disabled:opacity-60">{savingKey === `beta:destroy:${code.id}` ? '删除中...' : '删除'}</button>
                                </div>
                              </div>
                            </div>
                          )) : (
                            <p className="text-sm leading-6 text-[#8D6E63]">暂无内测码，先创建一个可用内测码。</p>
                          )}
                        </div>
                      </section>
                    ) : null}

                    <section className={sectionClass}>
                      <div className="page-center-modal__section-head flex flex-col items-start gap-3">
                        <div className="min-w-0">
                          <div className={sectionTitleClass}>{isSecondaryPage ? '显示设置' : '上线设置'}</div>
                          <p className={sectionDescClass}>{resolvedOnlineSectionDesc}</p>
                        </div>
                      </div>
                      {isSecondaryPage ? (
                        <>
                          <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-2xl border border-[#5D4037]/10 bg-white p-4">
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8D6E63]">正式路由</div>
                              <div className="mt-2 break-all text-sm font-bold text-[#5D4037]">
                                {modalRow.channels[channel].routePath || '未配置'}
                              </div>
                            </div>
                            <div className="rounded-2xl border border-[#5D4037]/10 bg-white p-4">
                              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#8D6E63]">查看路由</div>
                              <div className="mt-2 break-all text-sm font-bold text-[#5D4037]">
                                {modalRow.channels[channel].previewRoutePath || '未配置'}
                              </div>
                            </div>
                          </div>
                          {isAuthenticatedProfileSecondaryPage ? (
                            <>
                              <div className="page-center-modal__order-pills mt-4">
                                {activeOrderRows.length > 0 ? activeOrderRows.map((row, index) => (
                                  <span key={row.pageKey} className={`rounded-full px-3 py-2 text-xs font-semibold ${row.pageKey === modalRow.pageKey ? 'border-2 border-[#5D4037] bg-[#FFC857] text-[#5D4037]' : 'border border-[#5D4037]/12 bg-white text-[#8D6E63]'}`}>
                                    {index + 1}. {resolveDisplayedNavLabel(row, channel)}
                                  </span>
                                )) : <span className="text-sm text-[#8D6E63]">当前还没有可排序的登录后入口。</span>}
                              </div>
                              <div className="mt-2 text-xs leading-5 text-[#8D6E63]">
                                {getSecondaryOrderHelperText(channel)}
                              </div>
                            </>
                          ) : null}
                          <div className="page-center-modal__online-actions mt-4">
                            {isAuthenticatedProfileSecondaryPage ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void moveNavOrder(
                                      modalRow.pageKey,
                                      'up',
                                      profileAuthenticatedSecondaryRows,
                                      {
                                        savingKeyPrefix: 'secondary-move',
                                        successText: `${modalRow.pageName} 的登录后菜单顺序已调整`,
                                        errorText: '调整登录后菜单顺序失败',
                                        enforceHomeConstraint: false,
                                      }
                                    )
                                  }
                                  disabled={currentNavIndex < 0 || !canMoveUp || savingKey === `${modalRow.pageKey}:${channel}:secondary-move:up`}
                                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#5D4037]/12 bg-white px-4 py-2 text-sm font-semibold text-[#5D4037] disabled:opacity-60"
                                >
                                  <ArrowUp className="h-4 w-4" />
                                  前移
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void moveNavOrder(
                                      modalRow.pageKey,
                                      'down',
                                      profileAuthenticatedSecondaryRows,
                                      {
                                        savingKeyPrefix: 'secondary-move',
                                        successText: `${modalRow.pageName} 的登录后菜单顺序已调整`,
                                        errorText: '调整登录后菜单顺序失败',
                                        enforceHomeConstraint: false,
                                      }
                                    )
                                  }
                                  disabled={currentNavIndex < 0 || !canMoveDown || savingKey === `${modalRow.pageKey}:${channel}:secondary-move:down`}
                                  className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#5D4037]/12 bg-white px-4 py-2 text-sm font-semibold text-[#5D4037] disabled:opacity-60"
                                >
                                  <ArrowDown className="h-4 w-4" />
                                  后移
                                </button>
                              </>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => void handleQuickStateAction(modalRow, 'online')}
                              disabled={!canSwitchToOnline || savingKey === `${modalRow.pageKey}:${channel}:state:online`}
                              className={PAGE_CENTER_MODAL_ONLINE_BUTTON_CLASS}
                            >
                              {savingKey === `${modalRow.pageKey}:${channel}:state:online`
                                ? '保存中...'
                                : onlineActionLabel}
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="page-center-modal__order-pills mt-4">
                            {activeOrderRows.length > 0 ? activeOrderRows.map((row, index) => (
                              <span key={row.pageKey} className={`rounded-full px-3 py-2 text-xs font-semibold ${row.pageKey === modalRow.pageKey ? 'border-2 border-[#5D4037] bg-[#FFC857] text-[#5D4037]' : 'border border-[#5D4037]/12 bg-white text-[#8D6E63]'}`}>
                                {index + 1}. {resolveDisplayedNavLabel(row, channel)}
                              </span>
                            )) : <span className="text-sm text-[#8D6E63]">当前还没有上线页面。</span>}
                          </div>
                          <div className="page-center-modal__online-actions mt-4">
                            <button type="button" onClick={() => void moveNavOrder(modalRow.pageKey, 'up')} disabled={forcedHome || currentNavIndex < 0 || !canMoveUp || savingKey === `${modalRow.pageKey}:${channel}:move:up`} className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#5D4037]/12 bg-white px-4 py-2 text-sm font-semibold text-[#5D4037] disabled:opacity-60"><ArrowUp className="h-4 w-4" />前移</button>
                            <button type="button" onClick={() => void moveNavOrder(modalRow.pageKey, 'down')} disabled={forcedHome || currentNavIndex < 0 || !canMoveDown || savingKey === `${modalRow.pageKey}:${channel}:move:down`} className="inline-flex items-center gap-2 whitespace-nowrap rounded-full border border-[#5D4037]/12 bg-white px-4 py-2 text-sm font-semibold text-[#5D4037] disabled:opacity-60"><ArrowDown className="h-4 w-4" />后移</button>
                            <button
                              type="button"
                              onClick={() => void handleQuickStateAction(modalRow, 'online')}
                              disabled={!canSwitchToOnline || savingKey === `${modalRow.pageKey}:${channel}:state:online`}
                              className={PAGE_CENTER_MODAL_ONLINE_BUTTON_CLASS}
                            >
                              {savingKey === `${modalRow.pageKey}:${channel}:state:online`
                                ? '保存中...'
                                : onlineActionLabel}
                            </button>
                          </div>
                        </>
                      )}
                    </section>

                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-[calc(100vw-2rem)] rounded-2xl bg-[#5D4037] px-4 py-3 text-center text-sm font-medium text-white shadow-lg sm:inset-x-auto sm:bottom-6 sm:right-6 sm:max-w-sm sm:rounded-full sm:py-2">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
