'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  CalendarDays,
  Clipboard,
  LockKeyhole,
  Sparkles,
} from 'lucide-react';
import MiniProgramRecoveryScreen, { PAGE_LOADING_COPY } from '@/components/MiniProgramRecoveryScreen';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import SecondaryPageShell from '@/components/shell/SecondaryPageShell';
import { createClient } from '@/lib/cloudbase/client';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

interface BetaFeatureRow {
  binding_id: string;
  bound_at: string | null;
  feature_id: string;
  feature_name: string;
  feature_description: string | null;
  feature_code: string;
  expires_at: string | null;
  route_path: string;
  route_title?: string;
  route_description?: string | null;
  route_path_web?: string;
  preview_route_path_web?: string;
}

type MessageTone = 'error' | 'success' | 'info';

function extractDateText(value: string | null | undefined) {
  const matched = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : '';
}

function normalizeBetaCodeInput(value: string) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8);
}

export default function ProfileBetaPage() {
  const router = useRouter();
  const { title: managedTitle } = useManagedPageMeta('profile-beta', '内测功能');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [featureRows, setFeatureRows] = useState<BetaFeatureRow[]>([]);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<MessageTone>('info');

  const orderedRows = useMemo(() => featureRows, [featureRows]);

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }

    router.push('/profile');
  };

  const loadRows = async () => {
    const response = await fetch('/api/page-center/beta/features?channel=web', { cache: 'no-store' });
    const payload = (await response.json()) as { data?: BetaFeatureRow[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error || '读取内测功能失败');
    }
    setFeatureRows(Array.isArray(payload.data) ? payload.data : []);
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const dbClient = createClient();
        const {
          data: { user },
        } = await dbClient.auth.getUser();
        if (cancelled) return;
        const nextLoggedIn = Boolean(user?.id);
        setIsLoggedIn(nextLoggedIn);
        if (nextLoggedIn) {
          await loadRows();
        }
      } catch (error) {
        if (!cancelled) {
          setMessageTone('error');
          setMessage(error instanceof Error ? error.message : '读取账号状态失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBind = async () => {
    const featureCode = normalizeBetaCodeInput(codeInput);
    if (!featureCode) {
      setMessageTone('error');
      setMessage('请输入内测码');
      return;
    }
    if (featureCode.length !== 8) {
      setMessageTone('error');
      setMessage('内测码必须是 8 位大写字母或数字');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const response = await fetch('/api/page-center/beta/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureCode, channel: 'web' }),
      });
      const payload = (await response.json()) as { data?: BetaFeatureRow; error?: string };
      if (!response.ok) {
        throw new Error(payload.error || '绑定内测码失败');
      }

      const targetPath = String(payload.data?.route_path_web || payload.data?.route_path || '').trim();
      setCodeInput('');
      if (targetPath) {
        router.push(targetPath);
        return;
      }

      setMessageTone('success');
      setMessage('内测码绑定成功，已为你开放页面入口');
      await loadRows();
    } catch (error) {
      setMessageTone('error');
      setMessage(error instanceof Error ? error.message : '绑定内测码失败');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasteCode = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
      setMessageTone('error');
      setMessage('当前浏览器暂不支持粘贴，请手动输入');
      return;
    }

    try {
      const text = await navigator.clipboard.readText();
      const normalized = normalizeBetaCodeInput(text);
      if (!normalized) {
        setMessageTone('error');
        setMessage('剪贴板为空');
        return;
      }
      setCodeInput(normalized);
      setMessageTone('info');
      setMessage('已从剪贴板粘贴内测码');
    } catch {
      setMessageTone('error');
      setMessage('粘贴失败，请重试');
    }
  };

  const renderMessage = () => {
    if (!message) {
      return null;
    }

    const toneClassName =
      messageTone === 'error'
        ? 'border-red-200 bg-red-50/90 text-red-600'
        : messageTone === 'success'
          ? 'border-emerald-200 bg-emerald-50/90 text-emerald-600'
          : 'border-[#FFC857]/30 bg-[#FFF7DB] text-[#8D6E63]';

    return (
      <div className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${toneClassName}`}>
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <p className="leading-6">{message}</p>
      </div>
    );
  };

  return (
    <SecondaryPageShell
      title={managedTitle}
      onBack={handleBack}
      align="left"
      className="w-full"
      contentAs={PreviewAwareScrollArea}
      contentClassName="overflow-y-auto px-3 pt-3 sm:px-4 sm:pt-4 lg:px-5 lg:pt-5"
      contentProps={{
        style: {
          backgroundImage:
            'radial-gradient(circle at 6% 0%, rgba(255, 200, 87, 0.15), transparent 38%), radial-gradient(circle at 94% 16%, rgba(255, 153, 102, 0.1), transparent 36%)',
        },
      }}
    >
        <div className="mx-auto w-full max-w-[660px]">
          {loading ? (
            <MiniProgramRecoveryScreen
              title={PAGE_LOADING_COPY.title}
              description={PAGE_LOADING_COPY.description}
              className="min-h-[280px] rounded-[24px] border border-[#5D4037]/10 bg-white/90 px-4 py-7 shadow-[0_10px_24px_rgba(93,64,55,0.08)] sm:rounded-[28px] sm:px-5 sm:py-8"
            />
          ) : !isLoggedIn ? (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 }}
              className="rounded-[24px] border border-[#5D4037]/10 bg-white px-4 py-7 text-center shadow-[0_10px_24px_rgba(93,64,55,0.08)] sm:rounded-[28px] sm:px-5 sm:py-8"
            >
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFC857]/18 sm:h-16 sm:w-16">
                <LockKeyhole className="h-6 w-6 text-[#5D4037] sm:h-7 sm:w-7" />
              </div>
              <h2 className="mt-4 text-[18px] font-bold text-[#5D4037] sm:text-[20px]">请先登录</h2>
              <p className="mt-2 text-[13px] leading-6 text-[#5D4037]/60 sm:text-sm">
                登录后可输入管理员提供的内测码，解锁你的专属内测功能。
              </p>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="mt-5 inline-flex h-10 items-center justify-center rounded-full bg-[linear-gradient(180deg,#FFD86C_0%,#FFC857_100%)] px-6 text-[13px] font-bold text-[#5D4037] shadow-[0_8px_16px_rgba(255,200,87,0.3)] transition hover:translate-y-[-1px] sm:h-11 sm:px-7 sm:text-sm"
              >
                前往登录
              </button>
            </motion.div>
          ) : (
            <div className="flex flex-col gap-3 sm:gap-3.5">
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative overflow-hidden rounded-[22px] border border-[#5D4037]/10 bg-white px-3.5 py-3.5 shadow-[0_10px_24px_rgba(93,64,55,0.1)] sm:rounded-[24px] sm:px-4 sm:py-4"
              >
                <div className="absolute inset-x-0 top-0 h-[5px] bg-[linear-gradient(90deg,#FFC857_0%,#FFB347_100%)] sm:h-[6px]" />
                <div className="flex items-start gap-2.5 max-[379px]:flex-col max-[379px]:items-start sm:gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#FFC857]/20 sm:mt-1 sm:h-11 sm:w-11">
                    <Sparkles className="h-5 w-5 text-[#F4A524] sm:h-[22px] sm:w-[22px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[18px] font-bold leading-none text-[#5D4037] sm:text-[20px]">
                      输入内测码
                    </h2>
                    <p className="mt-1 text-[12px] leading-5 text-[#5D4037]/58 sm:mt-1.5 sm:text-[13px] sm:leading-6">
                      绑定后会在下方列表显示你可使用的内测功能
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-col gap-2.5 sm:mt-4">
                  <div className="relative min-w-0">
                    <input
                      value={codeInput}
                      onChange={(event) => setCodeInput(normalizeBetaCodeInput(event.target.value))}
                      maxLength={8}
                      placeholder="请输入管理员提供的内测码"
                      className="h-[42px] w-full rounded-[15px] border border-[#5D4037]/15 bg-[#FFFDF7] pl-3.5 pr-11 text-[14px] text-[#5D4037] outline-none transition placeholder:text-[#5D4037]/36 focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.12)] sm:h-11 sm:rounded-[16px] sm:pl-4 sm:pr-12 sm:text-[15px]"
                    />
                    <button
                      type="button"
                      onClick={() => void handlePasteCode()}
                      className="icon-button absolute right-2.5 top-1/2 z-10 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#FFC857]/18 text-[#8D6E63] transition hover:bg-[#FFC857]/28 sm:right-3 sm:h-[34px] sm:w-[34px]"
                      aria-label="粘贴内测码"
                      title="粘贴"
                    >
                      <Clipboard className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.2} />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleBind()}
                    disabled={submitting || loading}
                    className="inline-flex h-[42px] w-full items-center justify-center rounded-[15px] bg-[linear-gradient(180deg,#FFD86C_0%,#FFC857_100%)] px-5 text-[15px] font-bold text-[#5D4037] shadow-[0_8px_18px_rgba(255,200,87,0.3)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 sm:h-11 sm:rounded-[16px] sm:px-6 sm:text-base"
                  >
                    {submitting ? '绑定中...' : '绑定'}
                  </button>
                </div>

                <p className="mt-2.5 text-[12px] text-[#5D4037]/48 sm:text-[13px]">仅支持 8 位大写字母或数字</p>
                {renderMessage()}
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 }}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2"
              >
                <div className="flex min-w-0 items-center gap-2 sm:gap-2.5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#FFC857]/18 sm:h-10 sm:w-10">
                    <Sparkles className="h-4 w-4 text-[#F4A524] sm:h-[18px] sm:w-[18px]" />
                  </div>
                  <h2
                    className="truncate text-[22px] font-black leading-none text-[#5D4037] sm:text-[26px]"
                    style={{ fontFamily: "'ZQKNNY', cursive" }}
                  >
                    已解锁功能
                  </h2>
                </div>
                <div className="shrink-0 rounded-full bg-[#5D4037]/8 px-2.5 py-1 text-[11px] text-[#5D4037]/62 sm:px-3 sm:py-1.5 sm:text-xs">
                  共 {orderedRows.length} 个
                </div>
              </motion.div>

              {orderedRows.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.08 }}
                  className="rounded-[22px] border border-[#5D4037]/10 bg-white px-4 py-7 text-center shadow-[0_10px_24px_rgba(93,64,55,0.1)] sm:rounded-[24px] sm:px-5 sm:py-8"
                >
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FFC857]/16 sm:h-16 sm:w-16">
                    <Sparkles className="h-6 w-6 text-[#8D6E63] sm:h-7 sm:w-7" />
                  </div>
                  <h3 className="mt-4 text-[18px] font-bold text-[#5D4037] sm:text-[20px]">暂无已解锁功能</h3>
                  <p className="mt-2 text-[13px] leading-6 text-[#5D4037]/58 sm:text-sm">
                    输入有效内测码后，这里会展示功能入口
                  </p>
                </motion.div>
              ) : (
                <div className="flex flex-col gap-3 sm:gap-3.5">
                  {orderedRows.map((row, index) => {
                    const expiresText = extractDateText(row.expires_at);
                    const targetPath = row.route_path_web || row.route_path;
                    return (
                      <motion.section
                        key={`${row.feature_id}-${row.binding_id}`}
                        initial={{ opacity: 0, y: 18 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.08 + index * 0.04 }}
                        className="rounded-[20px] border border-[#5D4037]/10 bg-white px-3.5 py-3.5 shadow-[0_10px_24px_rgba(93,64,55,0.1)] sm:rounded-[22px] sm:px-4 sm:py-4"
                      >
                        <div className="flex flex-col gap-3">
                          <div className="flex flex-col gap-2.5 min-[440px]:flex-row min-[440px]:items-start min-[440px]:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-start gap-2">
                                <h3 className="text-[17px] font-black leading-tight text-[#5D4037] sm:text-[19px]">
                                  {row.feature_name}
                                </h3>
                                <span className="shrink-0 rounded-full bg-[#FFC857]/18 px-2.5 py-1 text-[11px] font-semibold text-[#5D4037] sm:px-3 sm:py-1.5 sm:text-xs">
                                  内测
                                </span>
                              </div>
                              <p className="mt-1.5 text-[13px] leading-5 text-[#5D4037]/74 sm:text-sm sm:leading-6">
                                {row.feature_description || row.route_description || '已为你开放对应内测页面入口'}
                              </p>
                            </div>
                          </div>

                          <div className="h-px bg-[#5D4037]/10" />

                          <div className="flex flex-col gap-2.5 min-[520px]:flex-row min-[520px]:items-center min-[520px]:justify-between">
                            <div className="flex min-w-0 items-center gap-2 text-[#5D4037]/58">
                              <CalendarDays className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
                              <span className="truncate text-[12px] sm:text-[13px]">
                                {expiresText ? `有效期至：${expiresText}` : '有效期：长期有效'}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => router.push(targetPath)}
                              className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-[13px] bg-[linear-gradient(180deg,#FFD86C_0%,#FFC857_100%)] px-4 text-[13px] font-bold text-[#5D4037] shadow-[0_8px_16px_rgba(255,200,87,0.28)] transition hover:translate-y-[-1px] min-[520px]:w-auto sm:h-[42px] sm:rounded-[14px] sm:px-5 sm:text-sm"
                            >
                              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                              进入功能
                            </button>
                          </div>
                        </div>
                      </motion.section>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
    </SecondaryPageShell>
  );
}
