'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, KeyRound, LogIn, Sparkles } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';

interface BetaFeatureRow {
  binding_id: string;
  bound_at: string | null;
  feature_id: string;
  feature_name: string;
  feature_description: string | null;
  feature_code: string;
  expires_at: string | null;
  route_path: string;
  route_path_web?: string;
  preview_route_path_web?: string;
}

function extractDateText(value: string | null | undefined) {
  const matched = String(value || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return matched ? matched[1] : '';
}

export default function ProfileBetaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [codeInput, setCodeInput] = useState('');
  const [featureRows, setFeatureRows] = useState<BetaFeatureRow[]>([]);
  const [message, setMessage] = useState('');

  const orderedRows = useMemo(() => featureRows, [featureRows]);

  const loadRows = async () => {
    const response = await fetch('/api/page-center/beta/features?channel=web', { cache: 'no-store' });
    const payload = (await response.json()) as { data?: BetaFeatureRow[]; error?: string };
    if (!response.ok) {
      throw new Error(payload.error || '读取内测页面失败');
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
    const featureCode = codeInput.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    if (!featureCode) {
      setMessage('请输入内测码');
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

      setMessage('内测码绑定成功，已为你开放页面入口');
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '绑定内测码失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 pb-24 pt-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            页面内测中心
          </h1>
          <p className="mt-2 text-sm text-[#5D4037]/65">绑定页面内测码后，可直接进入无底栏页面。</p>
        </div>
        <div className="rounded-full bg-[#FFC857]/25 px-3 py-1 text-xs font-bold text-[#8D6E63]">
          <Sparkles className="mr-1 inline h-3.5 w-3.5" />
          内测
        </div>
      </div>

      <div className="mb-5 rounded-[28px] border border-[#5D4037]/10 bg-white/85 p-5 shadow-[0_10px_24px_rgba(93,64,55,0.08)]">
        <label className="mb-3 block text-sm font-semibold text-[#5D4037]">输入页面内测码</label>
        <div className="flex gap-3">
          <input
            value={codeInput}
            onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
            maxLength={8}
            placeholder="例如：A1B2C3D4"
            className="h-12 flex-1 rounded-full border border-[#5D4037]/15 bg-[#FFFBF0] px-4 text-sm text-[#5D4037] outline-none focus:border-[#FFC857]"
          />
          <button
            type="button"
            onClick={() => void handleBind()}
            disabled={submitting || loading || !isLoggedIn}
            className="h-12 rounded-full border-2 border-[#5D4037] bg-[#FFC857] px-5 font-bold text-[#5D4037] shadow-[4px_4px_0_#5D4037] transition disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '绑定中...' : '绑定'}
          </button>
        </div>
        {message ? <p className="mt-3 text-sm text-[#5D4037]/70">{message}</p> : null}
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[#5D4037]/60">正在加载内测页面...</div>
      ) : !isLoggedIn ? (
        <div className="rounded-[32px] border border-[#5D4037]/10 bg-white p-8 text-center shadow-[0_10px_30px_rgba(93,64,55,0.08)]">
          <LogIn className="mx-auto mb-4 h-14 w-14 text-[#FFC857]" />
          <h2 className="text-lg font-bold text-[#5D4037]">请先登录后再绑定内测页面</h2>
          <p className="mt-2 text-sm text-[#5D4037]/60">登录后即可通过页面内测码绑定并进入对应页面。</p>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-6 h-12 rounded-full border-2 border-[#5D4037] bg-[#FFC857] px-6 font-bold text-[#5D4037] shadow-[4px_4px_0_#5D4037]"
          >
            立即登录
          </button>
        </div>
      ) : orderedRows.length === 0 ? (
        <div className="rounded-[32px] border border-dashed border-[#5D4037]/18 bg-white/70 p-8 text-center text-sm text-[#5D4037]/65">
          当前还没有已绑定的页面内测功能。
        </div>
      ) : (
        <div className="space-y-4">
          {orderedRows.map((row) => {
            const expiresText = extractDateText(row.expires_at);
            const targetPath = row.route_path_web || row.route_path;
            return (
              <div
                key={`${row.feature_id}-${row.binding_id}`}
                className="rounded-[28px] border border-[#5D4037]/10 bg-white p-5 shadow-[0_10px_24px_rgba(93,64,55,0.08)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-bold text-[#5D4037]">{row.feature_name}</h3>
                    {row.feature_description ? (
                      <p className="mt-2 text-sm text-[#5D4037]/65">{row.feature_description}</p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#8D6E63]">
                      <span className="rounded-full bg-[#FFC857]/18 px-3 py-1">内测码：{row.feature_code || '已绑定'}</span>
                      <span className="rounded-full bg-[#5D4037]/8 px-3 py-1">
                        {expiresText ? `有效期至 ${expiresText}` : '长期有效'}
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push(targetPath)}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-[#5D4037]/18 px-4 text-sm font-semibold text-[#5D4037] transition hover:bg-[#FFC857]/12"
                  >
                    进入页面
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex items-center justify-center text-xs text-[#5D4037]/45">
        <KeyRound className="mr-1 h-3.5 w-3.5" />
        页面处于内测或查看模式时，不显示底部菜单栏。
      </div>
    </div>
  );
}
