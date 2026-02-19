'use client';

import { type ChangeEventHandler, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle, Mail, MessageSquare, Phone, QrCode, Save, User } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';

interface AboutFormData {
  author_name: string;
  phone: string;
  wechat: string;
  email: string;
  donation_qr_code: string;
  author_message: string;
}

const DEFAULT_FORM: AboutFormData = {
  author_name: '',
  phone: '',
  wechat: '',
  email: '',
  donation_qr_code: '',
  author_message: '',
};

function toText(value: unknown): string {
  return String(value ?? '').trim();
}

export default function AdminAboutPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [rowId, setRowId] = useState<number | null>(null);
  const [form, setForm] = useState<AboutFormData>(DEFAULT_FORM);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const qrInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    void loadAboutSettings();
  }, []);

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 2800);
  };

  const cleanupStorageByUrl = async (url: string, label: string): Promise<boolean> => {
    const targetUrl = toText(url);
    if (!targetUrl) {
      return true;
    }

    try {
      const response = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
        credentials: 'include',
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String((payload as any)?.error || `删除${label}失败`));
      }

      return true;
    } catch (error) {
      console.error(`删除${label}失败:`, error);
      return false;
    }
  };

  const loadAboutSettings = async () => {
    setLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      showToast('error', '服务初始化失败，请刷新后重试');
      return;
    }

    const { data, error } = await dbClient
      .from('about_settings')
      .select('id, author_name, phone, wechat, email, donation_qr_code, author_message')
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      setLoading(false);
      showToast('error', `加载失败：${error.message || '未知错误'}`);
      return;
    }

    if (!data) {
      setRowId(null);
      setForm(DEFAULT_FORM);
      setLoading(false);
      return;
    }

    setRowId(Number(data.id));
    setForm({
      author_name: toText(data.author_name),
      phone: toText(data.phone),
      wechat: toText(data.wechat),
      email: toText(data.email),
      donation_qr_code: toText(data.donation_qr_code),
      author_message: toText(data.author_message),
    });
    setLoading(false);
  };

  const handleChange = (name: keyof AboutFormData, value: string) => {
    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const buildPayload = (source: AboutFormData) => ({
    author_name: toText(source.author_name) || null,
    phone: toText(source.phone) || null,
    wechat: toText(source.wechat) || null,
    email: toText(source.email) || null,
    donation_qr_code: toText(source.donation_qr_code) || null,
    author_message: toText(source.author_message) || null,
  });

  const upsertAboutSettings = async (
    payload: ReturnType<typeof buildPayload>,
    successMessage: string
  ): Promise<boolean> => {
    const dbClient = createClient();
    if (!dbClient) {
      showToast('error', '服务初始化失败，请刷新后重试');
      return false;
    }

    if (rowId && rowId > 0) {
      const { data, error } = await dbClient
        .from('about_settings')
        .update(payload)
        .eq('id', rowId)
        .select('id')
        .maybeSingle();

      if (error) {
        showToast('error', `保存失败：${error.message || '未知错误'}`);
        return false;
      }
      if (!data) {
        showToast('error', '保存失败：配置记录不存在，请刷新后重试');
        return false;
      }
      showToast('success', successMessage);
      return true;
    }

    const { data, error } = await dbClient
      .from('about_settings')
      .insert(payload)
      .select('id')
      .maybeSingle();

    if (error) {
      showToast('error', `保存失败：${error.message || '未知错误'}`);
      return false;
    }
    if (!data) {
      showToast('error', '保存失败：未返回配置记录');
      return false;
    }

    setRowId(Number(data.id));
    showToast('success', successMessage);
    return true;
  };

  const handleSave = async () => {
    if (saving || uploadingQr) {
      return;
    }

    setSaving(true);
    const payload = buildPayload(form);
    await upsertAboutSettings(payload, rowId && rowId > 0 ? '关于信息已更新' : '关于信息已保存');
    setSaving(false);
  };

  const handleUploadQrFile: ChangeEventHandler<HTMLInputElement> = async (event) => {
    const file = event.target.files && event.target.files[0] ? event.target.files[0] : null;
    event.target.value = '';
    if (!file) {
      return;
    }
    if (saving || uploadingQr) {
      return;
    }

    setUploadingQr(true);
    const previousQrUrl = toText(form.donation_qr_code);
    let uploadedUrl = '';
    let saved = false;
    try {
      const safeName = String(file.name || 'about_donation_qr.png')
        .replace(/\s+/g, '_')
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        .slice(-120);
      const uploadKey = `about_donation_qr/${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${safeName || 'qr.png'}`;
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'albums');
      formData.append('key', uploadKey);

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || body?.error) {
        throw new Error(String(body?.error || '上传失败'));
      }

      uploadedUrl = toText(body?.url);
      if (!uploadedUrl) {
        throw new Error('上传失败：未返回文件地址');
      }

      const nextForm = {
        ...form,
        donation_qr_code: uploadedUrl,
      };
      setForm(nextForm);

      const payload = buildPayload(nextForm);
      saved = await upsertAboutSettings(payload, '赞赏码已上传并保存');
      if (!saved) {
        await cleanupStorageByUrl(uploadedUrl, '新赞赏码');
        setForm((prev) => ({
          ...prev,
          donation_qr_code: previousQrUrl,
        }));
        return;
      }

      if (previousQrUrl && previousQrUrl !== uploadedUrl) {
        const cleaned = await cleanupStorageByUrl(previousQrUrl, '旧赞赏码');
        if (!cleaned) {
          showToast('error', '新赞赏码已保存，但旧赞赏码清理失败，请稍后重试');
        }
      }
    } catch (error: any) {
      if (uploadedUrl && !saved) {
        await cleanupStorageByUrl(uploadedUrl, '新赞赏码');
      }
      if (!saved) {
        setForm((prev) => ({
          ...prev,
          donation_qr_code: previousQrUrl,
        }));
      }
      showToast('error', `上传失败：${error?.message || '未知错误'}`);
    } finally {
      setUploadingQr(false);
    }
  };

  const handleClearQr = async () => {
    if (saving || uploadingQr) {
      return;
    }
    const previousQrUrl = toText(form.donation_qr_code);
    const nextForm = {
      ...form,
      donation_qr_code: '',
    };
    setForm(nextForm);
    if (!rowId || rowId <= 0) {
      return;
    }
    setSaving(true);
    const saved = await upsertAboutSettings(buildPayload(nextForm), '赞赏码已移除');
    if (!saved) {
      setForm((prev) => ({
        ...prev,
        donation_qr_code: previousQrUrl,
      }));
      setSaving(false);
      return;
    }
    if (previousQrUrl) {
      const cleaned = await cleanupStorageByUrl(previousQrUrl, '旧赞赏码');
      if (!cleaned) {
        showToast('error', '赞赏码已移除，但旧文件清理失败，请稍后重试');
      }
    }
    setSaving(false);
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-5xl">
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="fixed top-16 right-4 z-50"
          >
            <div
              className={`px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 ${
                toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
              }`}
            >
              {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          关于设置
        </h1>
        <p className="text-[#5D4037]/60">编辑用户端“关于”页面展示的作者信息</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-[#FFC857] border-t-transparent" />
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-[#5D4037]/10 shadow-sm space-y-4">
            <div>
              <label className="text-sm font-medium text-[#5D4037] mb-2 block">作者名称</label>
              <input
                type="text"
                value={form.author_name}
                onChange={(e) => handleChange('author_name', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                placeholder="例如：拾光谣作者"
                maxLength={60}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#5D4037] mb-2 block">手机号</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => handleChange('phone', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                placeholder="选填"
                maxLength={32}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#5D4037] mb-2 block">微信号</label>
              <input
                type="text"
                value={form.wechat}
                onChange={(e) => handleChange('wechat', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                placeholder="选填"
                maxLength={64}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#5D4037] mb-2 block">邮箱</label>
              <input
                type="text"
                value={form.email}
                onChange={(e) => handleChange('email', e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none"
                placeholder="选填"
                maxLength={255}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#5D4037] mb-2 block">赞赏码图片</label>
              <input
                ref={qrInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadQrFile}
              />

              {!toText(form.donation_qr_code) ? (
                <button
                  type="button"
                  onClick={() => qrInputRef.current?.click()}
                  disabled={saving || uploadingQr}
                  className="w-full h-11 rounded-full bg-[#FFC857] text-[#5D4037] font-semibold border border-[#5D4037]/10 hover:shadow-md transition-shadow disabled:opacity-60"
                >
                  {uploadingQr ? '上传中...' : '上传赞赏码'}
                </button>
              ) : (
                <div className="rounded-xl border border-[#5D4037]/20 bg-[#FFFBF0] p-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => qrInputRef.current?.click()}
                      disabled={saving || uploadingQr}
                      className="flex-1 h-10 rounded-full bg-[#FFC857] text-[#5D4037] text-sm font-medium disabled:opacity-60"
                    >
                      {uploadingQr ? '上传中...' : '更换'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClearQr}
                      disabled={saving || uploadingQr}
                      className="flex-1 h-10 rounded-full border border-[#5D4037]/20 text-[#5D4037] text-sm font-medium bg-white disabled:opacity-60"
                    >
                      移除
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-[#5D4037] mb-2 block">作者留言</label>
              <textarea
                value={form.author_message}
                onChange={(e) => handleChange('author_message', e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none resize-none h-28"
                placeholder="写给用户的一段话"
                maxLength={2000}
              />
            </div>

            <button
              onClick={handleSave}
              disabled={saving || uploadingQr}
              className="w-full h-11 rounded-full bg-[#FFC857] text-[#5D4037] font-semibold border border-[#5D4037]/10 hover:shadow-md transition-shadow disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '保存设置'}
            </button>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-[#5D4037]/10 shadow-sm space-y-4">
            <div className="flex items-center gap-2 text-[#5D4037]">
              <User className="w-4 h-4 text-[#FFC857]" />
              <span className="text-sm font-semibold">{toText(form.author_name) || '作者'}</span>
            </div>
            <p className="text-sm text-[#5D4037]/75 whitespace-pre-wrap leading-6">
              {toText(form.author_message) || '暂无留言'}
            </p>

            {(toText(form.phone) || toText(form.wechat) || toText(form.email)) && (
              <div className="rounded-xl bg-[#FFFBF0] border border-[#5D4037]/10 p-4 space-y-2">
                {toText(form.phone) && (
                  <div className="flex items-center gap-2 text-[#5D4037] text-sm">
                    <Phone className="w-4 h-4 text-[#FFC857]" />
                    <span>{toText(form.phone)}</span>
                  </div>
                )}
                {toText(form.wechat) && (
                  <div className="flex items-center gap-2 text-[#5D4037] text-sm">
                    <MessageSquare className="w-4 h-4 text-[#FFC857]" />
                    <span>{toText(form.wechat)}</span>
                  </div>
                )}
                {toText(form.email) && (
                  <div className="flex items-center gap-2 text-[#5D4037] text-sm">
                    <Mail className="w-4 h-4 text-[#FFC857]" />
                    <span className="break-all">{toText(form.email)}</span>
                  </div>
                )}
              </div>
            )}

            {toText(form.donation_qr_code) && (
              <div>
                <div className="flex items-center gap-2 mb-2 text-[#5D4037] text-sm font-medium">
                  <QrCode className="w-4 h-4 text-[#FFC857]" />
                  <span>赞赏码预览</span>
                </div>
                <Image
                  src={toText(form.donation_qr_code)}
                  alt="赞赏码预览"
                  width={560}
                  height={560}
                  unoptimized
                  className="w-full max-w-[280px] rounded-xl border border-[#5D4037]/10"
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
