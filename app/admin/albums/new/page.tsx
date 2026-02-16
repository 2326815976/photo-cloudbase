'use client';

import { useState } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Key, Sparkles, CheckCircle, XCircle, AlertCircle, Upload, QrCode } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadToCloudBaseDirect } from '@/lib/storage/cloudbase-upload-client';
import { formatDateDisplayUTC8, getDateAfterDaysUTC8, getDateTimeAfterDaysUTC8, getDaysDifference, getTodayUTC8 } from '@/lib/utils/date-helpers';
import { normalizeAccessKey } from '@/lib/utils/access-key';

export default function NewAlbumPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [donationQrFile, setDonationQrFile] = useState<File | null>(null);
  const [donationQrPreview, setDonationQrPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    access_key: '',
    welcome_letter: '',
    recipient_name: '',
    enable_tipping: true,
    enable_welcome_letter: true,
    auto_generate_key: true,
    expiry_days: 7,
    expiry_mode: 'days' as 'days' | 'date',
    expiry_date: getDateAfterDaysUTC8(7),
  });

  const todayDate = getTodayUTC8();
  const selectedExpiryDate = formData.expiry_date || todayDate;
  const customExpiryDays = Math.max(getDaysDifference(todayDate, selectedExpiryDate), 0);

  const generateRandomKey = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let key = '';
    for (let i = 0; i < 8; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
  };

  const handleCoverSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 验证文件类型
    if (!file.type.startsWith('image/')) {
      setShowToast({ message: '请选择图片文件', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      // 使用统一的压缩工具
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);
      setCoverFile(compressedFile);

      // 生成预览
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);

      setShowToast({ message: '图片已处理完成', type: 'success' });
      setTimeout(() => setShowToast(null), 2000);
    } catch (error: any) {
      setShowToast({ message: `图片处理失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const removeCover = () => {
    setCoverFile(null);
    setCoverPreview(null);
  };

  const handleDonationQrSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setShowToast({ message: '请选择图片文件', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    try {
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);
      setDonationQrFile(compressedFile);

      const reader = new FileReader();
      reader.onloadend = () => {
        setDonationQrPreview(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);

      setShowToast({ message: '赞赏码已处理完成', type: 'success' });
      setTimeout(() => setShowToast(null), 2000);
    } catch (error: any) {
      setShowToast({ message: `赞赏码处理失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const removeDonationQr = () => {
    setDonationQrFile(null);
    setDonationQrPreview(null);
  };

  const cleanupStorageByUrl = async (url: string | null, label: string) => {
    const targetUrl = String(url ?? '').trim();
    if (!targetUrl) {
      return;
    }

    try {
      await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
    } catch (cleanupError) {
      console.error(`回滚${label}文件失败:`, cleanupError);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const dbClient = createClient();
      const accessKey = formData.auto_generate_key
        ? generateRandomKey()
        : normalizeAccessKey(formData.access_key);
      const currentDate = getTodayUTC8();

      if (!accessKey) {
        setShowToast({ message: '请输入访问密钥', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        setLoading(false);
        return;
      }

      // 检查密钥是否已存在
      const { data: existing, error: existingError } = await dbClient
        .from('albums')
        .select('id')
        .eq('access_key', accessKey)
        .maybeSingle();

      if (existingError) {
        setShowToast({ message: `检查密钥失败：${existingError.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        setLoading(false);
        return;
      }

      if (existing) {
        setShowToast({ message: '该访问密钥已存在，请使用其他密钥', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        setLoading(false);
        return;
      }

      if (formData.expiry_mode === 'date') {
        const targetDate = String(formData.expiry_date || '').trim();
        if (!targetDate) {
          setShowToast({ message: '请选择过期日期', type: 'warning' });
          setTimeout(() => setShowToast(null), 3000);
          setLoading(false);
          return;
        }
        if (targetDate < currentDate) {
          setShowToast({ message: '过期日期不能早于今天', type: 'warning' });
          setTimeout(() => setShowToast(null), 3000);
          setLoading(false);
          return;
        }
      }

      // 上传封面与赞赏码（如果有）
      let coverUrl: string | null = null;
      let donationQrUrl: string | null = null;
      const timestamp = Date.now();

      if (coverFile) {
        try {
          const ext = coverFile.name.split('.').pop();
          const fileName = `cover_${timestamp}.${ext}`;
          coverUrl = await uploadToCloudBaseDirect(coverFile, fileName, 'albums');
        } catch (uploadError: any) {
          setShowToast({ message: `封面上传失败：${uploadError.message}`, type: 'error' });
          setTimeout(() => setShowToast(null), 3000);
          setLoading(false);
          return;
        }
      }

      if (formData.enable_tipping && donationQrFile) {
        try {
          const ext = donationQrFile.name.split('.').pop();
          const fileName = `donation_qr_${timestamp}.${ext}`;
          donationQrUrl = await uploadToCloudBaseDirect(donationQrFile, fileName, 'albums');
        } catch (uploadError: any) {
          await cleanupStorageByUrl(coverUrl, '封面');
          setShowToast({ message: `赞赏码上传失败：${uploadError.message}`, type: 'error' });
          setTimeout(() => setShowToast(null), 3000);
          setLoading(false);
          return;
        }
      }

      // 计算有效期
      const expiresAt = formData.expiry_mode === 'date'
        ? `${selectedExpiryDate} 23:59:59`
        : getDateTimeAfterDaysUTC8(formData.expiry_days);

      const { error } = await dbClient.from('albums').insert({
        title: formData.title || '未命名空间',
        access_key: accessKey,
        cover_url: coverUrl,
        donation_qr_code_url: formData.enable_tipping ? donationQrUrl : null,
        welcome_letter: formData.welcome_letter,
        recipient_name: formData.recipient_name || '拾光者',
        enable_tipping: formData.enable_tipping,
        enable_welcome_letter: formData.enable_welcome_letter,
        expires_at: expiresAt,
      });

      if (error) {
        await cleanupStorageByUrl(coverUrl, '封面');
        await cleanupStorageByUrl(donationQrUrl, '赞赏码');
        setShowToast({ message: `创建失败：${error.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        setLoading(false);
      } else {
        setShowToast({ message: '专属空间创建成功！', type: 'success' });
        setTimeout(() => {
          router.push('/admin/albums');
        }, 1000);
      }
    } catch (error: any) {
      setShowToast({ message: `创建失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pt-6">
      <button
        onClick={() => router.back()}
        className="w-9 h-9 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      <div className="space-y-1">
        <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          创建专属空间 ✨
        </h1>
        <p className="text-sm text-[#5D4037]/60">精简配置后再发布，减少后续反复修改</p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-3xl border border-[#5D4037]/10 shadow-sm overflow-hidden"
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
          <section className="p-5 sm:p-6 space-y-5 border-b border-[#5D4037]/10 lg:border-b-0 lg:border-r">
            <div className="space-y-3">
              <h2 className="text-base font-semibold text-[#5D4037]">基础信息</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-[#5D4037]/80 mb-1.5">空间名称</label>
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder="例如：小美的专属空间"
                    className="w-full h-11 px-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC857]/60"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[#5D4037]/80 mb-1.5">收件人名称</label>
                  <input
                    type="text"
                    value={formData.recipient_name}
                    onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                    placeholder="例如：小美、拾光者"
                    className="w-full h-11 px-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC857]/60"
                  />
                </div>
              </div>
              <p className="text-xs text-[#5D4037]/55">收件人名称会展示在信封 “To” 后面，默认值为“拾光者”。</p>
            </div>

            <div className="rounded-2xl border border-[#5D4037]/10 p-4 space-y-3 bg-[#FFFBF0]/50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex items-center gap-2 text-sm text-[#5D4037]">
                  <input
                    type="checkbox"
                    checked={formData.auto_generate_key}
                    onChange={(e) => setFormData({ ...formData, auto_generate_key: e.target.checked })}
                    className="w-4 h-4 text-[#FFC857] rounded focus:ring-[#FFC857]"
                  />
                  自动生成访问密钥
                  <Sparkles className="w-4 h-4 text-[#FFC857]" />
                </label>
                <span className="text-xs text-[#5D4037]/60">
                  {formData.auto_generate_key ? '系统会在创建时生成 8 位密钥' : '手动输入 8 位大写字母或数字'}
                </span>
              </div>
              {!formData.auto_generate_key && (
                <div>
                  <label className="block text-sm text-[#5D4037]/80 mb-1.5">访问密钥</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={formData.access_key}
                      onChange={(e) => setFormData({ ...formData, access_key: normalizeAccessKey(e.target.value) })}
                      placeholder="输入8位密钥"
                      maxLength={8}
                      className="flex-1 h-11 px-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC857]/60 font-mono tracking-wider"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, access_key: generateRandomKey() })}
                      className="h-11 px-3 bg-[#FFC857]/20 text-[#5D4037] rounded-xl hover:bg-[#FFC857]/35 transition-colors"
                      title="生成随机密钥"
                    >
                      <Key className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-3 rounded-2xl border border-[#5D4037]/10 p-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-base font-semibold text-[#5D4037]">欢迎内容</h2>
                <label className="inline-flex items-center gap-2 text-sm text-[#5D4037]">
                  <input
                    type="checkbox"
                    checked={formData.enable_welcome_letter}
                    onChange={(e) => setFormData({ ...formData, enable_welcome_letter: e.target.checked })}
                    className="w-4 h-4 text-[#FFC857] rounded focus:ring-[#FFC857]"
                  />
                  启用欢迎信显示
                </label>
              </div>
              {formData.enable_welcome_letter ? (
                <textarea
                  value={formData.welcome_letter}
                  onChange={(e) => setFormData({ ...formData, welcome_letter: e.target.value })}
                  placeholder="写一段简短欢迎语，用户打开空间时可见"
                  rows={4}
                  className="w-full px-3 py-2.5 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC857]/60 resize-none"
                />
              ) : (
                <div className="text-sm text-[#5D4037]/50 bg-[#5D4037]/5 rounded-xl p-3">
                  已关闭欢迎信显示，可在空间管理页随时开启。
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-2xl border border-[#5D4037]/10 p-4">
                <label className="block text-sm text-[#5D4037]/80 mb-1.5">有效期</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      expiry_mode: 'days',
                      expiry_date: getDateAfterDaysUTC8(prev.expiry_days),
                    }))}
                    className={`h-8 px-3 rounded-lg text-xs border transition-colors ${
                      formData.expiry_mode === 'days'
                        ? 'bg-[#FFC857]/20 border-[#FFC857]/40 text-[#5D4037]'
                        : 'bg-white border-[#5D4037]/15 text-[#5D4037]/70 hover:bg-[#5D4037]/5'
                    }`}
                  >
                    按天数
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormData((prev) => ({
                      ...prev,
                      expiry_mode: 'date',
                      expiry_date: prev.expiry_date || getDateAfterDaysUTC8(prev.expiry_days),
                    }))}
                    className={`h-8 px-3 rounded-lg text-xs border transition-colors ${
                      formData.expiry_mode === 'date'
                        ? 'bg-[#FFC857]/20 border-[#FFC857]/40 text-[#5D4037]'
                        : 'bg-white border-[#5D4037]/15 text-[#5D4037]/70 hover:bg-[#5D4037]/5'
                    }`}
                  >
                    指定日期
                  </button>
                </div>

                {formData.expiry_mode === 'days' ? (
                  <>
                    <input
                      type="number"
                      value={formData.expiry_days}
                      onChange={(e) => {
                        const days = parseInt(e.target.value, 10) || 7;
                        setFormData({
                          ...formData,
                          expiry_days: days,
                          expiry_date: getDateAfterDaysUTC8(days),
                        });
                      }}
                      min="1"
                      max="365"
                      className="w-full h-11 px-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC857]/60"
                    />
                    <p className="text-xs text-[#5D4037]/55 mt-2">
                      预计到期：{formatDateDisplayUTC8(getDateTimeAfterDaysUTC8(formData.expiry_days))}
                    </p>
                  </>
                ) : (
                  <>
                    <input
                      type="date"
                      value={selectedExpiryDate}
                      min={todayDate}
                      onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })}
                      className="w-full h-11 px-3 border border-[#5D4037]/20 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#FFC857]/60"
                    />
                    <p className="text-xs text-[#5D4037]/55 mt-2">
                      到期日期：{formatDateDisplayUTC8(`${selectedExpiryDate} 23:59:59`)}（{customExpiryDays} 天后）
                    </p>
                  </>
                )}
              </div>
              <div className="rounded-2xl border border-[#5D4037]/10 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="text-sm font-medium text-[#5D4037]">打赏功能</p>
                    <p className="text-xs text-[#5D4037]/55">可在这里直接上传赞赏码，也可创建后再上传</p>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm text-[#5D4037] whitespace-nowrap flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={formData.enable_tipping}
                      onChange={(e) => setFormData({ ...formData, enable_tipping: e.target.checked })}
                      className="w-4 h-4 text-[#FFC857] rounded focus:ring-[#FFC857]"
                    />
                    <span className="whitespace-nowrap">{formData.enable_tipping ? '已开启' : '已关闭'}</span>
                  </label>
                </div>

                {formData.enable_tipping && (
                  <div>
                    {!donationQrPreview ? (
                      <div className="border border-dashed border-[#5D4037]/20 rounded-xl p-3">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleDonationQrSelect}
                          className="hidden"
                          id="donation-qr-upload"
                        />
                        <label htmlFor="donation-qr-upload" className="cursor-pointer flex items-center gap-2 text-[#5D4037]/70">
                          <QrCode className="w-4 h-4" />
                          <span className="text-xs">上传赞赏码（可选）</span>
                        </label>
                      </div>
                    ) : (
                      <div className="relative rounded-xl overflow-hidden border border-[#5D4037]/15">
                        <img src={donationQrPreview} alt="赞赏码预览" className="w-full h-24 object-contain bg-white" />
                        <button
                          type="button"
                          onClick={removeDonationQr}
                          className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                          title="移除赞赏码"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="p-5 sm:p-6 space-y-4 bg-gradient-to-b from-[#FFFBF0] to-white">
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-[#5D4037]">封面图片</h2>
              <p className="text-xs text-[#5D4037]/55">建议 16:9 横图，上传后会自动压缩优化。</p>
            </div>

            {!coverPreview ? (
              <div className="border-2 border-dashed border-[#5D4037]/20 rounded-2xl p-5 text-center hover:border-[#FFC857] transition-colors">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleCoverSelect}
                  className="hidden"
                  id="cover-upload"
                />
                <label htmlFor="cover-upload" className="cursor-pointer block">
                  <Upload className="w-10 h-10 text-[#5D4037]/35 mx-auto mb-2" />
                  <p className="text-sm text-[#5D4037]/70">点击上传封面（最大 5MB）</p>
                  <p className="text-xs text-[#5D4037]/45 mt-1">用于专属空间列表封面展示</p>
                </label>
              </div>
            ) : (
              <div className="relative rounded-2xl overflow-hidden border border-[#5D4037]/15">
                <img src={coverPreview} alt="封面预览" className="w-full aspect-video object-cover" />
                <button
                  type="button"
                  onClick={removeCover}
                  className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                  title="移除封面"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-[#5D4037]/10 bg-white p-4 space-y-2">
              <h3 className="text-sm font-semibold text-[#5D4037]">配置摘要</h3>
              <div className="flex items-center justify-between text-sm text-[#5D4037]/70">
                <span>访问密钥</span>
                <span>{formData.auto_generate_key ? '自动生成' : '手动输入'}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#5D4037]/70">
                <span>欢迎信显示</span>
                <span>{formData.enable_welcome_letter ? '开启' : '关闭'}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#5D4037]/70">
                <span>打赏功能</span>
                <span>{formData.enable_tipping ? '开启' : '关闭'}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#5D4037]/70">
                <span>赞赏码</span>
                <span>{formData.enable_tipping ? (donationQrFile ? '已选择' : '未上传') : '未启用'}</span>
              </div>
              <div className="flex items-center justify-between text-sm text-[#5D4037]/70">
                <span>有效期</span>
                <span>
                  {formData.expiry_mode === 'days'
                    ? `${formData.expiry_days} 天`
                    : `至 ${formatDateDisplayUTC8(`${selectedExpiryDate} 23:59:59`)}`}
                </span>
              </div>
            </div>
          </aside>
        </div>

        <div className="px-5 py-4 sm:px-6 sm:py-5 border-t border-[#5D4037]/10 flex flex-col-reverse sm:flex-row gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="sm:flex-1 h-11 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="sm:flex-1 h-11 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
          >
            {loading ? '创建中...' : '创建空间'}
          </button>
        </div>
      </form>

      {/* Toast通知 */}
      <AnimatePresence>
        {showToast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <div className={`flex items-center gap-3 px-6 py-3.5 rounded-2xl shadow-lg backdrop-blur-sm ${
              showToast.type === 'success'
                ? 'bg-green-500/95 text-white'
                : showToast.type === 'warning'
                ? 'bg-orange-500/95 text-white'
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : showToast.type === 'warning' ? (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <span className="font-medium">{showToast.message}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}



