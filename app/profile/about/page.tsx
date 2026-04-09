'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { motion } from 'framer-motion';
import { ArrowLeft, Mail, MessageSquare, Phone, QrCode, User } from 'lucide-react';
import { loadLatestAboutSettingsWithCompat } from '@/lib/about/about-settings-compat';
import { createClient } from '@/lib/cloudbase/client';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';

interface AboutSettings {
  author_name: string;
  phone: string;
  wechat: string;
  email: string;
  donation_qr_code: string;
  author_message: string;
}

const DEFAULT_ABOUT: AboutSettings = {
  author_name: '',
  phone: '',
  wechat: '',
  email: '',
  donation_qr_code: '',
  author_message: '',
};

function toText(value: unknown): string {
  const text = String(value ?? '').trim();
  if (!text) {
    return '';
  }

  const normalized = text.toLowerCase();
  return normalized === 'null' || normalized === 'undefined' ? '' : text;
}

function normalizeImageUrlText(value: unknown): string {
  const text = toText(value);
  if (!text) {
    return '';
  }

  if (
    text.startsWith('https://') ||
    text.startsWith('http://') ||
    text.startsWith('cloud://') ||
    text.startsWith('/') ||
    text.startsWith('data:image/')
  ) {
    return text;
  }

  return '';
}

export default function ProfileAboutPage() {
  const router = useRouter();
  const { title: managedTitle, subtitle: managedSubtitle } = useManagedPageMeta(
    'about',
    '关于'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [about, setAbout] = useState<AboutSettings>(DEFAULT_ABOUT);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');

      const dbClient = createClient();
      if (!dbClient) {
        setError('服务初始化失败，请刷新后重试');
        setLoading(false);
        return;
      }

      const { data, error: queryError } = await loadLatestAboutSettingsWithCompat(dbClient);

      if (queryError) {
        setError(`加载失败：${queryError.message || '未知错误'}`);
        setAbout(DEFAULT_ABOUT);
        setLoading(false);
        return;
      }

      if (!data) {
        setAbout(DEFAULT_ABOUT);
        setLoading(false);
        return;
      }

      setAbout({
        author_name: toText(data.author_name),
        phone: toText(data.phone),
        wechat: toText(data.wechat),
        email: toText(data.email),
        donation_qr_code: normalizeImageUrlText(data.donation_qr_code),
        author_message: toText(data.author_message),
      });
      setLoading(false);
    };

    void load();
  }, []);

  return (
    <div className="flex flex-col h-full w-full">
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="icon-button action-icon-btn action-icon-btn--back"
          >
            <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-2xl font-bold leading-none text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              {managedTitle}
            </h1>
          </div>
          {managedSubtitle ? (
            <div className="inline-flex shrink-0 items-center rounded-full bg-[#FFC857]/24 px-[10px] py-[5px] text-[10px] font-bold leading-none text-[#8D6E63] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.45)]">
              {managedSubtitle}
            </div>
          ) : null}
        </div>
      </motion.div>

      <PreviewAwareScrollArea className="flex-1 overflow-y-auto px-6 pt-6">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#FFC857] border-t-transparent" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            <div className="bg-white rounded-2xl p-5 border border-[#5D4037]/10 shadow-[0_4px_12px_rgba(93,64,55,0.08)]">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-[#FFC857]/20 flex items-center justify-center">
                  <User className="w-5 h-5 text-[#5D4037]" />
                </div>
                <div>
                  <p className="text-xs text-[#5D4037]/50">作者</p>
                  <p className="text-base font-semibold text-[#5D4037]">{toText(about.author_name) || '作者'}</p>
                </div>
              </div>
              <p className="text-sm text-[#5D4037]/80 leading-6 whitespace-pre-wrap">
                {toText(about.author_message) || '暂无留言'}
              </p>
            </div>

            <div className="bg-white rounded-2xl p-5 border border-[#5D4037]/10 shadow-[0_4px_12px_rgba(93,64,55,0.08)] space-y-3">
              {about.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="w-4 h-4 text-[#FFC857]" />
                  <span className="text-sm text-[#5D4037]">{about.phone}</span>
                </div>
              )}
              {about.wechat && (
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-4 h-4 text-[#FFC857]" />
                  <span className="text-sm text-[#5D4037]">{about.wechat}</span>
                </div>
              )}
              {about.email && (
                <div className="flex items-center gap-3">
                  <Mail className="w-4 h-4 text-[#FFC857]" />
                  <span className="text-sm text-[#5D4037] break-all">{about.email}</span>
                </div>
              )}
              {!about.phone && !about.wechat && !about.email && (
                <p className="text-sm text-[#5D4037]/55">暂未公开联系方式</p>
              )}
            </div>

            {about.donation_qr_code && (
              <div className="bg-white rounded-2xl p-5 border border-[#5D4037]/10 shadow-[0_4px_12px_rgba(93,64,55,0.08)]">
                <div className="flex items-center gap-2 mb-3">
                  <QrCode className="w-4 h-4 text-[#FFC857]" />
                  <p className="text-sm font-medium text-[#5D4037]">赞赏码</p>
                </div>
                <Image
                  src={about.donation_qr_code}
                  alt="赞赏码"
                  width={560}
                  height={560}
                  unoptimized
                  className="w-full max-w-[280px] rounded-xl border border-[#5D4037]/10"
                />
              </div>
            )}
          </motion.div>
        )}
      </PreviewAwareScrollArea>
    </div>
  );
}
