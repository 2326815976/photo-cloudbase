'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { MessageSquare, Phone, Save, User } from 'lucide-react';
import MiniProgramRecoveryScreen, { PAGE_LOADING_COPY } from '@/components/MiniProgramRecoveryScreen';
import SecondaryPageShell from '@/components/shell/SecondaryPageShell';
import { createClient } from '@/lib/cloudbase/client';
import { useManagedPageMeta } from '@/lib/page-center/use-managed-page-meta';
import {
  clampChinaMobileInput,
  isValidChinaMobile,
  normalizeChinaMobile,
} from '@/lib/utils/phone';

function isProfileMissingError(message: string) {
  const normalized = String(message || '').toLowerCase();
  return normalized.includes('no rows') || normalized.includes('not found');
}

export default function EditProfilePage() {
  const router = useRouter();
  const { title: managedTitle } = useManagedPageMeta('profile-edit', '编辑个人资料');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    wechat: '',
  });

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/profile');
  };

  useEffect(() => {
    const loadProfile = async () => {
      setIsLoading(true);
      setError('');

      const dbClient = createClient();
      if (!dbClient) {
        setError('服务初始化失败，请刷新后重试');
        setIsLoading(false);
        return;
      }

      const {
        data: { user },
      } = await dbClient.auth.getUser();

      if (!user) {
        setIsLoading(false);
        router.push('/login');
        return;
      }

      const { data: profile, error: profileError } = await dbClient
        .from('profiles')
        .select('name, phone, wechat')
        .eq('id', user.id)
        .single();

      if (profileError && !isProfileMissingError(profileError.message)) {
        setError(`加载失败：${profileError.message || '请稍后重试'}`);
        setIsLoading(false);
        return;
      }

      setFormData({
        name: String(profile?.name || user.name || '').trim(),
        phone: String(profile?.phone || user.phone || '').trim(),
        wechat: String(profile?.wechat || '').trim(),
      });
      setIsLoading(false);
    };

    void loadProfile();
  }, [router]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');

    const name = String(formData.name || '').trim();
    const rawPhone = String(formData.phone || '').trim();
    const wechat = String(formData.wechat || '').trim();

    if (!name) {
      setError('用户名不能为空');
      return;
    }

    if (rawPhone && !isValidChinaMobile(rawPhone)) {
      setError('请输入有效的手机号');
      return;
    }

    setIsSaving(true);

    const dbClient = createClient();
    if (!dbClient) {
      setError('服务初始化失败，请刷新后重试');
      setIsSaving(false);
      return;
    }

    const {
      data: { user },
    } = await dbClient.auth.getUser();

    if (!user) {
      setError('请先登录');
      setIsSaving(false);
      return;
    }

    const normalizedPhone = normalizeChinaMobile(rawPhone);
    const { data: updatedUser, error: updateError } = await dbClient.auth.updateUser({
      name,
      phone: normalizedPhone || null,
      wechat: wechat || null,
    });

    setIsSaving(false);

    if (updateError) {
      setError(`保存失败：${updateError.message || '请稍后重试'}`);
      return;
    }

    if (!updatedUser?.user) {
      setError('保存失败：当前账号资料不存在，请重新登录后重试');
      return;
    }

    setSuccess(true);
    window.setTimeout(() => {
      router.push('/profile');
    }, 1500);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: name === 'phone' ? clampChinaMobileInput(value) : value,
    }));
  };

  if (isLoading) {
    return (
      <SecondaryPageShell
        title={managedTitle}
        onBack={handleBack}
        align="left"
        contentClassName="px-6 py-6"
      >
          <MiniProgramRecoveryScreen
            title={PAGE_LOADING_COPY.title}
            description={PAGE_LOADING_COPY.description}
            className="h-full min-h-0"
          />
      </SecondaryPageShell>
    );
  }

  return (
    <SecondaryPageShell
      title={managedTitle}
      onBack={handleBack}
      align="left"
      contentClassName="overflow-y-auto px-6 pt-6 pb-20"
    >
        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#fffdf5] rounded-2xl p-8 shadow-lg text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.15 }}
              className="inline-flex items-center justify-center w-20 h-20 bg-[#FFC857]/20 rounded-full mb-4"
            >
              <Save className="w-10 h-10 text-[#FFC857]" />
            </motion.div>
            <h2
              className="text-xl font-bold text-[#5D4037] mb-2"
              style={{ fontFamily: "'ZQKNNY', cursive" }}
            >
              保存成功
            </h2>
            <p className="text-sm text-[#5D4037]/70">个人资料已更新，即将返回我的页面。</p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
          >
            <div
              className="bg-[#fffdf5] rounded-2xl p-6 shadow-lg relative"
              style={{
                backgroundImage: `
                  linear-gradient(0deg, transparent 24px, rgba(93, 64, 55, 0.05) 25px, transparent 26px),
                  linear-gradient(90deg, transparent 24px, rgba(93, 64, 55, 0.05) 25px, transparent 26px)
                `,
                backgroundSize: '25px 25px',
              }}
            >
              <div className="absolute top-4 right-4 text-[#FFC857]/40">
                <User className="w-8 h-8" strokeWidth={1.5} />
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                    <User className="w-4 h-4" />
                    <span>用户名 *</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    placeholder="请输入用户名"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    className="w-full px-4 py-3 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                    <Phone className="w-4 h-4" />
                    <span>手机号</span>
                  </label>
                  <input
                    type="tel"
                    name="phone"
                    placeholder="请输入手机号（选填）"
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all"
                    maxLength={11}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="tel"
                  />
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2 text-[#5D4037]">
                    <MessageSquare className="w-4 h-4" />
                    <span>微信号</span>
                  </label>
                  <input
                    type="text"
                    name="wechat"
                    placeholder="请输入微信号（选填）"
                    value={formData.wechat}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white border-2 border-[#5D4037]/20 rounded-2xl text-[#5D4037] placeholder:text-[#5D4037]/40 focus:outline-none focus:border-[#FFC857] focus:shadow-[0_0_0_3px_rgba(255,200,87,0.2)] transition-all"
                  />
                </div>

                <div className="p-3 bg-[#FFC857]/10 rounded-xl border border-[#FFC857]/30">
                  <p className="text-xs text-[#5D4037]/70 text-center">
                    填写手机号和微信后，预约时会自动填充。
                  </p>
                </div>

                {error ? (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </motion.div>
                ) : null}

                <motion.button
                  type="submit"
                  disabled={isSaving}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 bg-[#FFC857] text-[#5D4037] font-bold rounded-2xl shadow-[0_4px_0px_#5D4037] hover:shadow-[0_2px_0px_#5D4037] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    '保存中...'
                  ) : (
                    <>
                      <Save className="w-5 h-5" />
                      <span>保存修改</span>
                    </>
                  )}
                </motion.button>
              </form>
            </div>
          </motion.div>
        )}
    </SecondaryPageShell>
  );
}
