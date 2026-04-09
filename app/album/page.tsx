'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Clipboard, Lock, Plus, Sparkles, Trash2, Unlink2 } from 'lucide-react';
import MiniProgramRecoveryScreen from '@/components/MiniProgramRecoveryScreen';
import PageTopHeader from '@/components/PageTopHeader';
import PreviewAwareScrollArea from '@/components/PreviewAwareScrollArea';
import { createClient } from '@/lib/cloudbase/client';
import { getClipboardText } from '@/lib/android';
import { normalizeAccessKey } from '@/lib/utils/access-key';
import { formatDateDisplayUTC8, toTimestampUTC8 } from '@/lib/utils/date-helpers';
import { isWechatBrowser } from '@/lib/wechat';

interface BoundAlbum {
  id: string;
  title: string;
  cover_url: string | null;
  created_at: string;
  access_key: string;
  bound_at: string;
  expires_at: string;
  is_expired: boolean;
}

const COPY = {
  fallbackTitle: '专属返图空间',
  fallbackBadge: '✨ 趁照片消失前，把美好定格 ✨',
  loadingTitle: '加载中...',
  loadingDesc: '正在为你打开空间入口',
  serviceInitError: '服务初始化失败，请刷新页面后重试',
  authTimeout: '网络连接超时，请稍后重试',
  authFailedPrefix: '登录状态校验失败：',
  listTimeout: '空间列表加载超时，请稍后重试',
  listFailedPrefix: '空间列表加载失败：',
  needAccessKey: '请输入正确的空间密钥',
  bindTimeout: '绑定空间超时，请稍后重试',
  enterFailedPrefix: '进入失败：',
  clipboardEmpty: '剪贴板里没有可用的空间密钥',
  clipboardReadFailed: '读取剪贴板失败，请手动粘贴密钥',
  inputTitle: '输入空间密钥',
  inputPlaceholder: '请输入空间密钥',
  pasteKey: '粘贴密钥',
  entering: '进入中...',
  enterSpace: '进入空间',
  addOtherSpace: '绑定 / 访问其他空间',
  backToBoundSpaces: '返回已绑定空间',
  unnamedSpace: '未命名空间',
  expired: '已过期',
  remainPrefix: '剩余 ',
  remainSuffix: ' 天',
  unbinding: '解除绑定中',
  unbind: '解除绑定',
  enterAlbum: '进入空间',
  unbindTimeout: '解除绑定超时，请稍后重试',
  unbindFailedPrefix: '解除绑定失败：',
  unbindSuccessPrefix: '已解除绑定「',
  unbindSuccessSuffix: '」',
  unbindModalTitle: '解除空间绑定？',
  currentSpace: '当前空间：',
  unbindModalDesc: '解除后不会删除空间内容，你仍可通过密钥重新进入并再次绑定。',
  cancel: '取消',
  confirmUnbind: '确认解除',
  noLoginTip: '输入密钥即可直接进入空间；登录后还可自动保存绑定记录。',
  noBoundTip: '你还没有已绑定的空间，输入密钥即可进入并自动绑定。',
};

