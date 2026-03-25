'use client';

import { useState, useEffect, type ChangeEvent } from 'react';
import ToggleSwitch from '@/components/ui/ToggleSwitch';
import { createClient } from '@/lib/cloudbase/client';
import { useRouter } from 'next/navigation';
import { FolderHeart, Plus, Trash2, Key, Link as LinkIcon, QrCode, Edit, Eye, Calendar, Copy, CheckCircle, XCircle, AlertCircle, Heart, Upload, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { formatDateDisplayUTC8, formatDateUTC8, getDateAfterDaysUTC8, getDateTimeAfterDaysUTC8, getDaysDifference, getTodayUTC8, parseDateTimeUTC8 } from '@/lib/utils/date-helpers';
import { normalizeAccessKey } from '@/lib/utils/access-key';
import { useBeforeUnloadGuard } from '@/lib/hooks/useBeforeUnloadGuard';

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

const FIXED_PUBLIC_ORIGIN = 'https://guangyao666.xyz';

const createInitialAlbumCreateForm = () => ({
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

const generateAlbumAccessKey = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let key = '';
  for (let index = 0; index < 8; index += 1) {
    key += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return key;
};

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
  const [albumSelectionMode, setAlbumSelectionMode] = useState(false);
  const [albumSelectedIds, setAlbumSelectedIds] = useState<string[]>([]);
  const [albumBatchDeleting, setAlbumBatchDeleting] = useState(false);
  const [albumBatchDeleteConfirmOpen, setAlbumBatchDeleteConfirmOpen] = useState(false);
  const [albumCreateModalOpen, setAlbumCreateModalOpen] = useState(false);
  const [albumCreating, setAlbumCreating] = useState(false);
  const [albumCreateCoverFile, setAlbumCreateCoverFile] = useState<File | null>(null);
  const [albumCreateCoverPreview, setAlbumCreateCoverPreview] = useState<string | null>(null);
  const [albumCreateDonationQrFile, setAlbumCreateDonationQrFile] = useState<File | null>(null);
  const [albumCreateDonationQrPreview, setAlbumCreateDonationQrPreview] = useState<string | null>(null);
  const [albumCreateForm, setAlbumCreateForm] = useState(createInitialAlbumCreateForm);
  useBeforeUnloadGuard(uploadingQrCode || uploadingCover || albumCreating);
  const todayDate = getTodayUTC8();
  const selectedExpiryDate = newExpiryDate || todayDate;
  const customExpiryDays = Math.max(getDaysDifference(todayDate, selectedExpiryDate), 0);
  const albumCreateSelectedExpiryDate = albumCreateForm.expiry_date || todayDate;
  const albumCreateCustomExpiryDays = Math.max(getDaysDifference(todayDate, albumCreateSelectedExpiryDate), 0);

  useEffect(() => {
    loadAlbums();
  }, []);
  useEffect(() => {
    const validIds = new Set(albums.map((album) => String(album.id)));
    setAlbumSelectedIds((prev) => prev.filter((id) => validIds.has(String(id))));
    if (albums.length === 0) {
      setAlbumSelectionMode(false);
      setAlbumBatchDeleteConfirmOpen(false);
    }
  }, [albums]);

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


  const resetAlbumCreateState = () => {
    setAlbumCreateForm(createInitialAlbumCreateForm());
    setAlbumCreateCoverFile(null);
    setAlbumCreateCoverPreview(null);
    setAlbumCreateDonationQrFile(null);
    setAlbumCreateDonationQrPreview(null);
  };
  
  const closeAlbumCreateModal = () => {
    if (albumCreating) {
      return;
    }
    setAlbumCreateModalOpen(false);
    resetAlbumCreateState();
  };
  
  const handleAlbumCreateCoverSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
    setShowToast({ message: '请选择图片文件', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    try {
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAlbumCreateCoverFile(compressedFile);
        setAlbumCreateCoverPreview(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error: any) {
    setShowToast({ message: `封面处理失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };
  
  const handleAlbumCreateDonationQrSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
    setShowToast({ message: '请选择图片文件', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
    try {
      const { compressImage } = await import('@/lib/utils/image-compression');
      const compressedFile = await compressImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAlbumCreateDonationQrFile(compressedFile);
        setAlbumCreateDonationQrPreview(reader.result as string);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error: any) {
    setShowToast({ message: `赞赏码处理失败：${error.message}`, type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };
  
  const handleCreateAlbum = async () => {
    if (albumCreating) {
      return;
    }
  
    const dbClient = createClient();
    if (!dbClient) {
    setShowToast({ message: '服务初始化失败，请刷新后重试', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
  
    const nextAccessKey = albumCreateForm.auto_generate_key
      ? generateAlbumAccessKey()
      : normalizeAccessKey(albumCreateForm.access_key);
  
    if (!nextAccessKey) {
    setShowToast({ message: '请输入访问密钥', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
  
    if (!/^[A-Z0-9]{8}$/.test(nextAccessKey)) {
    setShowToast({ message: '访问密钥必须是 8 位大写字母或数字', type: 'warning' });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }
  
    if (albumCreateForm.expiry_mode === 'date') {
      if (!albumCreateSelectedExpiryDate) {
      setShowToast({ message: '请选择过期日期', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
      if (albumCreateSelectedExpiryDate < todayDate) {
      setShowToast({ message: '过期日期不能早于今天', type: 'warning' });
        setTimeout(() => setShowToast(null), 3000);
        return;
      }
    }
  
    setAlbumCreating(true);
  
    try {
      const { data: existing, error: existingError } = await dbClient
        .from('albums')
        .select('id')
        .eq('access_key', nextAccessKey)
        .maybeSingle();
  
      if (existingError) {
      throw new Error(`检查密钥失败：${existingError.message}`);
      }
      if (existing) {
      throw new Error('该访问密钥已存在，请使用其他密钥');
      }
  
      let coverUrl: string | null = null;
      let donationQrUrl: string | null = null;
      const timestamp = Date.now();
      const { uploadToCloudBaseDirect } = await import('@/lib/storage/cloudbase-upload-client');
  
      if (albumCreateCoverFile) {
        const coverExt = albumCreateCoverFile.name.split('.').pop();
        const coverFileName = `cover_${timestamp}.${coverExt}`;
        coverUrl = await uploadToCloudBaseDirect(albumCreateCoverFile, coverFileName, 'albums');
      }
  
      if (albumCreateForm.enable_tipping && albumCreateDonationQrFile) {
        try {
          const donationExt = albumCreateDonationQrFile.name.split('.').pop();
          const donationFileName = `donation_qr_${timestamp}.${donationExt}`;
          donationQrUrl = await uploadToCloudBaseDirect(albumCreateDonationQrFile, donationFileName, 'albums');
        } catch (error) {
        await cleanupStorageByUrl(coverUrl, '封面', false);
          throw error;
        }
      }
  
      const expiresAt = albumCreateForm.expiry_mode === 'date'
        ? `${albumCreateSelectedExpiryDate} 23:59:59`
        : getDateTimeAfterDaysUTC8(Math.max(1, albumCreateForm.expiry_days || 1));
  
      const { error: insertError } = await dbClient
        .from('albums')
        .insert({
        title: albumCreateForm.title.trim() || '未命名空间',
          access_key: nextAccessKey,
          cover_url: coverUrl,
          donation_qr_code_url: albumCreateForm.enable_tipping ? donationQrUrl : null,
          welcome_letter: albumCreateForm.enable_welcome_letter ? albumCreateForm.welcome_letter.trim() : '',
        recipient_name: albumCreateForm.recipient_name.trim() || '拾光者',
          enable_tipping: albumCreateForm.enable_tipping,
          enable_welcome_letter: albumCreateForm.enable_welcome_letter,
          expires_at: expiresAt,
        });
  
      if (insertError) {
      await cleanupStorageByUrl(coverUrl, '封面', false);
      await cleanupStorageByUrl(donationQrUrl, '赞赏码', false);
      throw new Error(insertError.message || '创建专属空间失败');
      }
  
      setAlbumCreating(false);
      setAlbumCreateModalOpen(false);
      resetAlbumCreateState();
      await loadAlbums();
    setShowToast({ message: '专属空间已创建', type: 'success' });
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      setAlbumCreating(false);
    setShowToast({ message: error?.message || '创建专属空间失败', type: 'error' });
      setTimeout(() => setShowToast(null), 3000);
    }
  };

const copyAccessKey = async (accessKey: string) => {

    const { setClipboardText } = await import('@/lib/android');
    const success = setClipboardText(String(accessKey || '').trim());
    if (success) {
      setShowToast({ message: '访问密钥已复制', type: 'success' });
    } else {
      setShowToast({ message: '复制访问密钥失败，请重试', type: 'error' });
    }
    setTimeout(() => setShowToast(null), 3000);
  };

  const openEditTitleModal = (album: Album) => {
    setEditingTitle(album);
    setNewTitle(album.title || '');
  };

  const openEditKeyModal = (album: Album) => {
    setEditingAlbum(album);
    setNewAccessKey(album.access_key || '');
  };

  const openEditRecipientModal = (album: Album) => {
    setEditingRecipient(album);
    setNewRecipientName(album.recipient_name || '');
    setNewWelcomeLetter(album.welcome_letter || '');
  };

  const openEditExpiryModal = (album: Album) => {
    setEditingExpiry(album);
    const expiry = parseDateTimeUTC8(album.expires_at);
    const fallbackDate = getDateAfterDaysUTC8(7);
    const rawTargetDate = expiry ? formatDateUTC8(expiry) : fallbackDate;
    const targetDate = rawTargetDate < todayDate ? todayDate : rawTargetDate;
    const remains = Math.max(getDaysDifference(todayDate, targetDate), 1);
    setExpiryMode('days');
    setNewExpiryDays(remains);
    setNewExpiryDate(targetDate);
  };

  const enterAlbumSelectionMode = () => {
    setAlbumSelectionMode(true);
    setAlbumSelectedIds([]);
  };

  const cancelAlbumSelectionMode = () => {
    setAlbumSelectionMode(false);
    setAlbumSelectedIds([]);
    setAlbumBatchDeleteConfirmOpen(false);
  };

  const toggleAlbumSelection = (id: string) => {
    if (!albumSelectionMode || albumBatchDeleting) {
      return;
    }
    setAlbumSelectedIds((prev) => (
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    ));
  };

  const toggleAlbumSelectAll = () => {
    if (!albumSelectionMode || albumBatchDeleting) {
      return;
    }
    setAlbumSelectedIds((prev) => (
      prev.length === albums.length ? [] : albums.map((album) => album.id)
    ));
  };

  const confirmAlbumBatchDelete = async () => {
    const selectedIds = Array.from(new Set(albumSelectedIds.map((item) => String(item || '').trim()).filter(Boolean)));
    if (selectedIds.length === 0 || albumBatchDeleting) {
      return;
    }

    setAlbumBatchDeleting(true);
    const deletedIds: string[] = [];
    const warnings: string[] = [];
    const failedMessages: string[] = [];

    for (const id of selectedIds) {
      try {
        const response = await fetch(`/api/admin/albums/${id}`, {
          method: 'DELETE',
        });
        const payload = await response.json().catch(() => ({} as any));
        if (!response.ok) {
          throw new Error(String(payload?.error ?? '删除失败'));
        }
        deletedIds.push(id);
        const warningMessage = String(payload?.warning ?? '').trim();
        if (warningMessage) {
          warnings.push(warningMessage);
        }
      } catch (error) {
        failedMessages.push(error instanceof Error ? error.message : '删除失败');
      }
    }

    setAlbumBatchDeleting(false);
    setAlbumBatchDeleteConfirmOpen(false);
    setAlbumSelectionMode(false);
    setAlbumSelectedIds([]);
    await loadAlbums();

    if (failedMessages.length === 0) {
      setShowToast({
        message: warnings.length > 0
          ? `已删除 ${deletedIds.length} 个专属空间，但有 ${warnings.length} 条清理提示`
          : `已删除 ${deletedIds.length} 个专属空间`,
        type: warnings.length > 0 ? 'warning' : 'success',
      });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    if (deletedIds.length > 0) {
      setShowToast({
        message: `已删除 ${deletedIds.length} 个专属空间，${failedMessages.length} 个删除失败`,
        type: 'warning',
      });
      setTimeout(() => setShowToast(null), 3000);
      return;
    }

    setShowToast({ message: failedMessages[0] || '批量删除失败', type: 'error' });
    setTimeout(() => setShowToast(null), 3000);
  };
  const copyAccessLink = async (accessKey: string) => {
    const link = `${FIXED_PUBLIC_ORIGIN}/album/${accessKey}`;
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
    const link = `${FIXED_PUBLIC_ORIGIN}/album/${accessKey}`;
    return `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(link)}`;
  };

  const albumRows = albums.map((album) => {
    const parsedExpiry = parseDateTimeUTC8(album.expires_at);
    const daysRemaining = parsedExpiry
      ? Math.ceil((parsedExpiry.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      : null;
    return {
      ...album,
      selected: albumSelectedIds.includes(album.id),
      hasCover: Boolean(String(album.cover_url || '').trim()),
      coverResolved: String(album.cover_url || '').trim(),
      hasDonationQr: Boolean(String(album.donation_qr_code_url || '').trim()),
      donationQrResolved: String(album.donation_qr_code_url || '').trim(),
      createdDateText: formatDateDisplayUTC8(album.created_at),
      expiresAtText: album.expires_at ? formatDateDisplayUTC8(album.expires_at) : '',
      expiresDateText: album.expires_at ? formatDateDisplayUTC8(album.expires_at) : '',
      daysRemaining,
      expired: daysRemaining !== null && daysRemaining < 0,
      expirySoon: daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 3,
      welcomeEnabled: album.enable_welcome_letter ?? true,
      recipientLabel: String(album.recipient_name || '').trim() || '拾光者',
      welcomeLetterText: String(album.welcome_letter || '').trim() || '未设置欢迎信内容',
    };
  });
  const albumSelectedCount = albumSelectedIds.length;
  const albumTotalCount = albumRows.length;
  const albumAllSelected = albumTotalCount > 0 && albumSelectedCount === albumTotalCount;
  const albumBusy = uploadingQrCode || uploadingCover || albumBatchDeleting || albumCreating;
  return (
    <div className="admin-mobile-page album-admin-page space-y-6 pt-6">
      <div className="module-intro album-page-intro">
        <h1 className="module-title">专属空间管理</h1>
        <p className="module-desc">管理返图空间、访问方式与空间配置</p>
      </div>
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="album-panel"
      >
        <div className="booking-toolbar album-toolbar">
          {!albumSelectionMode ? (
            <div className="booking-toolbar-actions booking-toolbar-actions--right">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost"
                onClick={enterAlbumSelectionMode}
                disabled={loading || !albumTotalCount || albumBusy}
              >
                批量删除
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost"
                onClick={() => router.push('/admin/gallery')}
                disabled={albumBusy}
              >
                照片墙管理
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--primary"
                onClick={() => setAlbumCreateModalOpen(true)}
                disabled={albumBusy}
              >
                + 创建空间
              </button>
            </div>
          ) : (
            <div className="booking-toolbar-actions booking-toolbar-actions--selection album-toolbar-actions--selection-row">
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                onClick={toggleAlbumSelectAll}
                disabled={albumBatchDeleting}
              >
                {albumAllSelected ? '取消全选' : '全选'} ({albumSelectedCount}/{albumTotalCount})
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--danger booking-pill-btn--compact"
                onClick={() => setAlbumBatchDeleteConfirmOpen(true)}
                disabled={albumBatchDeleting || !albumSelectedCount}
              >
                删除 ({albumSelectedCount})
              </button>
              <button
                type="button"
                className="booking-pill-btn booking-pill-btn--ghost booking-pill-btn--compact"
                onClick={cancelAlbumSelectionMode}
                disabled={albumBatchDeleting}
              >
                取消
              </button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-[#FFC857] border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-sm text-[#5D4037]/60">加载中...</p>
          </div>
        ) : albumRows.length === 0 ? (
          <div className="empty booking-empty-card album-empty-card">
            <span className="booking-empty-card__icon">💝</span>
            <span>暂无专属空间</span>
          </div>
        ) : (
          <div className="album-grid">
            <AnimatePresence>
              {albumRows.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.22, delay: Math.min(index, 7) * 0.03 }}
                  className={`album-card ${albumSelectionMode ? (item.selected ? 'album-card--selected' : 'album-card--selectable') : ''}`}
                  onClick={() => {
                    if (!albumSelectionMode) {
                      return;
                    }
                    toggleAlbumSelection(item.id);
                  }}
                >
                  <div className="album-card__cover-wrap">
                    {albumSelectionMode && (
                      <div className={`album-card__check ${item.selected ? 'album-card__check--active' : ''}`}>
                        {item.selected ? '✓' : ''}
                      </div>
                    )}
                    {item.hasCover ? (
                      <img className="album-card__cover" src={item.coverResolved} alt={item.title} />
                    ) : (
                      <div className="album-card__cover-empty">
                        <span className="album-card__cover-empty-icon">🖼️</span>
                        <span className="album-card__cover-empty-text">暂无封面</span>
                      </div>
                    )}
                    {!albumSelectionMode && (
                      <button
                        type="button"
                        className="album-card__cover-btn"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditingCover(item);
                        }}
                        disabled={albumBusy}
                      >
                        {item.hasCover ? '更换封面' : '添加封面'}
                      </button>
                    )}
                  </div>

                  <div className="album-card__body">
                    <div className="album-card__title-row">
                      <div className="album-card__title-wrap">
                        <div className="album-card__title">{item.title || '未命名空间'}</div>
                        <div className="album-card__meta-row">
                          <span className="album-card__meta">创建于 {item.createdDateText}</span>
                          {item.expiresAtText && (
                            <span className={`album-card__expiry-badge ${item.expired ? 'album-card__expiry-badge--expired' : (item.expirySoon ? 'album-card__expiry-badge--soon' : 'album-card__expiry-badge--normal')}`}>
                              到期 {item.expiresDateText}
                              {item.daysRemaining !== null ? ` · ${item.daysRemaining > 0 ? item.daysRemaining : 0}天` : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      {!albumSelectionMode && (
                        <div className="album-card__quick-actions">
                          <button
                            type="button"
                            className="album-mini-btn album-mini-btn--edit"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditTitleModal(item);
                            }}
                            disabled={albumBusy}
                            title="修改空间名称"
                          >
                            <Edit className="album-mini-btn__icon" />
                          </button>
                          <button
                            type="button"
                            className="album-mini-btn album-mini-btn--danger"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleDelete(item.id, item.title);
                            }}
                            disabled={albumBusy}
                            title="删除空间"
                          >
                            <Trash2 className="album-mini-btn__icon" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="album-access-card">
                      <div className="album-access-card__main">
                        <span className="album-access-card__label">访问密钥</span>
                        <span className="album-access-card__key">{item.access_key}</span>
                      </div>
                      {!albumSelectionMode && (
                        <div className="album-access-card__actions">
                          <button
                            type="button"
                            className="album-icon-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyAccessKey(item.access_key);
                            }}
                            disabled={albumBusy}
                            title="复制访问密钥"
                          >
                            <Copy className="album-icon-btn__icon" />
                          </button>
                          <button
                            type="button"
                            className="album-icon-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditKeyModal(item);
                            }}
                            disabled={albumBusy}
                            title="修改访问密钥"
                          >
                            <Key className="album-icon-btn__icon" />
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="album-recipient-card">
                      <div className="album-recipient-card__head">
                        <div className="album-recipient-card__main">
                          <span className="album-recipient-card__label">收件人</span>
                          <span className="album-recipient-card__name">{item.recipientLabel}</span>
                        </div>
                        {!albumSelectionMode && (
                          <button
                            type="button"
                            className="album-recipient-card__edit-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditRecipientModal(item);
                            }}
                            disabled={albumBusy}
                          >
                            编辑文案
                          </button>
                        )}
                      </div>
                      <span className="album-recipient-card__welcome">{item.welcomeLetterText}</span>
                    </div>

                    {!albumSelectionMode && (
                      <>
                        <div className="album-toggle-grid">
                          <button
                            type="button"
                            className={`album-toggle-btn ${item.welcomeEnabled ? 'album-toggle-btn--welcome-on' : 'album-toggle-btn--off'}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleWelcomeLetter(item);
                            }}
                            disabled={albumBusy}
                            title={item.welcomeEnabled ? '关闭欢迎信' : '开启欢迎信'}
                          >
                            <Mail className="album-toggle-btn__icon" />
                            <span className="album-toggle-btn__text">欢迎信 {item.welcomeEnabled ? '开启' : '关闭'}</span>
                          </button>

                          <button
                            type="button"
                            className={`album-toggle-btn ${item.enable_tipping ? 'album-toggle-btn--tipping-on' : 'album-toggle-btn--off'}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleDonation(item);
                            }}
                            disabled={albumBusy}
                            title={item.enable_tipping ? '关闭打赏功能' : '开启打赏功能'}
                          >
                            <Heart className="album-toggle-btn__icon" />
                            <span className="album-toggle-btn__text">打赏 {item.enable_tipping ? '开启' : '关闭'}</span>
                          </button>
                        </div>

                        <div className="album-donation-card">
                          <div className="album-donation-card__main">
                            <span className="album-donation-card__label">赞赏码</span>
                            <span className="album-donation-card__desc">
                              {!item.enable_tipping ? '打赏关闭，暂不可上传' : (item.hasDonationQr ? '已上传，可随时更新' : '未上传')}
                            </span>
                          </div>
                          <button
                            type="button"
                            className={`album-donation-card__btn ${!item.enable_tipping ? 'album-donation-card__btn--disabled' : ''}`}
                            onClick={(event) => {
                              event.stopPropagation();
                              setEditingDonation(item);
                            }}
                            disabled={!item.enable_tipping || albumBusy}
                          >
                            {item.hasDonationQr ? '更换' : '上传'}
                          </button>
                        </div>

                        <div className="album-action-grid">
                          <button
                            type="button"
                            className="album-action-btn album-action-btn--primary"
                            onClick={(event) => {
                              event.stopPropagation();
                              router.push(`/admin/albums/${item.id}`);
                            }}
                            disabled={albumBusy}
                          >
                            <Eye className="album-action-btn__icon" />
                            <span className="album-action-btn__text">查看详细</span>
                          </button>

                          <button
                            type="button"
                            className="album-action-btn album-action-btn--ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              copyAccessLink(item.access_key);
                            }}
                            disabled={albumBusy}
                          >
                            <LinkIcon className="album-action-btn__icon" />
                            <span className="album-action-btn__text">复制链接</span>
                          </button>

                          <button
                            type="button"
                            className="album-action-btn album-action-btn--qr"
                            onClick={(event) => {
                              event.stopPropagation();
                              setShowQrModal(item.access_key);
                            }}
                            disabled={albumBusy}
                          >
                            <QrCode className="album-action-btn__icon" />
                            <span className="album-action-btn__text">二维码</span>
                          </button>

                          <button
                            type="button"
                            className="album-action-btn album-action-btn--ghost"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEditExpiryModal(item);
                            }}
                            disabled={albumBusy}
                          >
                            <Calendar className="album-action-btn__icon" />
                            <span className="album-action-btn__text">改有效期</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {albumBatchDeleteConfirmOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={() => {
              if (albumBatchDeleting) {
                return;
              }
              setAlbumBatchDeleteConfirmOpen(false);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="bg-white rounded-2xl p-4 sm:p-6 w-full max-w-md"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="w-8 h-8 text-red-600" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-2">批量删除专属空间</h3>
                <p className="text-sm text-[#5D4037]/80 mb-4">
                  即将删除 <span className="font-bold">{albumSelectedCount}</span> 个专属空间
                </p>
                <div className="bg-red-50 rounded-xl p-4 text-left mb-4">
                  <p className="text-sm text-red-800 font-medium mb-2">此操作将永久删除：</p>
                  <ul className="text-sm text-red-700 space-y-1">
                    <li>• 选中空间下的所有照片与文件夹</li>
                    <li>• 所有关联访问数据与绑定关系</li>
                    <li>• 相关封面与赞赏码文件</li>
                  </ul>
                </div>
                <p className="text-sm text-red-600 font-bold">此操作不可撤销</p>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAlbumBatchDeleteConfirmOpen(false)}
                  disabled={albumBatchDeleting}
                  className="flex-1 px-4 py-2.5 border-2 border-[#5D4037]/20 text-[#5D4037] rounded-full hover:bg-[#5D4037]/5 active:scale-95 transition-all font-medium disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmAlbumBatchDelete}
                  disabled={albumBatchDeleting}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-full font-medium hover:bg-red-700 active:scale-95 transition-all disabled:opacity-50"
                >
                  {albumBatchDeleting ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

<AnimatePresence>
  {albumCreateModalOpen && (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="booking-modal-mask"
      onClick={closeAlbumCreateModal}
    >
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        transition={{ type: 'spring', duration: 0.28 }}
        className="booking-modal booking-modal--form album-modal album-create-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="booking-modal__head">
          <h3 className="booking-modal__title">创建专属空间 ✨</h3>
          <button
            type="button"
            className="booking-modal__close"
            onClick={closeAlbumCreateModal}
            disabled={albumCreating}
            aria-label="关闭创建空间弹窗"
          >
            ✕
          </button>
        </div>

        <div className="booking-modal__body album-create-modal__body">
          <div className="album-create-section">
            <span className="album-create-section__title">基础信息</span>
            <div className="booking-modal__field">
              <label className="booking-modal__label">空间名称</label>
              <input
                type="text"
                className="booking-modal__input"
                value={albumCreateForm.title}
                onChange={(event) => setAlbumCreateForm((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="例如：小美的专属空间"
                maxLength={40}
                disabled={albumCreating}
              />
            </div>
            <div className="booking-modal__field">
              <label className="booking-modal__label">收件人名称</label>
              <input
                type="text"
                className="booking-modal__input"
                value={albumCreateForm.recipient_name}
                onChange={(event) => setAlbumCreateForm((prev) => ({ ...prev, recipient_name: event.target.value }))}
                placeholder="例如：小美、拾光者"
                maxLength={24}
                disabled={albumCreating}
              />
            </div>
            <span className="album-create-section__tip">收件人名称会展示在信封 To 后面，默认值为“拾光者”。</span>
          </div>

          <div className="album-create-section album-create-section--soft">
            <div className="album-create-key-card">
              <div className="album-create-key-card__head">
                <span className="album-create-key-card__title">访问密钥</span>
                <div className="album-create-key-card__switch">
                  <span>自动生成</span>
                  <ToggleSwitch
                    enabled={albumCreateForm.auto_generate_key}
                    onChange={(enabled) => setAlbumCreateForm((prev) => ({
                      ...prev,
                      auto_generate_key: enabled,
                      access_key: enabled ? '' : prev.access_key,
                    }))}
                  />
                </div>
              </div>
              {albumCreateForm.auto_generate_key ? (
                <div className="album-create-key-card__hint">系统会在创建时生成 8 位密钥</div>
              ) : (
                <div className="album-create-key-card__input-row">
                  <input
                    type="text"
                    className="booking-modal__input album-key-input"
                    value={albumCreateForm.access_key}
                    onChange={(event) => setAlbumCreateForm((prev) => ({
                      ...prev,
                      access_key: normalizeAccessKey(event.target.value),
                    }))}
                    placeholder="输入 8 位密钥"
                    maxLength={8}
                    disabled={albumCreating}
                  />
                  <button
                    type="button"
                    className="album-generate-key-btn"
                    onClick={() => setAlbumCreateForm((prev) => ({
                      ...prev,
                      access_key: generateAlbumAccessKey(),
                    }))}
                    disabled={albumCreating}
                  >
                    生成
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="album-create-section">
            <div className="switch-row">
              <div className="switch-row__main">
                <span className="switch-row__title">欢迎信显示</span>
                <span className="switch-row__desc">收件人打开空间时显示欢迎文案</span>
              </div>
              <ToggleSwitch
                enabled={albumCreateForm.enable_welcome_letter}
                onChange={(enabled) => setAlbumCreateForm((prev) => ({ ...prev, enable_welcome_letter: enabled }))}
              />
            </div>

            {albumCreateForm.enable_welcome_letter ? (
              <div className="booking-modal__field">
                <label className="booking-modal__label">欢迎信内容</label>
                <textarea
                  className="booking-modal__textarea"
                  value={albumCreateForm.welcome_letter}
                  onChange={(event) => setAlbumCreateForm((prev) => ({ ...prev, welcome_letter: event.target.value }))}
                  placeholder="写一段欢迎语，收件人打开空间时可见"
                  maxLength={400}
                  disabled={albumCreating}
                />
              </div>
            ) : (
              <div className="album-create-plain-tip">已关闭欢迎信显示，可在空间管理页随时开启。</div>
            )}
          </div>

          <div className="album-create-section">
            <div className="booking-modal__field">
              <label className="booking-modal__label">有效期模式</label>
              <div className="album-expiry-mode-row">
                <button
                  type="button"
                  className={`album-expiry-mode-btn ${albumCreateForm.expiry_mode === 'days' ? 'album-expiry-mode-btn--active' : ''}`}
                  onClick={() => setAlbumCreateForm((prev) => ({ ...prev, expiry_mode: 'days' }))}
                  disabled={albumCreating}
                >
                  按天数
                </button>
                <button
                  type="button"
                  className={`album-expiry-mode-btn ${albumCreateForm.expiry_mode === 'date' ? 'album-expiry-mode-btn--active' : ''}`}
                  onClick={() => setAlbumCreateForm((prev) => ({ ...prev, expiry_mode: 'date' }))}
                  disabled={albumCreating}
                >
                  指定日期
                </button>
              </div>

              {albumCreateForm.expiry_mode === 'days' ? (
                <>
                  <div className="album-expiry-quick-row">
                    {[7, 30, 90, 180].map((days) => (
                      <button
                        key={days}
                        type="button"
                        className={`album-expiry-quick-btn ${albumCreateForm.expiry_days === days ? 'album-expiry-quick-btn--active' : ''}`}
                        onClick={() => setAlbumCreateForm((prev) => ({
                          ...prev,
                          expiry_mode: 'days',
                          expiry_days: days,
                          expiry_date: getDateAfterDaysUTC8(days),
                        }))}
                        disabled={albumCreating}
                      >
                        {days}天
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    className="booking-modal__input"
                    value={albumCreateForm.expiry_days}
                    onChange={(event) => {
                      const parsedDays = Number(event.target.value);
                      const safeDays = Number.isFinite(parsedDays) && parsedDays > 0 ? Math.floor(parsedDays) : 1;
                      setAlbumCreateForm((prev) => ({
                        ...prev,
                        expiry_mode: 'days',
                        expiry_days: safeDays,
                        expiry_date: getDateAfterDaysUTC8(safeDays),
                      }));
                    }}
                    min={1}
                    disabled={albumCreating}
                  />
                  <span className="album-expiry-tip">新的过期时间：{getDateAfterDaysUTC8(Math.max(1, albumCreateForm.expiry_days || 1))} 23:59:59</span>
                </>
              ) : (
                <input
                  type="date"
                  className="schedule-modal-picker"
                  min={todayDate}
                  value={albumCreateSelectedExpiryDate}
                  onChange={(event) => setAlbumCreateForm((prev) => ({
                    ...prev,
                    expiry_mode: 'date',
                    expiry_date: event.target.value,
                    expiry_days: Math.max(getDaysDifference(todayDate, event.target.value || todayDate), 1),
                  }))}
                  disabled={albumCreating}
                />
              )}
            </div>
          </div>

          <div className="album-create-section">
            <div className="switch-row">
              <div className="switch-row__main">
                <span className="switch-row__title">打赏功能</span>
                <span className="switch-row__desc">开启后可上传赞赏码</span>
              </div>
              <ToggleSwitch
                enabled={albumCreateForm.enable_tipping}
                onChange={(enabled) => setAlbumCreateForm((prev) => ({ ...prev, enable_tipping: enabled }))}
              />
            </div>

            <div className="booking-modal__field">
              <label className="booking-modal__label">封面图片</label>
              {!albumCreateCoverPreview ? (
                <div className="album-create-cover-upload">
                  <label className="album-create-upload-btn">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleAlbumCreateCoverSelect}
                      disabled={albumCreating}
                    />
                    <Upload className="album-create-upload-icon" />
                    <span>点击上传封面（可选）</span>
                  </label>
                  <span className="album-create-upload-hint">建议 16:9 横图，用于空间列表展示</span>
                </div>
              ) : (
                <div className="album-create-cover-preview">
                  <img className="album-create-cover-image" src={albumCreateCoverPreview} alt="封面预览" />
                  <button
                    type="button"
                    className="album-create-preview-remove"
                    onClick={() => {
                      setAlbumCreateCoverFile(null);
                      setAlbumCreateCoverPreview(null);
                    }}
                    disabled={albumCreating}
                    aria-label="移除封面"
                  >
                    <XCircle className="album-create-remove-icon" />
                  </button>
                </div>
              )}
            </div>

            {albumCreateForm.enable_tipping && (
              <div className="booking-modal__field">
                <label className="booking-modal__label">赞赏码（可选）</label>
                {!albumCreateDonationQrPreview ? (
                  <div className="album-create-qr-upload">
                    <label className="album-create-upload-btn album-create-upload-btn--small">
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAlbumCreateDonationQrSelect}
                        disabled={albumCreating}
                      />
                      <Heart className="album-create-upload-icon" />
                      <span>上传赞赏码</span>
                    </label>
                  </div>
                ) : (
                  <div className="album-create-qr-preview">
                    <img className="album-create-qr-image" src={albumCreateDonationQrPreview} alt="赞赏码预览" />
                    <button
                      type="button"
                      className="album-create-preview-remove"
                      onClick={() => {
                        setAlbumCreateDonationQrFile(null);
                        setAlbumCreateDonationQrPreview(null);
                      }}
                      disabled={albumCreating}
                      aria-label="移除赞赏码"
                    >
                      <XCircle className="album-create-remove-icon" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="album-create-summary">
            <span className="album-create-summary__title">配置摘要</span>
            <div className="album-create-summary__row">
              <span>访问密钥</span>
              <span>{albumCreateForm.auto_generate_key ? '自动生成' : '手动输入'}</span>
            </div>
            <div className="album-create-summary__row">
              <span>欢迎信显示</span>
              <span>{albumCreateForm.enable_welcome_letter ? '开启' : '关闭'}</span>
            </div>
            <div className="album-create-summary__row">
              <span>打赏功能</span>
              <span>{albumCreateForm.enable_tipping ? '开启' : '关闭'}</span>
            </div>
            <div className="album-create-summary__row">
              <span>赞赏码</span>
              <span>{albumCreateForm.enable_tipping ? (albumCreateDonationQrFile ? '已选择' : '未上传') : '未启用'}</span>
            </div>
            <div className="album-create-summary__row">
              <span>有效期</span>
              <span>
                {albumCreateForm.expiry_mode === 'days'
                  ? `${Math.max(1, albumCreateForm.expiry_days || 1)} 天`
                  : `至 ${formatDateDisplayUTC8(`${albumCreateSelectedExpiryDate} 23:59:59`)}`}
              </span>
            </div>
          </div>
        </div>

        <button
          type="button"
          className="booking-modal__submit album-create-modal__submit"
          onClick={handleCreateAlbum}
          disabled={albumCreating}
        >
          {albumCreating ? '创建中...' : '创建空间'}
        </button>
      </motion.div>
    </motion.div>
  )}
</AnimatePresence>

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



