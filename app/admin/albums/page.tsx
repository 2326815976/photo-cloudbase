'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/cloudbase/client';
import { useRouter } from 'next/navigation';
import { FolderHeart, Plus, Trash2, Key, Link as LinkIcon, QrCode, Edit, Eye, Calendar, Copy, CheckCircle, XCircle, AlertCircle, Heart, Upload, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDateDisplayUTC8, formatDateUTC8, getDateAfterDaysUTC8, getDateTimeAfterDaysUTC8, getDaysDifference, getTodayUTC8, parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import { normalizeAccessKey } from '@/lib/utils/access-key';

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
  const [expiryMode, setExpiryMode] = useState<'days' | 'date'>('days');
  const [newExpiryDays, setNewExpiryDays] = useState(7);
  const [newExpiryDate, setNewExpiryDate] = useState(getDateAfterDaysUTC8(7));
  const [editingRecipient, setEditingRecipient] = useState<Album | null>(null);
  const [newRecipientName, setNewRecipientName] = useState('');
  const [newWelcomeLetter, setNewWelcomeLetter] = useState('');
  const [editingDonation, setEditingDonation] = useState<Album | null>(null);
  const [uploadingQrCode, setUploadingQrCode] = useState(false);
  const [deletingAlbum, setDeletingAlbum] = useState<Album | null>(null);
  const [showToast, setShowToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [editingCover, setEditingCover] = useState<Album | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [editingTitle, setEditingTitle] = useState<Album | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const todayDate = getTodayUTC8();
  const selectedExpiryDate = newExpiryDate || todayDate;
  const customExpiryDays = Math.max(getDaysDifference(todayDate, selectedExpiryDate), 0);

  useEffect(() => {
    loadAlbums();
  }, []);

  const loadAlbums = async () => {
    setLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setLoading(false);
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data, error } = await dbClient
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

    try {
      const response = await fetch(`/api/admin/albums/${deletingAlbum.id}`, {
        method: 'DELETE',
      });
      const payload = await response.json().catch(() => ({} as any));

      setDeletingAlbum(null);

      if (!response.ok) {
        throw new Error(String(payload?.error ?? '删除失败'));
      }

      loadAlbums();
      const warningMessage = String(payload?.warning ?? '').trim();
      if (warningMessage) {
        setShowToast({ message: warningMessage, type: 'warning' });
      } else {
        setShowToast({ message: '专属空间已成功删除', type: 'success' });
      }
      setTimeout(() => setShowToast(null), 3000);
    } catch (error) {
      setDeletingAlbum(null);
      setShowToast({ message: error instanceof Error ? `删除失败：${error.message}` : '删除失败', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateKey = async () => {
    if (!editingAlbum || !newAccessKey) return;
    const normalizedNewAccessKey = normalizeAccessKey(newAccessKey);

    // 验证密钥格式（8位字符，仅允许大写字母和数字）
    if (!/^[A-Z0-9]{8}$/.test(normalizedNewAccessKey)) {
      setShowToast({ message: '访问密钥必须是8位大写字母或数字', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    // 检查新密钥是否已被其他空间使用
    const { data: existing, error: existingError } = await dbClient
      .from('albums')
      .select('id')
      .eq('access_key', normalizedNewAccessKey)
      .neq('id', editingAlbum.id)
      .maybeSingle();

    if (existingError) {
      setShowToast({ message: `检查密钥失败：${existingError.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (existing) {
      setShowToast({ message: '该访问密钥已被其他空间使用，请使用其他密钥', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    const { data: updated, error } = await dbClient
      .from('albums')
      .update({ access_key: normalizedNewAccessKey })
      .eq('id', editingAlbum.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      setEditingAlbum(null);
      setNewAccessKey('');
      loadAlbums();
      setShowToast({ message: '访问密钥已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateExpiry = async () => {
    if (!editingExpiry) return;

    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const safeDays = Math.max(1, newExpiryDays || 1);

    if (expiryMode === 'date') {
      const targetDate = String(selectedExpiryDate || '').trim();
      if (!targetDate) {
        setShowToast({ message: '请选择过期日期', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
      if (targetDate < todayDate) {
        setShowToast({ message: '过期日期不能早于今天', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
    }

    const expiresAt = expiryMode === 'date'
      ? `${selectedExpiryDate} 23:59:59`
      : getDateTimeAfterDaysUTC8(safeDays);

    const { data: updated, error } = await dbClient
      .from('albums')
      .update({ expires_at: expiresAt })
      .eq('id', editingExpiry.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      setEditingExpiry(null);
      setExpiryMode('days');
      setNewExpiryDays(7);
      setNewExpiryDate(getDateAfterDaysUTC8(7));
      loadAlbums();
      setShowToast({ message: '有效期已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateRecipient = async () => {
    if (!editingRecipient) return;

    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: updated, error } = await dbClient
      .from('albums')
      .update({
        recipient_name: newRecipientName || '拾光者',
        welcome_letter: newWelcomeLetter
      })
      .eq('id', editingRecipient.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      setEditingRecipient(null);
      setNewRecipientName('');
      setNewWelcomeLetter('');
      loadAlbums();
      setShowToast({ message: '收件人和信内容已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleUpdateTitle = async () => {
    if (!editingTitle || !newTitle.trim()) return;

    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: updated, error } = await dbClient
      .from('albums')
      .update({ title: newTitle.trim() })
      .eq('id', editingTitle.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setShowToast({ message: `修改失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      setEditingTitle(null);
      setNewTitle('');
      loadAlbums();
      setShowToast({ message: '空间名称已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleToggleWelcomeLetter = async (album: Album) => {
    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: updated, error } = await dbClient
      .from('albums')
      .update({ enable_welcome_letter: !(album.enable_welcome_letter ?? true) })
      .eq('id', album.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setShowToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      loadAlbums();
      setShowToast({
        message: (album.enable_welcome_letter ?? true) ? '欢迎信已关闭' : '欢迎信已开启',
        type: 'success'
      });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const handleToggleDonation = async (album: Album) => {
    const dbClient = createClient();
    if (!dbClient) {
      setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    const { data: updated, error } = await dbClient
      .from('albums')
      .update({ enable_tipping: !album.enable_tipping })
      .eq('id', album.id)
      .select('id')
      .maybeSingle();

    if (error) {
      setShowToast({ message: `操作失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    if (!updated) {
      setShowToast({ message: '空间不存在或已删除，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (!error) {
      loadAlbums();
      setShowToast({
        message: album.enable_tipping ? '打赏功能已关闭' : '打赏功能已开启',
        type: 'success'
      });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const cleanupStorageByUrl = async (
    url: string | null | undefined,
    label: string,
    strict: boolean = false
  ) => {
    const targetUrl = String(url ?? '').trim();
    if (!targetUrl) {
      return;
    }

    try {
      const response = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({} as any));
        throw new Error(String(payload?.error ?? `删除${label}失败`));
      }
    } catch (error) {
      console.error(`删除${label}失败:`, error);
      if (strict) {
        throw error;
      }
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

      // 使用统一的压缩工具
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);

      const { uploadToCloudBaseDirect } = await import('@/lib/storage/cloudbase-upload-client');
      const ext = compressedFile.name.split('.').pop();
      const fileName = `donation_qr_${album.id}_${Date.now()}.${ext}`;

      const oldQrUrl = album.donation_qr_code_url;
      const cdnUrl = await uploadToCloudBaseDirect(compressedFile, fileName, 'albums');

      const dbClient = createClient();
      if (!dbClient) {
        await cleanupStorageByUrl(cdnUrl, '新赞赏码', false);
        setUploadingQrCode(false);
        setEditingDonation(null);
        setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
      const { data: updated, error: updateError } = await dbClient
        .from('albums')
        .update({ donation_qr_code_url: cdnUrl })
        .eq('id', album.id)
        .select('id')
        .maybeSingle();

      if (updateError) {
        await cleanupStorageByUrl(cdnUrl, '新赞赏码', false);
        throw new Error(updateError.message || '赞赏码更新失败');
      }
      if (!updated) {
        await cleanupStorageByUrl(cdnUrl, '新赞赏码', false);
        throw new Error('赞赏码更新失败：空间不存在或已删除');
      }

      // 新数据写入成功后，再清理旧文件，避免断链
      await cleanupStorageByUrl(oldQrUrl, '旧赞赏码', false);

      setUploadingQrCode(false);
      setEditingDonation(null);
      loadAlbums();
      setShowToast({ message: '赞赏码已上传', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setUploadingQrCode(false);
      setEditingDonation(null);
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

      // 使用统一的压缩工具
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);

      const { uploadToCloudBaseDirect } = await import('@/lib/storage/cloudbase-upload-client');
      const ext = compressedFile.name.split('.').pop();
      const fileName = `cover_${album.id}_${Date.now()}.${ext}`;

      const oldCoverUrl = album.cover_url;
      const cdnUrl = await uploadToCloudBaseDirect(compressedFile, fileName, 'albums');

      const dbClient = createClient();
      if (!dbClient) {
        await cleanupStorageByUrl(cdnUrl, '新封面', false);
        setUploadingCover(false);
        setEditingCover(null);
        setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
      const { data: updated, error: updateError } = await dbClient
        .from('albums')
        .update({ cover_url: cdnUrl })
        .eq('id', album.id)
        .select('id')
        .maybeSingle();

      if (updateError) {
        await cleanupStorageByUrl(cdnUrl, '新封面', false);
        throw new Error(updateError.message || '封面更新失败');
      }
      if (!updated) {
        await cleanupStorageByUrl(cdnUrl, '新封面', false);
        throw new Error('封面更新失败：空间不存在或已删除');
      }

      // 新数据写入成功后，再清理旧文件，避免断链
      await cleanupStorageByUrl(oldCoverUrl, '旧封面', false);

      setUploadingCover(false);
      setEditingCover(null);
      loadAlbums();
      setShowToast({ message: '封面已更新', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
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
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <AnimatePresence>
            {albums.map((album) => {
              const parsedExpiry = parseDateTimeUTC8(album.expires_at);
              const daysRemaining = parsedExpiry
                ? Math.ceil((parsedExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;
              const welcomeEnabled = album.enable_welcome_letter ?? true;
              const recipientLabel = album.recipient_name || '拾光者';

              return (
                <motion.div
                  key={album.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-white rounded-3xl overflow-hidden shadow-sm border border-[#5D4037]/10 hover:shadow-lg hover:border-[#FFC857]/30 transition-all"
                >
                  {album.cover_url ? (
                    <div className="aspect-video relative group overflow-hidden">
                      <img
                        src={album.cover_url}
                        alt={album.title}
                        className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button
                        onClick={() => setEditingCover(album)}
                        className="absolute top-3 right-3 h-8 px-2.5 bg-white/95 rounded-full text-xs font-medium text-[#5D4037] opacity-0 group-hover:opacity-100 transition-all"
                        title="更换封面"
                      >
                        更换封面
                      </button>
                    </div>
                  ) : (
                    <div className="aspect-video bg-gradient-to-br from-[#FFFBF0] to-[#FFC857]/20 flex items-center justify-center">
                      <button
                        onClick={() => setEditingCover(album)}
                        className="flex items-center gap-2 text-sm font-medium text-[#5D4037]/70 hover:text-[#5D4037] transition-colors"
                      >
                        <Upload className="w-4 h-4" />
                        添加封面
                      </button>
                    </div>
                  )}

                  <div className="p-4 space-y-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3
                          className="text-lg font-bold text-[#5D4037] truncate"
                          style={{ fontFamily: "'ZQKNNY', cursive" }}
                        >
                          {album.title || '未命名空间'}
                        </h3>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className="text-xs text-[#5D4037]/45">
                            创建于 {formatDateDisplayUTC8(album.created_at)}
                          </span>
                          {album.expires_at && (
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              daysRemaining !== null && daysRemaining <= 3
                                ? 'bg-red-50 text-red-600 border-red-200'
                                : 'bg-blue-50 text-blue-600 border-blue-200'
                            }`}>
                              到期 {formatDateDisplayUTC8(album.expires_at)}{daysRemaining !== null ? ` · ${Math.max(daysRemaining, 0)}天` : ''}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            setEditingTitle(album);
                            setNewTitle(album.title || '');
                          }}
                          className="w-8 h-8 rounded-lg bg-[#5D4037]/5 hover:bg-[#FFC857] text-[#5D4037] hover:text-white transition-colors flex items-center justify-center"
                          title="修改空间名称"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(album.id, album.title)}
                          className="w-8 h-8 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 transition-colors flex items-center justify-center"
                          title="删除空间"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#FFC857]/25 bg-[#FFFBF0] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-[#5D4037]/55 mb-1">访问密钥</p>
                          <code className="text-sm font-mono font-bold tracking-wider text-[#5D4037]">
                            {album.access_key}
                          </code>
                        </div>
                        <div className="flex items-center gap-1">
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
                            className="h-8 px-2 rounded-lg bg-white border border-[#5D4037]/15 text-[#5D4037] hover:bg-[#FFC857]/20 transition-colors"
                            title="复制密钥"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingAlbum(album);
                              setNewAccessKey(album.access_key);
                            }}
                            className="h-8 px-2 rounded-lg bg-white border border-[#5D4037]/15 text-[#5D4037] hover:bg-[#FFC857]/20 transition-colors"
                            title="修改密钥"
                          >
                            <Key className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-xl border border-[#5D4037]/10 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs text-[#5D4037]/55">收件人</p>
                          <p className="text-sm font-medium text-[#5D4037]">{recipientLabel}</p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingRecipient(album);
                            setNewRecipientName(album.recipient_name || '');
                            setNewWelcomeLetter(album.welcome_letter || '');
                          }}
                          className="h-8 px-2.5 rounded-lg bg-[#5D4037]/5 hover:bg-[#5D4037]/10 text-xs text-[#5D4037] transition-colors"
                          title="编辑收件人和欢迎信"
                        >
                          编辑文案
                        </button>
                      </div>
                      <p className="text-xs text-[#5D4037]/65 line-clamp-2 min-h-[2.25rem]">
                        {album.welcome_letter ? album.welcome_letter : '未设置欢迎信内容'}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleToggleWelcomeLetter(album)}
                        className={`h-10 px-3 rounded-xl text-xs font-medium border transition-colors ${
                          welcomeEnabled
                            ? 'border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100'
                            : 'border-[#5D4037]/15 bg-white text-[#5D4037]/70 hover:bg-[#5D4037]/5'
                        }`}
                        title={welcomeEnabled ? '关闭欢迎信显示' : '开启欢迎信显示'}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5" />
                          欢迎信 {welcomeEnabled ? '开启' : '关闭'}
                        </span>
                      </button>
                      <button
                        onClick={() => handleToggleDonation(album)}
                        className={`h-10 px-3 rounded-xl text-xs font-medium border transition-colors ${
                          album.enable_tipping
                            ? 'border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100'
                            : 'border-[#5D4037]/15 bg-white text-[#5D4037]/70 hover:bg-[#5D4037]/5'
                        }`}
                        title={album.enable_tipping ? '关闭打赏功能' : '开启打赏功能'}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          <Heart className={`w-3.5 h-3.5 ${album.enable_tipping ? 'fill-current' : ''}`} />
                          打赏 {album.enable_tipping ? '开启' : '关闭'}
                        </span>
                      </button>
                    </div>

                    <div className="rounded-xl border border-[#5D4037]/10 p-3 flex items-center justify-between gap-2">
                      <div>
                        <p className="text-xs text-[#5D4037]/55">赞赏码</p>
                        <p className="text-xs text-[#5D4037]/75">
                          {!album.enable_tipping
                            ? '打赏关闭，暂不可上传'
                            : album.donation_qr_code_url
                            ? '已上传，可随时更新'
                            : '未上传'}
                        </p>
                      </div>
                      <button
                        onClick={() => setEditingDonation(album)}
                        disabled={!album.enable_tipping}
                        className={`h-8 px-2.5 rounded-lg text-xs inline-flex items-center gap-1.5 border ${
                          album.enable_tipping
                            ? 'bg-white border-[#5D4037]/15 text-[#5D4037] hover:bg-[#FFC857]/20'
                            : 'cursor-not-allowed bg-[#5D4037]/5 border-[#5D4037]/10 text-[#5D4037]/40'
                        }`}
                      >
                        <Upload className="w-3.5 h-3.5" />
                        {album.donation_qr_code_url ? '更换' : '上传'}
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        onClick={() => router.push(`/admin/albums/${album.id}`)}
                        className="h-10 px-3 bg-[#FFC857] text-[#5D4037] rounded-xl text-sm font-semibold hover:shadow-sm transition-all flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-4 h-4" />
                        查看详情
                      </button>
                      <button
                        onClick={() => copyAccessLink(album.access_key)}
                        className="h-10 px-3 bg-[#5D4037]/5 text-[#5D4037] rounded-xl text-sm font-semibold hover:bg-[#5D4037]/10 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <LinkIcon className="w-4 h-4" />
                        复制链接
                      </button>
                      <button
                        onClick={() => setShowQrModal(album.access_key)}
                        className="h-10 px-3 bg-blue-50 text-blue-600 rounded-xl text-sm font-semibold hover:bg-blue-100 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <QrCode className="w-4 h-4" />
                        二维码
                      </button>
                      <button
                        onClick={() => {
                          setEditingExpiry(album);
                          const expiry = parseDateTimeUTC8(album.expires_at);
                          const fallbackDate = getDateAfterDaysUTC8(7);
                          const rawTargetDate = expiry ? formatDateUTC8(expiry) : fallbackDate;
                          const targetDate = rawTargetDate < todayDate ? todayDate : rawTargetDate;
                          const remains = Math.max(getDaysDifference(todayDate, targetDate), 1);
                          setExpiryMode('days');
                          setNewExpiryDays(remains);
                          setNewExpiryDate(targetDate);
                        }}
                        className="h-10 px-3 bg-[#5D4037]/5 text-[#5D4037] rounded-xl text-sm font-semibold hover:bg-[#5D4037]/10 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <Calendar className="w-4 h-4" />
                        改有效期
                      </button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
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
              onChange={(e) => setNewAccessKey(normalizeAccessKey(e.target.value))}
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
                <label className="block text-sm font-medium text-[#5D4037] mb-2">有效期模式</label>
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setExpiryMode('days')}
                    className={`h-8 px-3 rounded-lg text-xs border transition-colors ${
                      expiryMode === 'days'
                        ? 'bg-[#FFC857]/20 border-[#FFC857]/40 text-[#5D4037]'
                        : 'bg-white border-[#5D4037]/15 text-[#5D4037]/70 hover:bg-[#5D4037]/5'
                    }`}
                  >
                    按天数
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpiryMode('date')}
                    className={`h-8 px-3 rounded-lg text-xs border transition-colors ${
                      expiryMode === 'date'
                        ? 'bg-[#FFC857]/20 border-[#FFC857]/40 text-[#5D4037]'
                        : 'bg-white border-[#5D4037]/15 text-[#5D4037]/70 hover:bg-[#5D4037]/5'
                    }`}
                  >
                    指定日期
                  </button>
                </div>

                {expiryMode === 'days' ? (
                  <>
                    <label className="block text-sm font-medium text-[#5D4037] mb-3">
                      快捷选项
                    </label>
                    <div className="grid grid-cols-4 gap-2 mb-4">
                      {[7, 30, 90, 180].map((days) => (
                        <button
                          key={days}
                          onClick={() => {
                            setNewExpiryDays(days);
                            setNewExpiryDate(getDateAfterDaysUTC8(days));
                          }}
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
                      onChange={(e) => {
                        const days = parseInt(e.target.value, 10) || 1;
                        setNewExpiryDays(days);
                        setNewExpiryDate(getDateAfterDaysUTC8(days));
                      }}
                      min="1"
                      max="365"
                      className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 transition-all"
                    />
                    <p className="text-xs text-[#5D4037]/60 mt-2">
                      新的过期时间：{formatDateDisplayUTC8(getDateTimeAfterDaysUTC8(Math.max(1, newExpiryDays || 1)))}
                    </p>
                  </>
                ) : (
                  <>
                    <label className="block text-sm font-medium text-[#5D4037] mb-2">
                      过期日期
                    </label>
                    <input
                      type="date"
                      value={selectedExpiryDate}
                      min={todayDate}
                      onChange={(e) => setNewExpiryDate(e.target.value)}
                      className="w-full px-4 py-3 border-2 border-[#5D4037]/20 rounded-xl focus:outline-none focus:border-[#FFC857] focus:ring-4 focus:ring-[#FFC857]/20 transition-all"
                    />
                    <p className="text-xs text-[#5D4037]/60 mt-2">
                      到期日期：{formatDateDisplayUTC8(`${selectedExpiryDate} 23:59:59`)}（{customExpiryDays} 天后）
                    </p>
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditingExpiry(null);
                    setExpiryMode('days');
                    setNewExpiryDays(7);
                    setNewExpiryDate(getDateAfterDaysUTC8(7));
                  }}
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

      {/* 赞赏码编辑弹窗 */}
      <AnimatePresence>
        {editingDonation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => !uploadingQrCode && setEditingDonation(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: "spring", duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-[#5D4037] mb-4">更换赞赏码</h3>
              <p className="text-sm text-[#5D4037]/60 mb-4">空间：{editingDonation.title}</p>

              {editingDonation.donation_qr_code_url ? (
                <div className="mb-4">
                  <p className="text-sm font-medium text-[#5D4037] mb-2">当前赞赏码：</p>
                  <img
                    src={editingDonation.donation_qr_code_url}
                    alt="当前赞赏码"
                    className="w-full h-40 object-contain rounded-lg border border-[#5D4037]/10 bg-white"
                  />
                </div>
              ) : (
                <div className="mb-4 text-sm text-[#5D4037]/60 bg-[#FFFBF0] rounded-xl p-3">
                  当前未上传赞赏码，上传后将展示在用户空间页面。
                </div>
              )}

              <div className="border-2 border-dashed border-[#5D4037]/20 rounded-xl p-6 text-center hover:border-[#FFC857] transition-colors cursor-pointer mb-4">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  id="donation-qr-upload-input"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleUploadQrCode(editingDonation, file);
                  }}
                  disabled={uploadingQrCode}
                />
                <label htmlFor="donation-qr-upload-input" className="cursor-pointer">
                  <Upload className="w-12 h-12 text-[#5D4037]/40 mx-auto mb-2" />
                  <p className="text-sm text-[#5D4037]/60">
                    {uploadingQrCode ? '上传中...' : '点击选择新的赞赏码图片'}
                  </p>
                  <p className="text-xs text-[#5D4037]/40 mt-1">
                    支持 JPG、PNG、WebP 格式，最大 5MB
                  </p>
                </label>
              </div>

              <button
                onClick={() => setEditingDonation(null)}
                disabled={uploadingQrCode}
                className="w-full px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
              >
                {uploadingQrCode ? '上传中...' : '取消'}
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



