'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Key, Sparkles } from 'lucide-react';

export default function NewAlbumPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    access_key: '',
    welcome_letter: '',
    recipient_name: '',
    enable_tipping: true,
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    const accessKey = formData.auto_generate_key ? generateRandomKey() : formData.access_key;

    if (!accessKey) {
      alert('请输入访问密钥');
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
      alert('该访问密钥已存在，请使用其他密钥');
      setLoading(false);
      return;
    }

    // 计算有效期
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + formData.expiry_days);

    const { error } = await supabase.from('albums').insert({
      title: formData.title || '未命名空间',
      access_key: accessKey,
      welcome_letter: formData.welcome_letter,
      recipient_name: formData.recipient_name || '拾光者',
      enable_tipping: formData.enable_tipping,
      expires_at: expiresAt.toISOString(),
    });

    if (error) {
      alert('创建失败：' + error.message);
      setLoading(false);
    } else {
      router.push('/admin/albums');
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-[#5D4037] hover:text-[#FFC857] transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        返回
      </button>

      <div>
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
          创建专属空间 ✨
        </h1>
        <p className="text-sm text-[#5D4037]/60">为模特创建专属返图空间</p>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-6 space-y-6 border border-[#5D4037]/10">
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
            className="flex-1 px-4 py-2 border border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 transition-colors"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-2 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md transition-shadow disabled:opacity-50"
          >
            {loading ? '创建中...' : '创建空间'}
          </button>
        </div>
      </form>
    </div>
  );
}
