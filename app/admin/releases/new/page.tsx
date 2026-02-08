'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ArrowLeft, Upload, CheckCircle, XCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export default function NewReleasePage() {
  const [version, setVersion] = useState('');
  const [platform, setPlatform] = useState('Android');
  const [updateLog, setUpdateLog] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!version || !file) {
      setShowToast({ message: '请填写版本号并选择文件', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const maxFileSize = 100 * 1024 * 1024;
    if (file.size > maxFileSize) {
      setShowToast({ message: '安装包大小超过 100MB 限制', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setUploading(true);

    try {
      // 上传文件到Supabase Storage（APK专用桶）
      const supabase = createClient();
      if (!supabase) {
        throw new Error('服务初始化失败，请刷新后重试');
      }
      const filename = `${Date.now()}_${file.name}`;
      const filePath = `releases/${filename}`;
      const contentType = platform === 'Android'
        ? (file.type || 'application/vnd.android.package-archive')
        : file.type;

      const { error: uploadError } = await supabase.storage
        .from('apk-releases')
        .upload(filePath, file, {
          cacheControl: '31536000', // 缓存1年
          upsert: false,
          contentType,
        });

      if (uploadError) throw uploadError;

      // 获取公开访问URL
      const { data: { publicUrl } } = supabase.storage
        .from('apk-releases')
        .getPublicUrl(filePath);

      // 保存到数据库
      const { error } = await supabase
        .from('app_releases')
        .insert({
          version,
          platform,
          download_url: publicUrl,
          update_log: updateLog,
          force_update: forceUpdate,
        });

      if (error) throw error;

      setShowToast({ message: '版本发布成功', type: 'success' });
      setTimeout(() => {
        window.location.href = '/admin/releases';
      }, 1500);
    } catch (error) {
      console.error('发布失败:', error);
      setShowToast({ message: '发布失败，请重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6 pt-6">
      {/* 页面标题 */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => window.location.href = '/admin/releases'}
          className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037]" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            发布新版本 🚀
          </h1>
          <p className="text-sm text-[#5D4037]/60">上传应用安装包</p>
        </div>
      </div>

      {/* 表单 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 shadow-sm border border-[#5D4037]/10 space-y-6">
        {/* 版本号 */}
        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            版本号 *
          </label>
          <input
            type="text"
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="例如: 1.0.0"
            className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:border-[#FFC857] focus:outline-none transition-colors"
            required
          />
        </div>

        {/* 平台 */}
        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            平台 *
          </label>
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:border-[#FFC857] focus:outline-none transition-colors"
            required
          >
            <option value="Android">Android</option>
            <option value="iOS">iOS</option>
            <option value="HarmonyOS">HarmonyOS</option>
            <option value="Windows">Windows</option>
            <option value="MacOS">MacOS</option>
            <option value="Linux">Linux</option>
          </select>
        </div>

        {/* 更新日志 */}
        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            更新日志
          </label>
          <textarea
            value={updateLog}
            onChange={(e) => setUpdateLog(e.target.value)}
            placeholder="描述本次更新的内容..."
            rows={6}
            className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:border-[#FFC857] focus:outline-none transition-colors resize-none"
          />
        </div>

        {/* 强制更新开关 */}
        <div className="flex items-center justify-between p-4 bg-[#FFC857]/10 rounded-xl border-2 border-[#FFC857]/30">
          <div className="flex-1">
            <label className="block text-sm font-medium text-[#5D4037] mb-1">
              强制更新 🔒
            </label>
            <p className="text-xs text-[#5D4037]/60">
              开启后，用户必须更新才能继续使用应用（弹窗不可关闭）
            </p>
          </div>
          <button
            type="button"
            onClick={() => setForceUpdate(!forceUpdate)}
            className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
              forceUpdate ? 'bg-[#FFC857]' : 'bg-[#5D4037]/20'
            }`}
          >
            <span
              className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform ${
                forceUpdate ? 'translate-x-7' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 文件上传 */}
        <div>
          <label className="block text-sm font-medium text-[#5D4037] mb-2">
            安装包文件 *
          </label>
          <div className="relative">
            <input
              type="file"
              onChange={handleFileChange}
              accept=".apk,.ipa,.exe,.dmg,.zip,.deb,.rpm,.AppImage,.tar.gz"
              className="hidden"
              id="file-upload"
              required
            />
            <label
              htmlFor="file-upload"
              className="flex items-center justify-center gap-3 w-full px-6 py-4 border-2 border-dashed border-[#5D4037]/20 rounded-xl hover:border-[#FFC857] transition-colors cursor-pointer"
            >
              <Upload className="w-5 h-5 text-[#5D4037]/60" />
              <span className="text-[#5D4037]/60">
                {file ? file.name : '点击选择文件'}
              </span>
            </label>
          </div>
          {file && (
            <p className="text-xs text-[#5D4037]/60 mt-2">
              文件大小: {(file.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={uploading}
          className="w-full px-6 py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? '发布中...' : '发布版本'}
        </button>
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
                : 'bg-red-500/95 text-white'
            }`}>
              {showToast.type === 'success' ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
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