function isTransientConnectionError(message: string): boolean {
  const normalized = String(message ?? '').toLowerCase();
  return (
    normalized.includes('connect timeout') ||
    normalized.includes('request timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('etimedout') ||
    normalized.includes('esockettimedout') ||
    normalized.includes('network')
  );
}

function formatAlbumDate(value: string) {
  return formatDateDisplayUTC8(value, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function getDaysRemaining(expiresAt: string) {
  const expiresAtTs = toTimestampUTC8(expiresAt);
  if (!expiresAtTs) return 0;
  return Math.max(0, Math.ceil((expiresAtTs - Date.now()) / (1000 * 60 * 60 * 24)));
}

export default function AlbumLoginPage() {
  const router = useRouter();

  const [pageLoading, setPageLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [boundAlbums, setBoundAlbums] = useState<BoundAlbum[]>([]);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isWechat, setIsWechat] = useState(false);
  const [unbindingAlbumId, setUnbindingAlbumId] = useState<string | null>(null);
  const [unbindTargetAlbum, setUnbindTargetAlbum] = useState<BoundAlbum | null>(null);
  const [error, setError] = useState('');
  const [listNotice, setListNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const hasBindings = isLoggedIn && boundAlbums.length > 0;
  const loadingTitle = COPY.loadingTitle;
  const loadingDescription = COPY.loadingDesc;

  const loadUserData = async () => {
    setPageLoading(true);
    setError('');

    const dbClient = createClient();
    if (!dbClient) {
      setPageLoading(false);
      setError(COPY.serviceInitError);
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await dbClient.auth.getUser();

    if (userError) {
      setPageLoading(false);
      setIsLoggedIn(false);
      setBoundAlbums([]);
      setError(
        isTransientConnectionError(userError.message || '')
          ? COPY.authTimeout
          : `${COPY.authFailedPrefix}${userError.message || 'Unknown error'}`
      );
      return;
    }

    setIsLoggedIn(Boolean(user));

    if (!user) {
      setBoundAlbums([]);
      setPageLoading(false);
      return;
    }

    const { data, error: loadBindingsError } = await dbClient.rpc('get_user_bound_albums');
    if (loadBindingsError) {
      setBoundAlbums([]);
      setError(
        isTransientConnectionError(loadBindingsError.message || '')
          ? COPY.listTimeout
          : `${COPY.listFailedPrefix}${loadBindingsError.message || 'Unknown error'}`
      );
      setPageLoading(false);
      return;
    }

    setBoundAlbums(Array.isArray(data) ? (data as BoundAlbum[]) : []);
    setPageLoading(false);
  };

  useEffect(() => {
    setIsWechat(isWechatBrowser());
    void loadUserData();
  }, []);

  useEffect(() => {
    if (!listNotice) return;
    const timer = window.setTimeout(() => setListNotice(null), 3000);
    return () => window.clearTimeout(timer);
  }, [listNotice]);

  const emptyTip = useMemo(() => {
    if (!isLoggedIn) {
      return COPY.noLoginTip;
    }
    return COPY.noBoundTip;
  }, [isLoggedIn]);

  const handleAlbumClick = (key: string) => {
    const normalized = normalizeAccessKey(key);
    if (!normalized) return;
    router.push(`/album/${encodeURIComponent(normalized)}`);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setListNotice(null);

    const normalized = normalizeAccessKey(accessKey);
    if (!normalized) {
      setError(COPY.needAccessKey);
      return;
    }

    const dbClient = createClient();
    if (!dbClient) {
      setError(COPY.serviceInitError);
      return;
    }

    setIsLoading(true);
    try {
      if (isLoggedIn) {
        const { error: bindError } = await dbClient.rpc('bind_user_to_album', {
          p_access_key: normalized,
        });
        if (bindError) {
          setError(
            isTransientConnectionError(bindError.message || '')
              ? COPY.bindTimeout
              : `${COPY.enterFailedPrefix}${bindError.message || COPY.needAccessKey}`
          );
          return;
        }
      }

      router.push(`/album/${encodeURIComponent(normalized)}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRequestUnbindAlbum = (album: BoundAlbum) => {
    if (unbindingAlbumId) return;
    setUnbindTargetAlbum(album);
    setListNotice(null);
  };

  const handleCancelUnbindAlbum = () => {
    if (unbindingAlbumId) return;
    setUnbindTargetAlbum(null);
  };

  const handleConfirmUnbindAlbum = async () => {
    if (!unbindTargetAlbum || unbindingAlbumId) return;

    const dbClient = createClient();
    if (!dbClient) {
      setListNotice({ type: 'error', message: COPY.serviceInitError });
      return;
    }

    const targetAlbum = unbindTargetAlbum;
    setUnbindingAlbumId(targetAlbum.id);
    try {
      const { error: unbindError } = await dbClient.rpc('unbind_user_from_album', {
        p_album_id: targetAlbum.id,
      });

      if (unbindError) {
        setListNotice({
          type: 'error',
          message: isTransientConnectionError(unbindError.message || '')
            ? COPY.unbindTimeout
            : `${COPY.unbindFailedPrefix}${unbindError.message || 'Unknown error'}`,
        });
        setUnbindTargetAlbum(null);
        return;
      }

      setBoundAlbums((prev) => prev.filter((album) => album.id !== targetAlbum.id));
      setListNotice({
        type: 'success',
        message: `${COPY.unbindSuccessPrefix}${targetAlbum.title || COPY.unnamedSpace}${COPY.unbindSuccessSuffix}`,
      });
      setUnbindTargetAlbum(null);
    } finally {
      setUnbindingAlbumId(null);
    }
  };

  if (pageLoading) {
    return (
      <MiniProgramRecoveryScreen
        title={loadingTitle}
        description={loadingDescription}
        className="h-[100dvh]"
      />
    );
  }

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#FFFBF0]">
      <div className="flex-none border-b-2 border-dashed border-[#5D4037]/10 bg-[#FFFBF0]/96 shadow-[0_2px_12px_rgba(93,64,55,0.08)] backdrop-blur-md">
        <PageTopHeader title={COPY.fallbackTitle} badge={COPY.fallbackBadge} />
      </div>

      <PreviewAwareScrollArea className="min-h-0 flex-1 overflow-y-auto pb-20" bottomPaddingMode="scroll">
        <div className="mx-auto w-full max-w-[560px] px-6 pt-6">
          <AnimatePresence initial={false}>
            {listNotice ? (
              <motion.div
                key={listNotice.message}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
                  listNotice.type === 'success'
                    ? 'border-green-200 bg-green-50 text-green-700'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}
              >
                {listNotice.message}
              </motion.div>
            ) : null}
          </AnimatePresence>

          {hasBindings && !showKeyInput ? (
            <div className="space-y-4">
              <div className="space-y-3">
                {boundAlbums.map((album, index) => {
                  const daysRemaining = getDaysRemaining(album.expires_at);
                  const isExpired = Boolean(album.is_expired) || daysRemaining <= 0;
                  const expiryText = isExpired
                    ? COPY.expired
                    : `${COPY.remainPrefix}${daysRemaining}${COPY.remainSuffix}`;
                  const albumTitle = album.title || COPY.unnamedSpace;

                  return (
                    <motion.div
                      key={album.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.08 }}
                      whileHover={{ y: -2 }}
                      whileTap={{ scale: 0.995 }}
                      onClick={() => handleAlbumClick(album.access_key)}
                      className="group cursor-pointer rounded-[22px] border border-[#E6D8C5] bg-white/95 px-4 py-4 shadow-[0_10px_24px_rgba(93,64,55,0.08)] transition-[transform,box-shadow] duration-300 hover:shadow-[0_14px_28px_rgba(93,64,55,0.12)]"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        {album.cover_url ? (
                          <img
                            src={album.cover_url}
                            alt={albumTitle}
                            loading="lazy"
                            decoding="async"
                            className="h-[82px] w-[82px] flex-none rounded-[20px] object-cover shadow-[0_8px_18px_rgba(93,64,55,0.12)]"
                          />
                        ) : (
                          <div className="flex h-[82px] w-[82px] flex-none items-center justify-center rounded-[20px] bg-[#F6EFE3] text-[#5D4037]/20 shadow-[0_8px_18px_rgba(93,64,55,0.08)]">
                            <Sparkles className="h-5 w-5" />
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-4">
                            <h3 className="min-w-0 flex-1 truncate text-[18px] font-black leading-tight text-[#5D4037]">
                              {albumTitle}
                            </h3>

                            <div className="flex flex-none items-center gap-2">
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.95 }}
                                disabled={unbindingAlbumId === album.id}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleRequestUnbindAlbum(album);
                                }}
                                aria-label={unbindingAlbumId === album.id ? COPY.unbinding : COPY.unbind}
                                title={unbindingAlbumId === album.id ? COPY.unbinding : COPY.unbind}
                                className="icon-button action-icon-btn action-icon-btn--delete"
                              >
                                {unbindingAlbumId === album.id ? (
                                  <span className="text-sm leading-none text-red-500">…</span>
                                ) : (
                                  <Trash2 className="action-icon-svg action-icon-svg--delete" />
                                )}
                              </motion.button>

                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.96 }}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleAlbumClick(album.access_key);
                                }}
                                aria-label={COPY.enterAlbum}
                                title={COPY.enterAlbum}
                                className="icon-button action-icon-btn action-icon-btn--edit"
                              >
                                <ArrowRight className="action-icon-svg action-icon-svg--edit transition-transform duration-200" />
                              </motion.button>
                            </div>
                          </div>

                          <div className="mt-2 flex items-center justify-between gap-4">
                            <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[#8D6E63]">
                              {formatAlbumDate(album.created_at)}
                            </p>

                            <span
                              className={`inline-flex min-w-[82px] flex-none justify-center rounded-full border px-3 py-1 text-[11px] font-semibold leading-none ${
                                isExpired
                                  ? 'border-red-200 bg-red-50 text-red-500'
                                  : 'border-[#E8DCCA] bg-[#F8F1E4] text-[#6D544A]'
                              }`}
                            >
                              {expiryText}
                            </span>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <motion.button
                type="button"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowKeyInput(true);
                  setError('');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[26px] border-2 border-dashed border-[#5D4037]/28 bg-transparent px-5 py-4 text-[#5D4037]/65 transition-all hover:border-[#5D4037]/50 hover:text-[#5D4037]"
              >
                <Plus className="h-4 w-4" />
                <span className="font-medium">{COPY.addOtherSpace}</span>
              </motion.button>
            </div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mx-auto w-full max-w-md"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', delay: 0.1 }}
                className="mb-6 flex justify-center"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFC857]/20">
                  <Lock className="h-10 w-10 text-[#FFC857]" />
                </div>
              </motion.div>

              <div className="relative overflow-hidden rounded-2xl border border-[#5D4037]/10 bg-white p-[14px] shadow-sm">
                <div className="absolute right-0 top-0 -z-10 h-32 w-32 rounded-full bg-[#FFC857]/10 blur-3xl" />

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <div className="relative rounded-[18px] border border-[#FFC857]/34 bg-gradient-to-b from-[#FFC857]/20 to-[#FFC857]/10 p-[3px] shadow-[inset_0_0.5px_0_rgba(255,255,255,0.9)]">
                      <input
                        type="text"
                        placeholder="输入神秘密钥..."
                        value={accessKey}
                        onChange={(event) => setAccessKey(normalizeAccessKey(event.target.value))}
                        disabled={isLoading}
                        className={`h-[50px] w-full rounded-2xl border-[1.5px] border-[#5D4037]/20 bg-[#FFFCF4] px-[15px] text-center text-[16px] font-bold tracking-[0.08em] transition-all focus:border-[#FFC857] focus:outline-none disabled:opacity-50 ${
                          !isWechat ? 'pr-[50px]' : ''
                        }`}
                        style={{ fontFamily: "'ZQKNNY', 'YouYuan', '幼圆', 'Microsoft YaHei', sans-serif" }}
                      />
                      {!isWechat ? (
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          onClick={async () => {
                            try {
                              const text = await getClipboardText();
                              if (text) {
                                setAccessKey(normalizeAccessKey(text));
                                setError('');
                              } else {
                                setError('💡 提示：您也可以直接在输入框中长按粘贴');
                              }
                            } catch {
                              setError('📋 无法读取剪贴板，请手动粘贴或授权剪贴板权限');
                            }
                          }}
                          disabled={isLoading}
                          className="compact-button absolute right-[8px] top-1/2 z-10 flex h-[34px] w-[34px] -translate-y-1/2 items-center justify-center rounded-full border border-[#5D4037]/14 bg-[#FFE8B0] shadow-[0_3px_6px_rgba(93,64,55,0.12)] transition-colors hover:bg-[#FFD989] disabled:opacity-50"
                          title="粘贴"
                          aria-label="粘贴密钥"
                        >
                          <Clipboard className="h-[15px] w-[15px] text-[#5D4037] opacity-90" strokeWidth={2.2} />
                        </motion.button>
                      ) : null}
                    </div>
                    {error ? (
                      <motion.p
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mt-2 break-words text-center text-sm text-red-500"
                      >
                        {error}
                      </motion.p>
                    ) : null}
                  </div>

                  <motion.button
                    type="submit"
                    disabled={isLoading}
                    whileTap={{ scale: 0.98 }}
                    className="mx-auto flex h-[51px] w-[74%] min-w-[180px] max-w-[250px] items-center justify-center gap-2 rounded-2xl border-2 border-[#5D4037] bg-gradient-to-b from-[#FFD86A] to-[#FFC857] text-[15px] font-black text-[#5D4037] shadow-[0_5px_0_#704D3B] transition-all active:translate-y-[3px] active:shadow-[0_2px_0_#704D3B] disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        >
                          <Sparkles className="h-[17px] w-[17px]" />
                        </motion.div>
                        <span>验证中...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-[17px] w-[17px]" />
                        <span>解锁相册</span>
                      </>
                    )}
                  </motion.button>
                </form>

                <div className="mt-[11px] flex flex-col gap-[5px] border-t border-[#5D4037]/10 pt-[9px]">
                  <p className="text-center text-[11px] text-[#5D4037]/50">
                    💡 提示：输入密钥后即可进入临时相册空间
                  </p>
                  <p className="text-center text-[11px] text-[#5D4037]/50">
                    密钥由管理员提供，到期后空间将自动销毁
                  </p>
                </div>
              </div>

              {hasBindings ? (
                <motion.button
                  type="button"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.24 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowKeyInput(false);
                    setError('');
                  }}
                  className="mt-4 w-full text-sm text-[#5D4037]/60 transition-colors hover:text-[#5D4037]"
                >
                  ← 返回我的相册
                </motion.button>
              ) : null}
            </motion.div>
          )}
        </div>
      </PreviewAwareScrollArea>

      <AnimatePresence>
        {unbindTargetAlbum ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancelUnbindAlbum}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"
            >
              <div className="mb-6 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFC857]/20 text-[#C98A18]">
                  <Unlink2 className="h-8 w-8" />
                </div>
                <h3 className="mb-3 text-xl font-bold text-[#5D4037]">{COPY.unbindModalTitle}</h3>
                <p className="mb-2 text-sm leading-relaxed text-[#5D4037]/70">{COPY.unbindModalDesc}</p>
                <p className="text-xs text-[#5D4037]/50">
                  {COPY.currentSpace}
                  {unbindTargetAlbum.title || COPY.unnamedSpace}
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  disabled={Boolean(unbindingAlbumId)}
                  onClick={handleCancelUnbindAlbum}
                  className="flex-1 rounded-full bg-[#5D4037]/10 px-4 py-3 text-sm font-medium text-[#5D4037] transition-colors hover:bg-[#5D4037]/20 disabled:opacity-60"
                >
                  再想想
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  disabled={Boolean(unbindingAlbumId)}
                  onClick={() => void handleConfirmUnbindAlbum()}
                  className="flex-1 rounded-full bg-[#FFC857] px-4 py-3 text-sm font-medium text-[#5D4037] shadow-md transition-all hover:shadow-lg disabled:opacity-60"
                >
                  {unbindingAlbumId ? COPY.unbinding : COPY.confirmUnbind}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
