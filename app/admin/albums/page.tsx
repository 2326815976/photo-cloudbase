'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { FolderHeart, Plus, Trash2, Key, Link as LinkIcon, QrCode, Edit, Eye, Calendar, Copy, CheckCircle, XCircle, Heart, Upload, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Album {
  id: string;
  access_key: string;
  title: string;
  cover_url: string;
  welcome_letter: string;
  recipient_name: string;
  enable_tipping: boolean;
  enable_welcome_letter?: boolean;
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
  const [editingCover, setEditingCover] = useState<Album | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editingTitle, setEditingTitle] = useState<Album | null>(null);
  const [newTitle, setNewTitle] = useState('');

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    setLoading(true);
    const supabase = createClient();
    if (!supabase) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await supabase
      .from('albums')
      .select('id, access_key, title, cover_url, welcome_letter, recipient_name, enable_tipping, enable_welcome_letter, donation_qr_code_url, expires_at, created_at')
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
    if (!supabase) {
      setDeletingAlbum(null);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
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

    // 验证密钥格式（8位字符，仅允许大写字母和数字）
    if (!/^[A-Z0-9]{8}$/.test(newAccessKey)) {
      setShowToast({ message: '访问密钥必须是8位大写字母或数字', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

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
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
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
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
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

  const handleUpdateTitle = async () => {
    if (!editingTitle || !newTitle.trim()) return;

    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('albums')
      .update({ title: newTitle.trim() })
      .eq('id', editingTitle.id);

    if (!error) {
      setEditingTitle(null);
      setNewTitle('');
      loadAlbums();
      setShowToast({ message: '空间名称已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleToggleWelcomeLetter = async (album: Album) => {
    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { error } = await supabase
      .from('albums')
      .update({ enable_welcome_letter: !(album.enable_welcome_letter ?? true) })
      .eq('id', album.id);

    if (!error) {
      loadAlbums();
      setShowToast({
        message: (album.enable_welcome_letter ?? true) ? '欢迎信已关闭' : '欢迎信已开启',
        type: 'success'
      });
      setTimeout(() => setShowToast(null), 3000);
    } else {
      setShowToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleToggleDonation = async (album: Album) => {
    const supabase = createClient();
    if (!supabase) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
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
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        setShowToast({ message: '请选择图片文件', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        setUploadingQrCode(false);
        return;
      }

      // 删除旧赞赏码文件
      if (album.donation_qr_code_url) {
        try {
          const { extractKeyFromURL } = await import('@/lib/storage/cos-utils');
          const oldKey = extractKeyFromURL(album.donation_qr_code_url);
          if (oldKey) {
            await fetch('/api/delete', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: oldKey }),
            });
          }
        } catch (error) {
          console.error('删除旧赞赏码失败:', error);
        }
      }

      // 使用统一的压缩工具
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);

      const { uploadToCosDirect } = await import('@/lib/storage/cos-upload-client');
      const ext = compressedFile.name.split('.').pop();
      const fileName = `donation_qr_${album.id}_${Date.now()}.${ext}`;

      const cdnUrl = await uploadToCosDirect(compressedFile, fileName, 'albums');

      const supabase = createClient();
      if (!supabase) {
        setUploadingQrCode(false);
        setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
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

  const handleUploadCover = async (album: Album, file: File) => {
    setUploadingCover(true);

    try {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        setShowToast({ message: '请选择图片文件', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        setUploadingCover(false);
        return;
      }

      // 删除旧封面文件
      if (album.cover_url) {
        try {
          const { extractKeyFromURL } = await import('@/lib/storage/cos-utils');
          const oldKey = extractKeyFromURL(album.cover_url);
          if (oldKey) {
            await fetch('/api/delete', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ key: oldKey }),
            });
          }
        } catch (error) {
          console.error('删除旧封面失败:', error);
        }
      }

      // 使用统一的压缩工具
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);

      const { uploadToCosDirect } = await import('@/lib/storage/cos-upload-client');
      const ext = compressedFile.name.split('.').pop();
      const fileName = `cover_${album.id}_${Date.now()}.${ext}`;

      const cdnUrl = await uploadToCosDirect(compressedFile, fileName, 'albums');

      const supabase = createClient();
      if (!supabase) {
        setUploadingCover(false);
        setEditingCover(null);
        setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
      const { error: updateError } = await supabase
        .from('albums')
        .update({ cover_url: cdnUrl })
        .eq('id', album.id);

      setUploadingCover(false);
      setEditingCover(null);

      if (!updateError) {
        loadAlbums();
        setShowToast({ message: '封面已更新', type: 'success' });
        setTimeout(() => setShowToast(null), 3000);
      } else {
        setShowToast({ message: `更新失败：${updateError.message}`, type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
      }
    } catch (error: any) {
      setUploadingCover(false);
      setEditingCover(null);
      setShowToast({ message: `上传失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const copyAccessLink = async (accessKey: string) => {
    const link = `${window.location.origin}/album/${accessKey}`;
    const { setClipboardText } = await import('@/lib/android');
    const success = setClipboardText(link);
    if (success) {
      setShowToast({ message: '访问链接已复制到剪贴板！', type: 'success' });
    } else {
      setShowToast({ message: '复制失败，请重试', type: 'error' });
    }
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
          <h1 className="text-2xl sm:text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <AnimatePresence>
            {albums.map((album) => (
              <motion.div
                key={album.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="bg-white rounded-3xl overflow-hidden shadow-lg border-2 border-[#5D4037]/5 hover:shadow-2xl hover:border-[#FFC857]/30 transition-all duration-300"
              >
                {/* 封面区域 */}
                {album.cover_url ? (
                  <div className="aspect-video relative group overflow-hidden">
                    <img
                      src={album.cover_url}
                      alt={album.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    <button
                      onClick={() => setEditingCover(album)}
                      className="absolute top-3 right-3 w-10 h-10 bg-white/95 backdrop-blur-sm rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg hover:scale-110 hover:bg-white"
                      title="更换封面"
                    >
                      <Upload className="w-5 h-5 text-[#5D4037]" />
                    </button>
                  </div>
                ) : (
                  <div className="aspect-video relative bg-gradient-to-br from-[#FFFBF0] to-[#FFC857]/20 flex items-center justify-center group">
                    <button
                      onClick={() => setEditingCover(album)}
                      className="flex flex-col items-center gap-2 text-[#5D4037]/40 hover:text-[#5D4037] transition-colors"
                    >
                      <Upload className="w-12 h-12" />
                      <span className="text-sm font-medium">添加封面</span>
                    </button>
                  </div>
                )}

                <div className="p-5 space-y-4">
                  {/* 标题区域 */}
                  <div className="pb-3 border-b-2 border-dashed border-[#5D4037]/10">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-xl font-bold text-[#5D4037] flex-1" style={{ fontFamily: "'ZQKNNY', cursive" }}>
                        {album.title || '未命名空间'}
                      </h3>
                      <button
                        onClick={() => {
                          setEditingTitle(album);
                          setNewTitle(album.title || '');
                        }}
                        className="w-8 h-8 rounded-lg bg-[#5D4037]/5 hover:bg-[#FFC857] text-[#5D4037] hover:text-white transition-all flex items-center justify-center flex-shrink-0"
                        title="修改空间名称"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                    <p className="text-xs text-[#5D4037]/40">
                      创建于 {new Date(album.created_at).toLocaleDateString('zh-CN')}
                    </p>
                  </div>

                  {/* 信息卡片组 */}
                  <div className="space-y-3">
                    {/* 访问密钥 */}
                    <div className="group/item p-3 bg-gradient-to-r from-[#FFFBF0] to-[#FFC857]/10 rounded-xl border border-[#FFC857]/20 hover:border-[#FFC857]/40 transition-all">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-[#FFC857] rounded-lg flex items-center justify-center">
                          <Key className="w-5 h-5 text-white" />
                        </div>
                        <span className="text-xs font-semibold text-[#5D4037]/60">访问密钥</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm text-[#5D4037] font-mono font-bold tracking-wider">
                          {album.access_key}
                        </code>
                        <button
                          onClick={async () => {
                            const { setClipboardText } = await import('@/lib/android');
                            const success = setClipboardText(album.access_key);
                            if (success) {
                              setShowToast({ message: '密钥已复制', type: 'success' });
                            } else {
                              setShowToast({ message: '复制失败，请重试', type: 'error' });
                            }
                            setTimeout(() => setShowToast(null), 3000);
                          }}
                          className="w-12 h-12 rounded-lg bg-white hover:bg-[#FFC857] text-[#5D4037] hover:text-white transition-all flex items-center justify-center shadow-sm"
                          title="复制密钥"
                        >
                          <Copy className="w-7 h-7" />
                        </button>
                        <button
                          onClick={() => {
                            setEditingAlbum(album);
                            setNewAccessKey(album.access_key);
                          }}
                          className="w-12 h-12 rounded-lg bg-white hover:bg-[#FFC857] text-[#5D4037] hover:text-white transition-all flex items-center justify-center shadow-sm"
                          title="修改密钥"
                        >
                          <Edit className="w-7 h-7" />
                        </button>
                      </div>
                    </div>

                    {/* 收件人和欢迎信 */}
                    <div className="group/item p-3 bg-gradient-to-r from-pink-50 to-pink-100/30 rounded-xl border border-pink-200/50 hover:border-pink-300 transition-all">
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1.5">
                            <div className="w-8 h-8 bg-pink-500 rounded-lg flex items-center justify-center flex-shrink-0">
                              <Heart className="w-5 h-5 text-white fill-white" />
                            </div>
                            <span className="text-xs font-semibold text-pink-700">
                              收件人: {album.recipient_name || '拾光者'}
                            </span>
                          </div>
                          {album.welcome_letter && (
                            <p className="text-xs text-[#5D4037]/70 line-clamp-2 pl-10 leading-relaxed">
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
                          className="w-12 h-12 rounded-lg bg-white hover:bg-pink-500 text-pink-600 hover:text-white transition-all flex items-center justify-center shadow-sm flex-shrink-0"
                          title="编辑收件人和信内容"
                        >
                          <Edit className="w-7 h-7" />
                        </button>
                      </div>
                    </div>

                    {/* 有效期 */}
                    {album.expires_at && (
                      <div className="group/item p-3 bg-gradient-to-r from-blue-50 to-blue-100/30 rounded-xl border border-blue-200/50 hover:border-blue-300 transition-all">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                            <Calendar className="w-5 h-5 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-blue-700 flex-1">
                            有效期至 {new Date(album.expires_at).toLocaleDateString('zh-CN')}
                          </span>
                          <button
                            onClick={() => {
                              setEditingExpiry(album);
                              const daysRemaining = Math.ceil((new Date(album.expires_at!).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                              setNewExpiryDays(Math.max(1, daysRemaining));
                            }}
                            className="w-12 h-12 rounded-lg bg-white hover:bg-blue-500 text-blue-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                          >
                            <Edit className="w-7 h-7" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* 欢迎信显示控制 */}
                    <div className="group/item p-3 bg-gradient-to-r from-purple-50 to-purple-100/30 rounded-xl border border-purple-200/50 hover:border-purple-300 transition-all">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${(album.enable_welcome_letter ?? true) ? 'bg-purple-500' : 'bg-purple-300'}`}>
                          <Mail className={`w-5 h-5 text-white ${(album.enable_welcome_letter ?? true) ? 'fill-white' : ''}`} />
                        </div>
                        <span className="text-xs font-semibold text-purple-700 flex-1">
                          欢迎信 {(album.enable_welcome_letter ?? true) ? '已开启' : '已关闭'}
                        </span>
                        <button
                          onClick={() => handleToggleWelcomeLetter(album)}
                          className="w-12 h-12 rounded-lg bg-white hover:bg-purple-500 text-purple-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                          title={(album.enable_welcome_letter ?? true) ? '关闭欢迎信' : '开启欢迎信'}
                        >
                          {(album.enable_welcome_letter ?? true) ? <XCircle className="w-7 h-7" /> : <CheckCircle className="w-7 h-7" />}
                        </button>
                      </div>
                    </div>

                    {/* 打赏功能 */}
                    <div className="group/item p-3 bg-gradient-to-r from-orange-50 to-orange-100/30 rounded-xl border border-orange-200/50 hover:border-orange-300 transition-all">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${album.enable_tipping ? 'bg-orange-500' : 'bg-orange-300'}`}>
                          <Heart className={`w-5 h-5 text-white ${album.enable_tipping ? 'fill-white' : ''}`} />
                        </div>
                        <span className="text-xs font-semibold text-orange-700 flex-1">
                          打赏功能 {album.enable_tipping ? '已开启' : '已关闭'}
                        </span>
                        <button
                          onClick={() => handleToggleDonation(album)}
                          className="w-12 h-12 rounded-lg bg-white hover:bg-orange-500 text-orange-600 hover:text-white transition-all flex items-center justify-center shadow-sm"
                          title={album.enable_tipping ? '关闭打赏' : '开启打赏'}
                        >
                          {album.enable_tipping ? <XCircle className="w-7 h-7" /> : <CheckCircle className="w-7 h-7" />}
                        </button>
                        {album.enable_tipping && (
                          <label className="w-12 h-12 rounded-lg bg-white hover:bg-orange-500 text-orange-600 hover:text-white transition-all flex items-center justify-center shadow-sm cursor-pointer">
                            <Upload className="w-7 h-7" />
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
                    </div>
                  </div>

                  {/* 操作按钮区域 */}
                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <button
                      onClick={() => router.push(`/admin/albums/${album.id}`)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-[#FFC857] text-[#5D4037] rounded-xl text-sm font-bold hover:shadow-lg hover:scale-105 active:scale-95 transition-all"
                    >
                      <Eye className="w-4 h-4" />
                      查看详情
                    </button>
                    <button
                      onClick={() => copyAccessLink(album.access_key)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-[#5D4037]/5 text-[#5D4037] rounded-xl text-sm font-bold hover:bg-[#5D4037]/10 hover:scale-105 active:scale-95 transition-all"
                    >
                      <LinkIcon className="w-4 h-4" />
                      复制链接
                    </button>
                    <button
                      onClick={() => setShowQrModal(album.access_key)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-blue-500/10 text-blue-600 rounded-xl text-sm font-bold hover:bg-blue-500/20 hover:scale-105 active:scale-95 transition-all"
                    >
                      <QrCode className="w-4 h-4" />
                      二维码
                    </button>
                    <button
                      onClick={() => handleDelete(album.id, album.title)}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-red-500/10 text-red-600 rounded-xl text-sm font-bold hover:bg-red-500/20 hover:scale-105 active:scale-95 transition-all"
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

      {/* 标题编辑弹窗 */}
      <AnimatePresence>
        {editingTitle && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => setEditingTitle(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">修改空间名称</h3>
              <p className="text-sm text-[#5D4037]/60 mb-4">当前空间：{editingTitle.title || '未命名空间'}</p>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="输入新的空间名称"
                className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 mb-4 transition-all"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingTitle(null);
                    setNewTitle('');
                  }}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium"
                >
                  取消
                </button>
                <button
                  onClick={handleUpdateTitle}
                  className="flex-1 px-4 py-2.5 bg-[#FFC857] text-[#5D4037] rounded-full font-medium hover:shadow-md active:scale-95 transition-all"
                >
                  确认修改
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 封面编辑弹窗 */}
      <AnimatePresence>
        {editingCover && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !uploadingCover && setEditingCover(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">更换封面图片</h3>
              <p className="text-sm text-[#5D4037]/60 mb-4">空间：{editingCover.title}</p>

              {editingCover.cover_url && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-[#5D4037] mb-2">当前封面：</p>
                  <img
                    src={editingCover.cover_url}
                    alt="当前封面"
                    className="w-full h-32 object-cover rounded-lg"
                  />
                </div>
              )}

              <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer mb-4">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="cover-upload-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadCover(editingCover, file);
                  }}
                  disabled={uploadingCover}
                />
                <label htmlFor="cover-upload-input" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                  <p className="text-sm text-[#5D4037]/60">
                    {uploadingCover ? '上传中...' : '点击选择新封面图片'}
                  </p>
                  <p className="text-xs text-[#5D4037]/40 mt-1">
                    支持 JPG、PNG、WebP 格式，最大 5MB
                  </p>
                </label>
              </div>

              <button
                onClick={() => setEditingCover(null)}
                disabled={uploadingCover}
                className="w-full px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
              >
                {uploadingCover ? '上传中...' : '取消'}
              </button>
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
