'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Key, Sparkles, CheckCircle, XCircle, AlertCircle, Upload, Image as ImageIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { uploadToCosDirect } from '@/lib/storage/cos-upload-client';

export default function NewAlbumPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    title: '',
    access_key: '',
    welcome_letter: '',
    recipient_name: '',
    enable_tipping: true,
    enable_welcome_letter: true,
    auto_generate_key: true,
    expiry_days: 7,
  });

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const supabase = createClient();
      const accessKey = formData.auto_generate_key ? generateRandomKey() : formData.access_key;

      if (!accessKey) {
        setShowToast({ message: '请输入访问密钥', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        setLoading(false);
        return;
      }

      // 检查密钥是否已存在
      const { data: existing } = await supabase
        .from('albums')
        .select('id')
        .eq('access_key', accessKey)
        .single();

      if (existing) {
        setShowToast({ message: '该访问密钥已存在，请使用其他密钥', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        setLoading(false);
        return;
      }

      // 上传封面图片（如果有）
      let coverUrl = null;
      if (coverFile) {
        try {
          const timestamp = Date.now();
          const ext = coverFile.name.split('.').pop();
          const fileName = `cover_${timestamp}.${ext}`;
          coverUrl = await uploadToCosDirect(coverFile, fileName, 'albums');
        } catch (uploadError: any) {
          setShowToast({ message: `封面上传失败：${uploadError.message}`, type: 'error' });
          setTimeout(() => setShowToast(null), 3000);
          setLoading(false);
          return;
        }
      }

      // 计算有效期
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + formData.expiry_days);

      const { error } = await supabase.from('albums').insert({
        title: formData.title || '未命名空间',
        access_key: accessKey,
        cover_url: coverUrl,
        welcome_letter: formData.welcome_letter,
        recipient_name: formData.recipient_name || '拾光者',
        enable_tipping: formData.enable_tipping,
        enable_welcome_letter: formData.enable_welcome_letter,
        expires_at: expiresAt.toISOString(),
      });

      if (error) {
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
    <div className="max-w-2xl mx-auto space-y-6 pt-6">
      <button
        onClick={() => router.back()}
        className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          创建专属空间 ✨
        </h1>
        <p className="text-sm text-[#5D4037]/60">为模特创建专属返图空间</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-4 sm:p-6 space-y-6 border border-[#5D4037]/10">
        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            空间名称
          </label>
          <input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="例如：小美的专属空间"
            className="w-full px-4 py-2 border border-[#5D4037]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFC857]"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            封面图片
          </label>
          {!coverPreview ? (
            <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleCoverSelect}
                className="hidden"
                id="cover-upload"
              />
              <label htmlFor="cover-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                <p className="text-sm text-[#5D4037]/60">
                  点击上传封面图片（最大5MB）
                </p>
                <p className="text-xs text-[#5D4037]/40 mt-1">
                  将显示在用户的返图列表中
                </p>
              </label>
            </div>
          ) : (
            <div className="relative border-2 border-[#5D4037]/20 rounded-xl overflow-hidden">
              <img
                src={coverPreview}
                alt="封面预览"
                className="w-full h-48 object-cover"
              />
              <button
                type="button"
                onClick={removeCover}
                className="absolute top-2 right-2 w-8 h-8 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={formData.auto_generate_key}
              onChange={(e) => setFormData({ ...formData, auto_generate_key: e.target.checked })}
              className="w-4 h-4 text-[#FFC857] rounded focus:ring-[#FFC857]"
            />
            <span className="text-sm text-[#5D4037]">自动生成访问密钥</span>
            <Sparkles className="w-4 h-4 text-[#FFC857]" />
          </label>

          {!formData.auto_generate_key && (
            <div>
              <label className="block text-sm font-medium text-[#5D4037] mb-2">
                访问密钥
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={formData.access_key}
                  onChange={(e) => setFormData({ ...formData, access_key: e.target.value.toUpperCase() })}
                  placeholder="输入8位密钥"
                  maxLength={8}
                  className="flex-1 px-4 py-2 border border-[#5D4037]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFC857] font-mono"
                />
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, access_key: generateRandomKey() })}
                  className="px-4 py-2 bg-[#FFC857]/20 text-[#5D4037] rounded-lg hover:bg-[#FFC857]/30 transition-colors"
                >
                  <Key className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            收件人名称
          </label>
          <input
            type="text"
            value={formData.recipient_name}
            onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
            placeholder="例如：小美、拾光者"
            className="w-full px-4 py-2 border border-[#5D4037]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFC857]"
          />
          <p className="text-xs text-[#5D4037]/60 mt-1">
            将显示在信封上的"To"后面，默认为"拾光者"
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            欢迎信函
          </label>
          <textarea
            value={formData.welcome_letter}
            onChange={(e) => setFormData({ ...formData, welcome_letter: e.target.value })}
            placeholder="写一段温暖的话给模特..."
            rows={4}
            className="w-full px-4 py-2 border border-[#5D4037]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFC857] resize-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            有效期（天数）
          </label>
          <input
            type="number"
            value={formData.expiry_days}
            onChange={(e) => setFormData({ ...formData, expiry_days: parseInt(e.target.value) || 7 })}
            min="1"
            max="365"
            className="w-full px-4 py-2 border border-[#5D4037]/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#FFC857]"
          />
          <p className="text-xs text-[#5D4037]/60 mt-1">
            空间将在创建后 {formData.expiry_days} 天后过期
          </p>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.enable_welcome_letter}
              onChange={(e) => setFormData({ ...formData, enable_welcome_letter: e.target.checked })}
              className="w-4 h-4 text-[#FFC857] rounded focus:ring-[#FFC857]"
            />
            <span className="text-sm text-[#5D4037]">启用欢迎信显示</span>
          </label>
        </div>

        <div>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={formData.enable_tipping}
              onChange={(e) => setFormData({ ...formData, enable_tipping: e.target.checked })}
              className="w-4 h-4 text-[#FFC857] rounded focus:ring-[#FFC857]"
            />
            <span className="text-sm text-[#5D4037]">启用打赏功能</span>
          </label>
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={loading}
            className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all disabled:opacity-50"
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
