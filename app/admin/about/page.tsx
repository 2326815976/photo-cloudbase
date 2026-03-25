'use client';
import { type ChangeEventHandler, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { useBeforeUnloadGuard } from '@/lib/hooks/useBeforeUnloadGuard';
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
  const [aboutDonationModalOpen, setAboutDonationModalOpen] = useState(false);
  const [rowId, setRowId] = useState<number | null>(null);
  const [form, setForm] = useState<AboutFormData>(DEFAULT_FORM);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const qrInputRef = useRef<HTMLInputElement | null>(null);
  const aboutLoadTokenRef = useRef(0);
  useBeforeUnloadGuard(uploadingQr);

  useEffect(() => {
    void loadAboutSettings();

    return () => {
      aboutLoadTokenRef.current += 1;
    };
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
    const loadToken = aboutLoadTokenRef.current + 1;
    aboutLoadTokenRef.current = loadToken;

    setLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      if (loadToken === aboutLoadTokenRef.current) {
        setLoading(false);
      }
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

    if (loadToken !== aboutLoadTokenRef.current) {
      return;
    }

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
    setForm((prev) => ({ ...prev, [name]: value }));
  };
  const buildPayload = (source: AboutFormData) => ({
    author_name: toText(source.author_name) || null,
    phone: toText(source.phone) || null,
    wechat: toText(source.wechat) || null,
    email: toText(source.email) || null,
    donation_qr_code: toText(source.donation_qr_code) || null,
    author_message: toText(source.author_message) || null,
  });
  const upsertAboutSettings = async (payload: ReturnType<typeof buildPayload>, successMessage: string): Promise<boolean> => {
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
    if (!file || saving || uploadingQr) {
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
      const nextForm = { ...form, donation_qr_code: uploadedUrl };
      setForm(nextForm);
      saved = await upsertAboutSettings(buildPayload(nextForm), '赞赏码已上传并保存');
      if (!saved) {
        await cleanupStorageByUrl(uploadedUrl, '新赞赏码');
        setForm((prev) => ({ ...prev, donation_qr_code: previousQrUrl }));
        return;
      }
      if (previousQrUrl && previousQrUrl !== uploadedUrl) {
        const cleaned = await cleanupStorageByUrl(previousQrUrl, '旧赞赏码');
        if (!cleaned) {
          showToast('error', '新赞赏码已保存，但旧赞赏码清理失败，请稍后重试');
        }
      }
      setAboutDonationModalOpen(false);
    } catch (error: any) {
      if (uploadedUrl && !saved) {
        await cleanupStorageByUrl(uploadedUrl, '新赞赏码');
      }
      if (!saved) {
        setForm((prev) => ({ ...prev, donation_qr_code: previousQrUrl }));
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
    const nextForm = { ...form, donation_qr_code: '' };
    setForm(nextForm);
    if (!rowId || rowId <= 0) {
      setAboutDonationModalOpen(false);
      return;
    }
    setSaving(true);
    const saved = await upsertAboutSettings(buildPayload(nextForm), '赞赏码已移除');
    if (!saved) {
      setForm((prev) => ({ ...prev, donation_qr_code: previousQrUrl }));
      setSaving(false);
      return;
    }
    if (previousQrUrl) {
      const cleaned = await cleanupStorageByUrl(previousQrUrl, '旧赞赏码');
      if (!cleaned) {
        showToast('error', '赞赏码已移除，但旧文件清理失败，请稍后重试');
      }
    }
    setAboutDonationModalOpen(false);
    setSaving(false);
  };
  const aboutBusy = loading || saving || uploadingQr;
  const contactRows = [
    { label: '手机号', value: toText(form.phone), breakable: false },
    { label: '微信号', value: toText(form.wechat), breakable: false },
    { label: '邮箱', value: toText(form.email), breakable: true },
  ].filter((item) => item.value);
  return (
    <div className="admin-mobile-page about-page space-y-6 pt-6">
      <input ref={qrInputRef} type="file" accept="image/*" className="hidden" onChange={handleUploadQrFile} />
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="fixed top-16 right-4 z-50">
            <div className={`px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 ${toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
              {toast.type === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="module-intro about-page-intro">
        <h1 className="module-title">关于设置</h1>
        <p className="module-desc">配置用户端关于页面内容</p>
      </div>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="booking-panel about-panel">
        {loading ? (
          <div className="pose-loading">
            <div className="pose-loading__spinner"></div>
            <div className="pose-loading__text">加载中...</div>
          </div>
        ) : (
          <div className="about-grid">
            <div className="about-card about-card--form">
              <div className="booking-modal__body">
                <div className="booking-modal__field">
                  <label className="booking-modal__label">作者名称</label>
                  <input className="booking-modal__input" value={form.author_name} onChange={(event) => handleChange('author_name', event.target.value)} placeholder="例如：拾光谣作者" maxLength={60} />
                </div>
                <div className="booking-modal__field">
                  <label className="booking-modal__label">手机号（选填）</label>
                  <input className="booking-modal__input" value={form.phone} onChange={(event) => handleChange('phone', event.target.value)} placeholder="请输入手机号" maxLength={32} />
                </div>
                <div className="booking-modal__field">
                  <label className="booking-modal__label">微信号（选填）</label>
                  <input className="booking-modal__input" value={form.wechat} onChange={(event) => handleChange('wechat', event.target.value)} placeholder="请输入微信号" maxLength={64} />
                </div>
                <div className="booking-modal__field">
                  <label className="booking-modal__label">邮箱（选填）</label>
                  <input className="booking-modal__input" value={form.email} onChange={(event) => handleChange('email', event.target.value)} placeholder="请输入邮箱" maxLength={255} />
                </div>
                <div className="booking-modal__field">
                  <label className="booking-modal__label">赞赏码图片（选填）</label>
                  {toText(form.donation_qr_code) ? (
                    <div className="album-upload-preview">
                      <span className="album-upload-preview__label">当前赞赏码</span>
                      <img className="album-upload-preview__qr" src={toText(form.donation_qr_code)} alt="当前赞赏码" />
                    </div>
                  ) : (
                    <div className="album-upload-preview album-upload-preview--empty">
                      <span>当前未上传赞赏码，上传后将展示在用户端关于页面。</span>
                    </div>
                  )}
                  <button type="button" className="booking-modal__submit" onClick={() => setAboutDonationModalOpen(true)} disabled={aboutBusy}>
                    {toText(form.donation_qr_code) ? '更换赞赏码' : '上传赞赏码'}
                  </button>
                  {toText(form.donation_qr_code) && (
                    <button type="button" className="booking-pill-btn booking-pill-btn--ghost" onClick={handleClearQr} disabled={aboutBusy}>
                      清空赞赏码
                    </button>
                  )}
                </div>
                <div className="booking-modal__field">
                  <label className="booking-modal__label">作者留言</label>
                  <textarea className="booking-modal__textarea about-textarea" value={form.author_message} onChange={(event) => handleChange('author_message', event.target.value)} placeholder="写给用户的一段话" maxLength={2000} />
                </div>
              </div>
              <div className="about-save-wrap">
                <button type="button" className="booking-pill-btn booking-pill-btn--primary about-save-btn" onClick={handleSave} disabled={aboutBusy}>
                  {saving ? '保存中...' : '保存设置'}
                </button>
              </div>
            </div>
            <div className="about-card about-card--preview">
              <div className="about-preview-head">
                <span className="about-preview-title">{toText(form.author_name) || '作者'}</span>
                <span className="about-preview-sub">用户端“关于”预览</span>
              </div>
              <div className="about-preview-message">
                <span>{toText(form.author_message) || '暂无留言'}</span>
              </div>
              {contactRows.length > 0 ? (
                <div className="about-preview-contact">
                  {contactRows.map((item) => (
                    <div key={item.label} className="about-preview-row">
                      <span className="about-preview-label">{item.label}</span>
                      <span className={`about-preview-value ${item.breakable ? 'about-preview-value--break' : ''}`}>{item.value}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="about-preview-empty">
                  <span>未填写联系方式</span>
                </div>
              )}
              {toText(form.donation_qr_code) && (
                <div className="about-preview-qr-wrap">
                  <img className="about-preview-qr" src={toText(form.donation_qr_code)} alt="赞赏码预览" />
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
      <AnimatePresence>
        {aboutDonationModalOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="booking-modal-mask" onClick={() => { if (!aboutBusy) setAboutDonationModalOpen(false); }}>
            <motion.div initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }} transition={{ type: 'spring', duration: 0.28 }} className="booking-modal booking-modal--form album-modal about-donation-modal" onClick={(event) => event.stopPropagation()}>
              <div className="booking-modal__head">
                <h3 className="booking-modal__title">更换赞赏码</h3>
                <button type="button" className="booking-modal__close" onClick={() => { if (!aboutBusy) setAboutDonationModalOpen(false); }} disabled={aboutBusy} aria-label="关闭赞赏码弹窗">
                  ✕
                </button>
              </div>
              <div className="booking-modal__body">
                <span className="album-modal__subtitle">用于用户端“关于”页面展示</span>
                {toText(form.donation_qr_code) ? (
                  <div className="album-upload-preview">
                    <span className="album-upload-preview__label">当前赞赏码</span>
                    <img className="album-upload-preview__qr" src={toText(form.donation_qr_code)} alt="当前赞赏码" />
                  </div>
                ) : (
                  <div className="album-upload-preview album-upload-preview--empty">
                    <span>当前未上传赞赏码，上传后将展示在用户端关于页面。</span>
                  </div>
                )}
                <button type="button" className="booking-modal__submit" onClick={() => qrInputRef.current?.click()} disabled={aboutBusy}>
                  {uploadingQr ? '上传中...' : '选择赞赏码图片'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
