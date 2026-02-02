'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { FolderHeart, Plus, Trash2, Key, Link as LinkIcon, QrCode, Edit, Eye, Calendar, Copy, CheckCircle, XCircle, Heart, Upload } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Album {
  id: string;
  access_key: string;
  title: string;
  cover_url: string;
  welcome_letter: string;
  recipient_name: string;
  enable_tipping: boolean;
  donation_qr_code_url: string | null;
  created_at: string;
  expires_at: string | null;
}

export default function AlbumsPage() {
  const router = useRouter();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null);
  const [showQrModal, setShowQrModal] = useState<string | null>(null);
  const [newAccessKey, setNewAccessKey] = useState('');
  const [editingExpiry, setEditingExpiry] = useState<Album | null>(null);
  const [newExpiryDays, setNewExpiryDays] = useState(7);
  const [editingRecipient, setEditingRecipient] = useState<Album | null>(null);
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newWelcomeLetter, setNewWelcomeLetter] = useState('');
  const [editingDonation, setEditingDonation] = useState<Album | null>(null);
  const [uploadingQrCode, setUploadingQrCode] = useState(false);
  const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    setLoading(true);
    const supabase = createClient();

    const { data, error } = await supabase
      .from('albums')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data) {
      // 过滤掉照片墙系统相册
      const filteredAlbums = data.filter((album: Album) =>
        album.id !== '00000000-0000-0000-0000-000000000000'
      );
      setAlbums(filteredAlbums);
    }
    setLoading(false);
  };

  const handleDelete = async (id: string, title: string) => {
    setDeletingAlbum(albums.find(a => a.id === id) || null);
  };

  const confirmDelete = async () => {
    if (!deletingAlbum) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('albums')
      .delete()
      .eq('id', deletingAlbum.id);

    setDeletingAlbum(null);

    if (!error) {
      loadAlbums();
      setShowToast({ message: '专属空间已成功删除', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `删除失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateKey = async () => {
    if (!editingAlbum || !newAccessKey) return;

    const supabase = createClient();

    // 检查新密钥是否已被其他空间使用
    const { data: existing } = await supabase
      .from('albums')
      .select('id')
      .eq('access_key', newAccessKey)
      .neq('id', editingAlbum.id)
      .single();

    if (existing) {
      setShowToast({ message: '该访问密钥已被其他空间使用，请使用其他密钥', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { error } = await supabase
      .from('albums')
      .update({ access_key: newAccessKey })
      .eq('id', editingAlbum.id);

    if (!error) {
      setEditingAlbum(null);
      setNewAccessKey('');
      loadAlbums();
      setShowToast({ message: '访问密钥已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateExpiry = async () => {
    if (!editingExpiry) return;

    const supabase = createClient();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + newExpiryDays);

    const { error } = await supabase
      .from('albums')
      .update({ expires_at: expiresAt.toISOString() })
      .eq('id', editingExpiry.id);

    if (!error) {
      setEditingExpiry(null);
      setNewExpiryDays(7);
      loadAlbums();
      setShowToast({ message: '有效期已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateRecipient = async () => {
    if (!editingRecipient) return;

    const supabase = createClient();
    const { error } = await supabase
      .from('albums')
      .update({
        recipient_name: newRecipientName || '拾光者',
        welcome_letter: newWelcomeLetter
      })
      .eq('id', editingRecipient.id);

    if (!error) {
      setEditingRecipient(null);
      setNewRecipientName('');
      setNewWelcomeLetter('');
      loadAlbums();
      setShowToast({ message: '收件人和信内容已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleToggleDonation = async (album: Album) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('albums')
      .update({ enable_tipping: !album.enable_tipping })
      .eq('id', album.id);

    if (!error) {
      loadAlbums();
      setShowToast({
        message: album.enable_tipping ? '打赏功能已关闭' : '打赏功能已开启',
        type: 'success'
      });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUploadQrCode = async (album: Album, file: File) => {
    setUploadingQrCode(true);

    try {
      const { uploadToCosDirect } = await import('@/lib/storage/cos-upload-client');
      const fileExt = file.name.split('.').pop();
      const fileName = `donation_qr_${album.id}_${Date.now()}.${fileExt}`;

      const cdnUrl = await uploadToCosDirect(file, fileName, 'albums');

      const supabase = createClient();
      const { error: updateError } = await supabase
        .from('albums')
        .update({ donation_qr_code_url: cdnUrl })
        .eq('id', album.id);

      setUploadingQrCode(false);

      if (!updateError) {
        loadAlbums();
        setShowToast({ message: '赞赏码已上传', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: `更新失败：${updateError.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
      }
    } catch (error: any) {
      setUploadingQrCode(false);
      setShowToast({ message: `上传失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const copyAccessLink = (accessKey: string) => {
    const link = `${window.location.origin}/album/${accessKey}`;
    navigator.clipboard.writeText(link);
    setShowToast({ message: '访问链接已复制到剪贴板！', type: 'success' });
    setTimeout(() => setShowToast(null), 3000);
  };

  const generateQrCode = (accessKey: string) => {
    const link = `${window.location.origin}/album/${accessKey}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  };

  return (
    <div className="space-y-6 pt-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'Ma Shan Zheng', 'ZCOOL KuaiLe', cursive" }}>
            专属空间管理 💝
          </h1>
          <p className="text-sm text-[#5D4037]/60">管理专属返图空间</p>
        </div>
        <button
          onClick={() => router.push('/admin/albums/new')}
          className="flex items-center justify-center gap-2 px-6 py-3 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all whitespace-nowrap"
        >
          <Plus className="w-5 h-5" />
          创建空间
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-sm text-[#5D4037]/60">加载中...</p>
        </div>
      ) : albums.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-[#5D4037]/10">
          <FolderHeart className="w-16 h-16 text-[#5D4037]/20 mx-auto mb-4" />
          <p className="text-[#5D4037]/60">暂无专属空间</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          <AnimatePresence>
            {albums.map((album) => (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-2xl overflow-hidden shadow-sm border border-[#5D4037]/10 hover:shadow-md transition-shadow"
              >
                {album.cover_url && (
                  <div className="aspect-video relative">
                    <img
                      src={album.cover_url}
                      alt={album.title}
                      className="w-full h-full object-cover"
                    />
                  </div>
                )}
                <div className="p-4">
                  <h3 className="font-bold text-[#5D4037] mb-2">{album.title || '未命名空间'}</h3>

                  <div className="flex items-center gap-2 mb-3 p-2 bg-[#FFFBF0] rounded-lg">
                    <Key className="w-4 h-4 text-[#FFC857]" />
                    <code className="text-xs text-[#5D4037] font-mono flex-1">{album.access_key}</code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(album.access_key);
                        setShowToast({ message: '密钥已复制到剪贴板', type: 'success' });
                        setTimeout(() => setShowToast(null), 3000);
                      }}
                      className="text-[#5D4037] hover:text-[#FFC857] transition-colors"
                      title="复制密钥"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => {
                        setEditingAlbum(album);
                        setNewAccessKey(album.access_key);
                      }}
                      className="text-[#5D4037] hover:text-[#FFC857] transition-colors"
                      title="修改密钥"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-3 p-2 bg-pink-50 rounded-lg">
                    <div className="flex-1">
                      <div className="text-xs text-pink-600 mb-1">
                        收件人: {album.recipient_name || '拾光者'}
                      </div>
                      {album.welcome_letter && (
                        <p className="text-xs text-[#5D4037]/60 line-clamp-2">
                          {album.welcome_letter}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        setEditingRecipient(album);
                        setNewRecipientName(album.recipient_name || '');
                        setNewWelcomeLetter(album.welcome_letter || '');
                      }}
                      className="text-pink-600 hover:text-pink-700 transition-colors"
                      title="编辑收件人和信内容"
                    >
                      <Edit className="w-3 h-3" />
                    </button>
                  </div>

                  {album.expires_at && (
                    <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 rounded-lg">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-blue-600 flex-1">
                        有效期至: {new Date(album.expires_at).toLocaleDateString('zh-CN')}
                      </span>
                      <button
                        onClick={() => {
                          setEditingExpiry(album);
                          const daysRemaining = Math.ceil((new Date(album.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                          setNewExpiryDays(Math.max(1, daysRemaining));
                        }}
                        className="text-blue-600 hover:text-blue-700 transition-colors"
                      >
                        <Edit className="w-3 h-3" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-3 p-2 bg-orange-50 rounded-lg">
                    <Heart className={`w-4 h-4 ${album.enable_tipping ? 'text-orange-600 fill-orange-600' : 'text-orange-400'}`} />
                    <span className="text-xs text-orange-600 flex-1">
                      打赏功能: {album.enable_tipping ? '已开启' : '已关闭'}
                    </span>
                    <button
                      onClick={() => handleToggleDonation(album)}
                      className="text-orange-600 hover:text-orange-700 transition-colors"
                      title={album.enable_tipping ? '关闭打赏' : '开启打赏'}
                    >
                      {album.enable_tipping ? <XCircle className="w-3 h-3" /> : <CheckCircle className="w-3 h-3" />}
                    </button>
                    {album.enable_tipping && (
                      <label className="cursor-pointer text-orange-600 hover:text-orange-700 transition-colors">
                        <Upload className="w-3 h-3" />
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleUploadQrCode(album, file);
                          }}
                        />
                      </label>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => router.push(`/admin/albums/${album.id}`)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full text-sm font-medium hover:shadow-md active:scale-95 transition-all"
                    >
                      <Eye className="w-4 h-4" />
                      查看详情
                    </button>
                    <button
                      onClick={() => copyAccessLink(album.access_key)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-[#FFC857]/20 text-[#5D4037] rounded-full text-sm font-medium hover:bg-[#FFC857]/30 active:scale-95 transition-all"
                    >
                      <LinkIcon className="w-4 h-4" />
                      复制链接
                    </button>
                    <button
                      onClick={() => setShowQrModal(album.access_key)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-50 text-blue-600 rounded-full text-sm font-medium hover:bg-blue-100 active:scale-95 transition-all"
                    >
                      <QrCode className="w-4 h-4" />
                      二维码
                    </button>
                    <button
                      onClick={() => handleDelete(album.id, album.title)}
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-red-50 text-red-600 rounded-full text-sm font-medium hover:bg-red-100 active:scale-95 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {editingAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setEditingAlbum(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
            <h3 className="text-xl font-bold text-[#5D4037] mb-4">修改访问密钥</h3>
            <p className="text-sm text-[#5D4037]/60 mb-4">空间：{editingAlbum.title}</p>
            <input
              type="text"
              value={newAccessKey}
              onChange={(e) => setNewAccessKey(e.target.value.toUpperCase())}
              placeholder="输入新密钥（8位字符）"
              maxLength={8}
              className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 mb-4 font-mono text-lg tracking-wider transition-all"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setEditingAlbum(null)}
                className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
              >
                取消
              </button>
              <button
                onClick={handleUpdateKey}
                className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all"
              >
                确认修改
              </button>
            </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingExpiry && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setEditingExpiry(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">修改有效期</h3>
              <p className="text-sm text-[#5D4037]/60 mb-4">空间：{editingExpiry.title}</p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-[#5D4037] mb-3">
                  快捷选项
                </label>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[7, 30, 90, 180].map((days) => (
                    <button
                      key={days}
                      onClick={() => setNewExpiryDays(days)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                        newExpiryDays === days
                          ? 'bg-[#FFC857] text-[#5D4037] shadow-sm'
                          : 'bg-[#5D4037]/5 text-[#5D4037]/60 hover:bg-[#5D4037]/10'
                      }`}
                    >
                      {days}天
                    </button>
                  ))}
                </div>
                <label className="block text-sm font-medium text-[#5D4037] mb-2">
                  自定义天数
                </label>
                <input
                  type="number"
                  value={newExpiryDays}
                  onChange={(e) => setNewExpiryDays(parseInt(e.target.value) || 1)}
                  min="1"
                  max="365"
                  className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 transition-all"
                />
                <p className="text-xs text-[#5D4037]/60 mt-2">
                  新的过期时间：{new Date(Date.now() + newExpiryDays * 24 * 60 * 60 * 1000).toLocaleDateString('zh-CN')}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingExpiry(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateExpiry}
                  className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all"
                >
                  确认修改
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showQrModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setShowQrModal(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
            <h3 className="text-xl font-bold text-[#5D4037] mb-4">访问二维码</h3>
            <div className="flex justify-center mb-4">
              <img src={generateQrCode(showQrModal)} alt="QR Code" className="w-64 h-64" />
            </div>
            <p className="text-sm text-[#5D4037]/60 text-center mb-4">
              扫描二维码访问专属空间
            </p>
            <button
              onClick={() => setShowQrModal(null)}
              className="w-full px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all"
            >
              关闭
            </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editingRecipient && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setEditingRecipient(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">编辑收件人和信内容</h3>
              <p className="text-sm text-[#5D4037]/60 mb-4">空间：{editingRecipient.title}</p>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[#5D4037] mb-2">
                  收件人名称
                </label>
                <input
                  type="text"
                  value={newRecipientName}
                  onChange={(e) => setNewRecipientName(e.target.value)}
                  placeholder="例如：小美、拾光者"
                  className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 transition-all"
                  autoFocus
                />
                <p className="text-xs text-[#5D4037]/60 mt-1">
                  将显示在信封上的"To"后面，默认为"拾光者"
                </p>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-[#5D4037] mb-2">
                  信内容
                </label>
                <textarea
                  value={newWelcomeLetter}
                  onChange={(e) => setNewWelcomeLetter(e.target.value)}
                  placeholder="写下你想对收件人说的话..."
                  rows={4}
                  className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 transition-all resize-none"
                />
                <p className="text-xs text-[#5D4037]/60 mt-1">
                  收件人打开专属空间时会看到这段话
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingRecipient(null);
                    setNewRecipientName('');
                    setNewWelcomeLetter('');
                  }}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateRecipient}
                  className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all"
                >
                  确认修改
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deletingAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setDeletingAlbum(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">⚠️ 危险操作警告</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  您即将删除专属空间：<span className="font-bold">{deletingAlbum.title}</span>
                </p>
                <div className="bg-red-50 rounded-xl p-4 text-left mb-4">
                  <p className="text-sm text-red-800 font-medium mb-2">此操作将永久删除：</p>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• 所有照片文件</li>
                    <li>• 所有文件夹</li>
                    <li>• 所有用户绑定关系</li>
                    <li>• 所有相关数据</li>
                  </ul>
                </div>
                <p className="text-sm text-red-600 font-bold">此操作不可撤销！</p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeletingAlbum(null)}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all"
                >
                  确认删除
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
