'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { User, Phone, MessageSquare, ArrowLeft, Save } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { clampChinaMobileInput, isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';

export default function EditProfilePage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    wechat: '',
  });

  useEffect(() => {
    loadProfile();
  }, []);

  const loadProfile = async () => {
    setIsLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setError('服务初始化失败，请刷新后重试');
      setIsLoading(false);
      return;
    }

    const { data: { user } } = await dbClient.auth.getUser();

    if (!user) {
      setIsLoading(false);
      router.push('/login');
      return;
    }

    const { data: profile } = await dbClient
      .from('profiles')
      .select('name, phone, wechat')
      .eq('id', user.id)
      .single();

    if (profile) {
      setFormData({
        name: profile.name || '',
        phone: profile.phone || '',
        wechat: profile.wechat || '',
      });
    }

    setIsLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSaving(true);

    const dbClient = createClient();
    if (!dbClient) {
      setError('服务初始化失败，请刷新后重试');
      setIsSaving(false);
      return;
    }

    const { data: { user } } = await dbClient.auth.getUser();

    if (!user) {
      setError('请先登录');
      setIsSaving(false);
      return;
    }

    // 验证用户名
    if (!formData.name.trim()) {
      setError('用户名不能为空');
      setIsSaving(false);
      return;
    }

    const rawPhone = formData.phone.trim();
    if (rawPhone && !isValidChinaMobile(rawPhone)) {
      setError('请输入有效的手机号');
      setIsSaving(false);
      return;
    }
    const normalizedPhone = normalizeChinaMobile(rawPhone);

    const { data: updatedProfile, error: updateError } = await dbClient
      .from('profiles')
      .update({
        name: formData.name.trim(),
        phone: normalizedPhone || null,
        wechat: formData.wechat.trim() || null,
      })
      .eq('id', user.id)
      .select('id')
      .maybeSingle();

    setIsSaving(false);

    if (updateError) {
      setError('保存失败: ' + updateError.message);
    } else if (!updatedProfile) {
      setError('保存失败: 当前账号资料不存在，请重新登录后重试');
    } else {
      setSuccess(true);
      setTimeout(() => {
        router.push('/profile');
      }, 1500);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === 'phone' ? clampChinaMobileInput(value) : value,
    }));
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col items-center gap-6"
        >
          <div className="relative">
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
            />
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <User className="w-8 h-8 text-[#FFC857]" />
            </div>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-lg font-medium text-[#5D4037] mb-2">
              加载中...
            </p>
            <p className="text-sm text-[#5D4037]/60">
              正在加载个人资料
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 */}
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
          <h1 className="text-2xl font-bold text-[#5D4037] leading-none" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            编辑个人资料
          </h1>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20">
        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#fffdf5] rounded-2xl p-8 shadow-lg text-center"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.2 }}
              className="inline-flex items-center justify-center w-20 h-20 bg-[#FFC857]/20 rounded-full mb-4"
            >
              <Save className="w-10 h-10 text-[#FFC857]" />
            </motion.div>
            <h2 className="text-xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              保存成功！
            </h2>
            <p className="text-sm text-[#5D4037]/70" style={{ fontFamily: "'ZQKNNY', cursive" }}>
              个人资料已更新 ✨
            </p>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            {/* 格纹信纸卡片 */}
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
              {/* 简笔画涂鸦 */}
              <div className="absolute top-4 right-4 text-[#FFC857]/40">
                <User className="w-8 h-8" strokeWidth={1.5} />
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* 用户名 */}
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

                {/* 手机号 */}
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

                {/* 微信号 */}
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

                {/* 提示信息 */}
                <div className="p-3 bg-[#FFC857]/10 rounded-xl border border-[#FFC857]/30">
                  <p className="text-xs text-[#5D4037]/70 text-center">
                    💡 填写手机号和微信后，预约时会自动填充
                  </p>
                </div>

                {/* 错误提示 */}
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-3 bg-red-50 border border-red-200 rounded-xl"
                  >
                    <p className="text-sm text-red-600 text-center">{error}</p>
                  </motion.div>
                )}

                {/* 提交按钮 */}
                <motion.button
                  type="submit"
                  disabled={isSaving}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full py-4 bg-[#FFC857] text-[#5D4037] font-bold rounded-2xl shadow-[0_4px_0px_#5D4037] hover:shadow-[0_2px_0px_#5D4037] hover:translate-y-[2px] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSaving ? '保存中...' : (
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
      </div>
    </div>
  );
}


