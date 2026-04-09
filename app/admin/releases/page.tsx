'use client';

import { type ChangeEvent, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronDown,
  Download,
  Plus,
  Smartphone,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { setClipboardText } from '@/lib/android';
import { useBeforeUnloadGuard } from '@/lib/hooks/useBeforeUnloadGuard';
import { formatDateDisplayUTC8 } from '@/lib/utils/date-helpers';
import { insertReleaseWithCompat, listReleasesWithCompat } from '@/lib/releases/release-compat';

const RELEASE_PLATFORM_OPTIONS = ['Android', 'iOS', 'HarmonyOS', 'Windows', 'MacOS', 'Linux'] as const;
const RELEASE_ALLOWED_EXTENSIONS = ['.apk', '.ipa', '.exe', '.dmg', '.zip', '.deb', '.rpm', '.appimage', '.tar.gz'] as const;
const MAX_RELEASE_FILE_SIZE = 100 * 1024 * 1024;
const RELEASE_FILE_ACCEPT = '.apk,.ipa,.exe,.dmg,.zip,.deb,.rpm,.AppImage,.appimage,.tar.gz';

type ReleaseMode = 'list' | 'create';
type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ReleaseItem {
  id: number;
  version: string;
  platform: string;
  platformClass: string;
  downloadUrl: string;
  updateLog: string;
  forceUpdate: boolean;
  createdAtDisplay: string;
}

interface ToastState {
  type: ToastType;
  message: string;
}

function formatFileSize(size: number): string {
  const bytes = Number(size || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小';
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${bytes} B`;
}

function isReleaseFileAllowed(fileName: string): boolean {
  const lowerName = String(fileName || '').trim().toLowerCase();
  if (!lowerName) return false;
  return RELEASE_ALLOWED_EXTENSIONS.some((suffix) => lowerName.endsWith(suffix));
}

function toReleasePlatformClass(platform: string): string {
  switch (String(platform || '').trim()) {
    case 'Android':
      return 'release-chip--android';
    case 'iOS':
      return 'release-chip--ios';
    case 'HarmonyOS':
      return 'release-chip--harmony';
    case 'Windows':
      return 'release-chip--windows';
    case 'MacOS':
      return 'release-chip--macos';
    case 'Linux':
      return 'release-chip--linux';
    default:
      return 'release-chip--default';
  }
}

export default function AdminReleasesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode: ReleaseMode = searchParams.get('mode') === 'create' ? 'create' : 'list';

  const [releaseMode, setReleaseMode] = useState<ReleaseMode>(initialMode);
  const [releases, setReleases] = useState<ReleaseItem[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(true);
  const [releaseCreating, setReleaseCreating] = useState(false);
  const [releaseDeletingId, setReleaseDeletingId] = useState(0);
  const [releaseDeleteModalOpen, setReleaseDeleteModalOpen] = useState(false);
  const [releaseDeleteTargetId, setReleaseDeleteTargetId] = useState(0);
  const [releaseDeleteTargetVersion, setReleaseDeleteTargetVersion] = useState('');
  const [releaseDeleteTargetPlatform, setReleaseDeleteTargetPlatform] = useState('');
  const [releaseVersion, setReleaseVersion] = useState('');
  const [releasePlatformIndex, setReleasePlatformIndex] = useState(0);
  const [releaseUpdateLog, setReleaseUpdateLog] = useState('');
  const [releaseForceUpdate, setReleaseForceUpdate] = useState(false);
  const [releaseFile, setReleaseFile] = useState<File | null>(null);
  const [releaseFileName, setReleaseFileName] = useState('');
  const [releaseFileSize, setReleaseFileSize] = useState(0);
  const [releaseFileSizeText, setReleaseFileSizeText] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const releaseModeTimerRef = useRef<number | null>(null);
  const releasesLoadTokenRef = useRef(0);

  useBeforeUnloadGuard(releaseCreating);

  const clearToastTimer = () => {
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  };

  const clearReleaseModeTimer = () => {
    if (releaseModeTimerRef.current) {
      window.clearTimeout(releaseModeTimerRef.current);
      releaseModeTimerRef.current = null;
    }
  };

  const showToast = (type: ToastType, message: string) => {
    clearToastTimer();
    setToast({ type, message });
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 2800);
  };

  const syncReleaseRoute = (mode: ReleaseMode) => {
    const href = mode === 'create' ? '/admin/releases?mode=create' : '/admin/releases';
    router.replace(href, { scroll: false });
  };

  const updateReleaseMode = (mode: ReleaseMode) => {
    setReleaseMode(mode);
    syncReleaseRoute(mode);
  };

  const resetDeleteState = () => {
    setReleaseDeleteModalOpen(false);
    setReleaseDeleteTargetId(0);
    setReleaseDeleteTargetVersion('');
    setReleaseDeleteTargetPlatform('');
  };

  const resetReleaseForm = () => {
    setReleaseVersion('');
    setReleasePlatformIndex(0);
    setReleaseUpdateLog('');
    setReleaseForceUpdate(false);
    setReleaseFile(null);
    setReleaseFileName('');
    setReleaseFileSize(0);
    setReleaseFileSizeText('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const loadReleases = async () => {
    const loadToken = releasesLoadTokenRef.current + 1;
    releasesLoadTokenRef.current = loadToken;

    setReleasesLoading(true);
    const dbClient = createClient();

    if (!dbClient) {
      setReleasesLoading(false);
      showToast('error', '服务初始化失败，请刷新后重试');
      return;
    }

    const { data, error } = await listReleasesWithCompat(dbClient, {
      fallbackMessage: 'Load releases failed',
    });

    if (loadToken !== releasesLoadTokenRef.current) {
      return;
    }

    if (error) {
      setReleasesLoading(false);
      showToast('error', `加载失败：${error.message || '未知错误'}`);
      return;
    }

    const list = (Array.isArray(data) ? data : [])
      .map((row) => {
        const id = Number((row && row.id) || 0);
        const version = String((row && row.version) || '').trim();
        const platform = String((row && row.platform) || '').trim();
        const downloadUrl = String((row && row.download_url) || '').trim();
        const updateLog = String((row && row.update_log) || '').trim();
        const forceUpdate = Boolean(row && row.force_update);
        return {
          id,
          version,
          platform,
          platformClass: toReleasePlatformClass(platform),
          downloadUrl,
          updateLog,
          forceUpdate,
          createdAtDisplay: formatDateDisplayUTC8(row && row.created_at),
        } satisfies ReleaseItem;
      })
      .filter((item) => Number.isInteger(item.id) && item.id > 0);

    setReleases(list);
    if (loadToken === releasesLoadTokenRef.current) {
      setReleasesLoading(false);
    }
  };

  useEffect(() => {
    void loadReleases();

    return () => {
      releasesLoadTokenRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const nextMode: ReleaseMode = searchParams.get('mode') === 'create' ? 'create' : 'list';
    setReleaseMode((current) => (current === nextMode ? current : nextMode));
  }, [searchParams]);

  useEffect(() => {
    return () => {
      clearToastTimer();
      clearReleaseModeTimer();
    };
  }, []);

  const onOpenReleaseCreate = () => {
    if (releaseCreating || releaseDeletingId) return;
    clearReleaseModeTimer();
    resetDeleteState();
    resetReleaseForm();
    updateReleaseMode('create');
  };

  const onBackReleaseList = () => {
    if (releaseCreating) return;
    clearReleaseModeTimer();
    resetDeleteState();
    resetReleaseForm();
    updateReleaseMode('list');
  };

  const onCopyReleaseDownload = async (id: number) => {
    const target = releases.find((item) => item.id === id) || null;
    const url = String(target?.downloadUrl || '').trim();

    if (!url) {
      showToast('error', '下载地址不存在或已失效');
      return;
    }

    if (setClipboardText(url)) {
      showToast('success', '下载链接已复制');
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      showToast('success', '下载链接已复制');
    } catch {
      showToast('error', '复制链接失败，请重试');
    }
  };

  const onOpenReleaseDeleteModal = (id: number) => {
    if (!id || releaseCreating || releaseDeletingId) return;
    const target = releases.find((item) => item.id === id) || null;
    setReleaseDeleteModalOpen(true);
    setReleaseDeleteTargetId(id);
    setReleaseDeleteTargetVersion(String(target?.version || ''));
    setReleaseDeleteTargetPlatform(String(target?.platform || ''));
  };

  const onCloseReleaseDeleteModal = () => {
    if (releaseDeletingId) return;
    resetDeleteState();
  };

  const onConfirmDeleteRelease = async () => {
    const id = Number(releaseDeleteTargetId || 0);
    if (!id || releaseDeletingId) return;

    setReleaseDeletingId(id);
    try {
      const response = await fetch(`/api/admin/releases/${id}`, { method: 'DELETE' });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(String((payload as { error?: string })?.error || '删除版本失败'));
      }

      resetDeleteState();
      const warning = String((payload as { warning?: string })?.warning || '').trim();
      if (warning) {
        showToast('warning', warning);
      } else {
        showToast('success', '版本已删除');
      }
      await loadReleases();
    } catch (error) {
      showToast('error', error instanceof Error ? `删除失败：${error.message}` : '删除失败，请重试');
    } finally {
      setReleaseDeletingId(0);
    }
  };

  const onReleaseVersionInput = (event: ChangeEvent<HTMLInputElement>) => {
    setReleaseVersion(event.target.value);
  };

  const onReleasePlatformChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const index = Number(event.target.value || 0);
    const safeIndex = Math.min(Math.max(index, 0), RELEASE_PLATFORM_OPTIONS.length - 1);
    setReleasePlatformIndex(safeIndex);
  };

  const onReleaseUpdateLogInput = (event: ChangeEvent<HTMLTextAreaElement>) => {
    setReleaseUpdateLog(event.target.value);
  };

  const onToggleReleaseForceUpdate = () => {
    if (releaseCreating) return;
    setReleaseForceUpdate((current) => !current);
  };

  const chooseReleaseFile = () => {
    if (releaseCreating) return;
    fileInputRef.current?.click();
  };

  const onReleaseFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    setReleaseFile(nextFile);
    if (!nextFile) {
      setReleaseFileName('');
      setReleaseFileSize(0);
      setReleaseFileSizeText('');
      return;
    }

    setReleaseFileName(nextFile.name);
    setReleaseFileSize(nextFile.size);
    setReleaseFileSizeText(formatFileSize(nextFile.size));
  };

  const createRelease = async () => {
    if (releaseCreating) return;

    const version = String(releaseVersion || '').trim();
    const platform = String(RELEASE_PLATFORM_OPTIONS[releasePlatformIndex] || '').trim();
    const updateLog = String(releaseUpdateLog || '').trim();
    const file = releaseFile;

    if (!version) {
      showToast('error', '请填写版本号');
      return;
    }
    if (!platform) {
      showToast('error', '请选择发布平台');
      return;
    }
    if (!file || !releaseFileName) {
      showToast('error', '请先选择安装包');
      return;
    }
    if (!isReleaseFileAllowed(releaseFileName)) {
      showToast('error', '安装包格式不支持，请选择 apk/ipa/exe/dmg/zip/deb/rpm/appimage/tar.gz 文件');
      return;
    }
    if (releaseFileSize > MAX_RELEASE_FILE_SIZE) {
      showToast('error', '安装包大小超过 100MB 限制');
      return;
    }

    setReleaseCreating(true);
    let uploadedFileId = '';

    try {
      const dbClient = createClient();
      if (!dbClient) {
        throw new Error('服务初始化失败，请刷新后重试');
      }

      const filename = `${Date.now()}_${releaseFileName}`.replace(/\s+/g, '_');
      const uploadForm = new FormData();
      uploadForm.append('file', file);
      uploadForm.append('folder', 'releases');
      uploadForm.append('key', filename);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });

      const uploadPayload = await uploadResponse.json().catch(() => ({}));
      if (!uploadResponse.ok) {
        throw new Error(String((uploadPayload as { error?: string })?.error || '安装包上传失败'));
      }

      const provider = String((uploadPayload as { provider?: string })?.provider || '').trim().toLowerCase();
      const downloadUrl = String((uploadPayload as { url?: string })?.url || '').trim();
      const storageFileId = String((uploadPayload as { fileId?: string })?.fileId || '').trim();

      if (provider !== 'cloudbase') {
        throw new Error('安装包存储服务异常：当前仅支持 CloudBase');
      }
      if (!downloadUrl || !storageFileId) {
        throw new Error('安装包上传失败：缺少有效下载地址或文件标识');
      }

      uploadedFileId = storageFileId;

      const { error } = await insertReleaseWithCompat(
        dbClient,
        {
          version,
          platform,
          download_url: downloadUrl,
          update_log: updateLog,
          force_update: releaseForceUpdate,
          storage_provider: 'cloudbase',
          storage_file_id: storageFileId,
        },
        'Insert release failed'
      );

      if (error) {
        try {
          await fetch('/api/delete', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fileId: uploadedFileId }),
          });
        } catch (cleanupError) {
          console.error('发布失败后清理安装包失败:', cleanupError);
        }

        throw new Error(error.message || '版本信息入库失败');
      }

      showToast('success', '版本发布成功');
      resetReleaseForm();
      await loadReleases();
      clearReleaseModeTimer();
      releaseModeTimerRef.current = window.setTimeout(() => {
        releaseModeTimerRef.current = null;
        updateReleaseMode('list');
      }, 1500);
    } catch (error) {
      console.error('发布版本失败:', error);
      showToast('error', error instanceof Error ? `发布失败：${error.message}` : '发布失败，请重试');
    } finally {
      setReleaseCreating(false);
    }
  };

  const releasePlatformLabel = RELEASE_PLATFORM_OPTIONS[releasePlatformIndex] || RELEASE_PLATFORM_OPTIONS[0];
  const releaseBusy = releaseCreating || Boolean(releaseDeletingId);

  return (
    <div className="admin-mobile-page release-page">
      <AnimatePresence mode="wait" initial={false}>
        {releaseMode === 'list' ? (
          <motion.div
            key="release-list"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="release-page__panel"
          >
            <div className="release-header">
              <div className="release-header__main">
                <h1 className="release-header__title">发布版本</h1>
                <p className="release-header__desc">安装包发布</p>
              </div>
              <button type="button" className="release-primary-btn" onClick={onOpenReleaseCreate} disabled={releaseBusy}>
                <Plus className="release-primary-btn__icon" strokeWidth={2.25} />
                <span className="release-primary-btn__text">发布版本</span>
              </button>
            </div>

            {releasesLoading ? (
              <div className="release-loading">
                <div className="release-spinner" />
                <span className="release-loading__text">加载中...</span>
              </div>
            ) : releases.length === 0 ? (
              <div className="release-empty">
                <span className="release-empty__icon">📦</span>
                <span className="release-empty__text">暂无发布版本</span>
              </div>
            ) : (
              <div className="release-list">
                <AnimatePresence initial={false}>
                  {releases.map((item, index) => (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, y: 12 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2, delay: Math.min(index, 7) * 0.035 }}
                      className="release-card"
                    >
                      <div className="release-card__head">
                        <div className="release-card__meta">
                          <div className="release-card__icon">
                            <Smartphone className="release-card__icon-img" strokeWidth={2.3} />
                          </div>
                          <div className="release-card__title-wrap">
                            <div className="release-card__title-row">
                              <span className="release-card__title">版本 {item.version}</span>
                              <span className={`release-chip release-chip--platform ${item.platformClass}`}>{item.platform}</span>
                              {item.forceUpdate ? <span className="release-chip release-chip--force">🔀 强制更新</span> : null}
                            </div>
                            <span className="release-card__date">发布于{item.createdAtDisplay}</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="release-icon-btn release-icon-btn--danger"
                          onClick={() => onOpenReleaseDeleteModal(item.id)}
                          disabled={Boolean(releaseDeletingId)}
                          aria-label={`删除版本 ${item.version}`}
                        >
                          <Trash2 className="release-icon-btn__img" strokeWidth={2.2} />
                        </button>
                      </div>

                      {item.updateLog ? (
                        <div className="release-log">
                          <span className="release-log__text">{item.updateLog}</span>
                        </div>
                      ) : null}

                      <button type="button" className="release-primary-btn release-primary-btn--full" onClick={() => void onCopyReleaseDownload(item.id)}>
                        <Download className="release-primary-btn__icon" strokeWidth={2.2} />
                        <span className="release-primary-btn__text">下载安装包</span>
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="release-create"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
            className="release-page__panel"
          >
            <div className="release-new-header">
              <button type="button" className="release-back-btn" onClick={onBackReleaseList} disabled={releaseCreating} aria-label="返回发布版本列表">
                <ArrowLeft className="release-back-btn__icon" strokeWidth={2.3} />
              </button>
              <div className="release-new-header__main">
                <h1 className="release-new-header__title">发布新版本 🚀</h1>
                <p className="release-new-header__desc">上传应用安装包</p>
              </div>
            </div>

            <form
              className="release-form"
              onSubmit={(event) => {
                event.preventDefault();
                void createRelease();
              }}
            >
              <div className="release-field">
                <label className="release-field__label" htmlFor="release-version-input">
                  版本号 <span className="release-required">*</span>
                </label>
                <input
                  id="release-version-input"
                  className="release-input"
                  value={releaseVersion}
                  onChange={onReleaseVersionInput}
                  placeholder="例如: 1.0.0"
                  disabled={releaseCreating}
                />
              </div>

              <div className="release-field">
                <label className="release-field__label" htmlFor="release-platform-select">
                  平台 <span className="release-required">*</span>
                </label>
                <div className="release-select-wrap">
                  <select
                    id="release-platform-select"
                    className="release-select"
                    value={String(releasePlatformIndex)}
                    onChange={onReleasePlatformChange}
                    disabled={releaseCreating}
                  >
                    {RELEASE_PLATFORM_OPTIONS.map((option, index) => (
                      <option key={option} value={index}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="release-select__chevron" strokeWidth={2.4} />
                </div>
              </div>

              <div className="release-field">
                <label className="release-field__label" htmlFor="release-update-log">
                  更新日志
                </label>
                <textarea
                  id="release-update-log"
                  className="release-textarea"
                  value={releaseUpdateLog}
                  onChange={onReleaseUpdateLogInput}
                  placeholder="描述本次更新的内容..."
                  maxLength={1000}
                  disabled={releaseCreating}
                />
              </div>

              <div className="release-force">
                <div className="release-force__main">
                  <span className="release-force__title">强制更新 🔀</span>
                  <span className="release-force__desc">开启后，用户必须更新后才能继续使用应用（弹窗不可关闭）</span>
                </div>
                <button
                  type="button"
                  className={`release-toggle ${releaseForceUpdate ? 'release-toggle--on' : ''}`}
                  onClick={onToggleReleaseForceUpdate}
                  disabled={releaseCreating}
                  aria-pressed={releaseForceUpdate}
                  aria-label="切换强制更新"
                >
                  <span className={`release-toggle__thumb ${releaseForceUpdate ? 'release-toggle__thumb--on' : ''}`} />
                </button>
              </div>

              <div className="release-field">
                <span className="release-field__label">
                  安装包文件 <span className="release-required">*</span>
                </span>
                <input ref={fileInputRef} type="file" className="sr-only" accept={RELEASE_FILE_ACCEPT} onChange={onReleaseFileChange} />
                <button type="button" className="release-upload-btn" onClick={chooseReleaseFile} disabled={releaseCreating}>
                  <Upload className="release-upload-btn__icon" strokeWidth={2.2} />
                  <span className="release-upload-btn__text">{releaseFileName || '点击选择文件'}</span>
                </button>
                {releaseFileName ? <span className="release-help">文件大小: {releaseFileSizeText || '未知大小'}</span> : null}
                <span className="release-help">当前平台: {releasePlatformLabel}</span>
              </div>

              <button type="submit" className="release-primary-btn release-primary-btn--full" disabled={releaseCreating}>
                {releaseCreating ? '发布中...' : '发布版本'}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {releaseDeleteModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="release-modal-mask"
            onClick={onCloseReleaseDeleteModal}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              transition={{ type: 'spring', duration: 0.28 }}
              className="release-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="release-modal__icon">
                <Trash2 className="release-modal__icon-img" strokeWidth={2.15} />
              </div>
              <h3 className="release-modal__title">删除版本</h3>
              <p className="release-modal__desc">
                确定要删除版本 <span className="release-modal__highlight">{releaseDeleteTargetVersion}</span> ({releaseDeleteTargetPlatform}) 吗？
              </p>
              <div className="release-modal__actions">
                <button type="button" className="release-ghost-btn" onClick={onCloseReleaseDeleteModal} disabled={Boolean(releaseDeletingId)}>
                  取消
                </button>
                <button type="button" className="release-danger-btn" onClick={() => void onConfirmDeleteRelease()} disabled={Boolean(releaseDeletingId)}>
                  {releaseDeletingId ? '删除中...' : '确认删除'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {toast ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`release-toast release-toast--${toast.type}`}
          >
            <span className="release-toast__icon" aria-hidden>
              {toast.type === 'success' ? <CheckCircle size={18} strokeWidth={2.4} /> : null}
              {toast.type === 'warning' || toast.type === 'info' ? <AlertCircle size={18} strokeWidth={2.4} /> : null}
              {toast.type === 'error' ? <XCircle size={18} strokeWidth={2.4} /> : null}
            </span>
            <span className="release-toast__text">{toast.message}</span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
