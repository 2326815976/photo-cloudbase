'use client';

import { useEffect, useMemo, useState } from 'react';
import { Copy, Heart, Info, Mail, MessageSquare, Phone } from 'lucide-react';
import SecondaryPageShell from '@/components/shell/SecondaryPageShell';
import { createClient } from '@/lib/cloudbase/client';
import {
  loadLatestAboutSettingsWithCompat,
  type AboutSettingsCompatRecord,
} from '@/lib/about/about-settings-compat';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

const EMPTY_ABOUT: AboutSettingsCompatRecord = {
  id: null,
  author_name: '',
  phone: '',
  wechat: '',
  email: '',
  donation_qr_code: '',
  author_message: '',
};

type ToastState = {
  type: 'success' | 'error';
  message: string;
} | null;

async function copyText(value: string) {
  if (!value) {
    throw new Error('暂无可复制内容');
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('当前环境不支持复制');
  }

  const textarea = document.createElement('textarea');
  textarea.value = value;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error('复制失败，请手动复制');
  }
}

function buildContactItems(about: AboutSettingsCompatRecord) {
  return [
    {
      key: 'phone',
      label: '手机号',
      value: about.phone,
      icon: Phone,
      breakAll: false,
    },
    {
      key: 'wechat',
      label: '微信号',
      value: about.wechat,
      icon: MessageSquare,
      breakAll: false,
    },
    {
      key: 'email',
      label: '邮箱',
      value: about.email,
      icon: Mail,
      breakAll: true,
    },
  ].filter((item) => item.value);
}

export default function ProfileAboutPage() {
  const { title: managedTitle } = useManagedPageMeta('about', '关于');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState<ToastState>(null);
  const [about, setAbout] = useState<AboutSettingsCompatRecord>(EMPTY_ABOUT);

  useEffect(() => {
    let alive = true;

    const loadAbout = async () => {
      setLoading(true);
      setError('');
      const dbClient = createClient();
      if (!dbClient) {
        if (alive) {
          setLoading(false);
          setError('服务初始化失败，请稍后重试');
        }
        return;
      }

      const result = await loadLatestAboutSettingsWithCompat(dbClient);
      if (!alive) {
        return;
      }

      if (result.error) {
        setError(result.error.message || '加载关于信息失败');
        setAbout(EMPTY_ABOUT);
      } else {
        setAbout(result.data || EMPTY_ABOUT);
      }
      setLoading(false);
    };

    void loadAbout();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }
    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const contactItems = useMemo(() => buildContactItems(about), [about]);
  const authorName = about.author_name || '拾光谣';
  const authorInitial = authorName.slice(0, 1) || '谣';
  const hasContent = Boolean(
    about.author_name ||
      about.author_message ||
      contactItems.length > 0 ||
      about.donation_qr_code
  );

  const handleCopy = async (label: string, value: string) => {
    try {
      await copyText(value);
      setToast({ type: 'success', message: `${label}已复制` });
    } catch (copyError) {
      setToast({
        type: 'error',
        message:
          copyError instanceof Error && copyError.message
            ? copyError.message
            : `${label}复制失败`,
      });
    }
  };

  return (
    <SecondaryPageShell title={managedTitle} fallbackHref="/profile" contentClassName="flex-1 min-h-0 px-4 py-6 sm:px-6 sm:py-8">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-10">
        {toast && (
          <div
            className={`rounded-2xl border px-4 py-3 text-sm font-medium shadow-sm ${
              toast.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : 'border-rose-200 bg-rose-50 text-rose-700'
            }`}
          >
            {toast.message}
          </div>
        )}

        {loading ? (
          <div className="rounded-[28px] border border-[#5D4037]/10 bg-white px-6 py-16 text-center shadow-[0_8px_24px_rgba(93,64,55,0.08)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFC857]/20 text-[#5D4037]">
              <Info className="h-8 w-8" />
            </div>
            <p className="text-lg font-bold text-[#5D4037]">拾光中...</p>
            <p className="mt-2 text-sm text-[#5D4037]/60">正在加载关于页面</p>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-[28px] border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-600 shadow-sm">
                {error}
              </div>
            )}

            <section className="rounded-[32px] border border-[#5D4037]/10 bg-white px-6 py-6 shadow-[0_10px_26px_rgba(93,64,55,0.08)]">
              <div className="flex items-center gap-4">
                <div className="flex h-20 w-20 flex-none items-center justify-center rounded-full bg-gradient-to-br from-[#FFC857] via-[#FFB347] to-[#FF9A3C] text-3xl font-bold text-white shadow-md">
                  {authorInitial}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-2xl font-extrabold text-[#5D4037]">{authorName}</h2>
                  <p className="mt-1 text-sm text-[#5D4037]/60">感谢你来到这里，愿每次相遇都能留下温柔的回响。</p>
                </div>
              </div>

              {about.author_message && (
                <div className="mt-5 rounded-[24px] border border-[#FFC857]/30 bg-[#FFC857]/10 px-5 py-4">
                  <p className="mb-2 text-sm font-bold text-[#5D4037]">作者留言</p>
                  <p className="whitespace-pre-wrap break-all text-sm leading-7 text-[#5D4037]/85">{about.author_message}</p>
                </div>
              )}
            </section>

            {contactItems.length > 0 && (
              <section className="rounded-[32px] border border-[#5D4037]/10 bg-white px-6 py-6 shadow-[0_10px_26px_rgba(93,64,55,0.08)]">
                <h3 className="mb-4 text-xl font-extrabold text-[#5D4037]">联系方式</h3>
                <div className="flex flex-col gap-3">
                  {contactItems.map((item) => (
                    <div
                      key={item.key}
                      className="flex items-center gap-3 rounded-[22px] border border-[#5D4037]/10 bg-[#FFFDF7] px-4 py-4"
                    >
                      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-[#FFC857]/18 text-[#5D4037]">
                        <item.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-[#5D4037]/55">{item.label}</p>
                        <p className={`mt-1 text-sm text-[#5D4037] ${item.breakAll ? 'break-all' : ''}`}>{item.value}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleCopy(item.label, item.value)}
                        className="inline-flex h-10 min-w-[76px] items-center justify-center rounded-full bg-[#FFC857]/20 px-3 text-xs font-bold text-[#5D4037] transition hover:bg-[#FFC857]/30"
                      >
                        <Copy className="mr-1 h-3.5 w-3.5" />复制
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {about.donation_qr_code && (
              <section className="rounded-[32px] border border-[#5D4037]/10 bg-white px-6 py-6 shadow-[0_10px_26px_rgba(93,64,55,0.08)]">
                <div className="mb-4 flex items-center gap-2 text-[#5D4037]">
                  <Heart className="h-5 w-5 text-[#FF9A3C]" />
                  <h3 className="text-xl font-extrabold">赞赏支持</h3>
                </div>
                <div className="overflow-hidden rounded-[24px] border border-[#5D4037]/12 bg-white">
                  <img className="block w-full" src={about.donation_qr_code} alt="赞赏码" />
                </div>
                <p className="mt-3 text-center text-sm text-[#5D4037]/55">如果这份内容对你有帮助，欢迎扫码支持一下 ✨</p>
              </section>
            )}

            {!hasContent && !error && (
              <div className="rounded-[28px] border border-dashed border-[#5D4037]/14 bg-white px-6 py-10 text-center text-sm text-[#5D4037]/55 shadow-sm">
                当前关于页内容仍在完善中
              </div>
            )}
          </>
        )}
      </div>
    </SecondaryPageShell>
  );
}
