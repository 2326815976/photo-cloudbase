'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Calendar, Clipboard, Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
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
  loadingTitle: '\u52A0\u8F7D\u4E2D...',
  loadingDesc: '\u6B63\u5728\u4E3A\u4F60\u6253\u5F00\u7A7A\u95F4\u5165\u53E3',
  serviceInitError: '\u670D\u52A1\u521D\u59CB\u5316\u5931\u8D25\uFF0C\u8BF7\u5237\u65B0\u9875\u9762\u540E\u91CD\u8BD5',
  authTimeout: '\u7F51\u7EDC\u8FDE\u63A5\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5',
  authFailedPrefix: '\u767B\u5F55\u72B6\u6001\u6821\u9A8C\u5931\u8D25\uFF1A',
  listTimeout: '\u7A7A\u95F4\u5217\u8868\u52A0\u8F7D\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5',
  listFailedPrefix: '\u7A7A\u95F4\u5217\u8868\u52A0\u8F7D\u5931\u8D25\uFF1A',
  needAccessKey: '\u8BF7\u8F93\u5165\u6B63\u786E\u7684\u7A7A\u95F4\u5BC6\u94A5',
  bindTimeout: '\u7ED1\u5B9A\u7A7A\u95F4\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5',
  enterFailedPrefix: '\u8FDB\u5165\u5931\u8D25\uFF1A',
  clipboardEmpty: '\u526A\u8D34\u677F\u91CC\u6CA1\u6709\u53EF\u7528\u7684\u7A7A\u95F4\u5BC6\u94A5',
  clipboardReadFailed: '\u8BFB\u53D6\u526A\u8D34\u677F\u5931\u8D25\uFF0C\u8BF7\u624B\u52A8\u7C98\u8D34\u5BC6\u94A5',
  inputTitle: '\u8F93\u5165\u7A7A\u95F4\u5BC6\u94A5',
  inputPlaceholder: '\u8BF7\u8F93\u5165\u7A7A\u95F4\u5BC6\u94A5',
  pasteKey: '\u7C98\u8D34\u5BC6\u94A5',
  entering: '\u8FDB\u5165\u4E2D...',
  enterSpace: '\u8FDB\u5165\u7A7A\u95F4',
  addOtherSpace: '\u7ED1\u5B9A / \u8BBF\u95EE\u5176\u4ED6\u7A7A\u95F4',
  backToBoundSpaces: '\u8FD4\u56DE\u5DF2\u7ED1\u5B9A\u7A7A\u95F4',
  unnamedSpace: '\u672A\u547D\u540D\u7A7A\u95F4',
  expired: '\u5DF2\u8FC7\u671F',
  remainPrefix: '\u5269\u4F59 ',
  remainSuffix: ' \u5929',
  unbinding: '\u89E3\u9664\u7ED1\u5B9A\u4E2D',
  unbind: '\u89E3\u9664\u7ED1\u5B9A',
  enterAlbum: '\u8FDB\u5165\u7A7A\u95F4',
  unbindTimeout: '\u89E3\u9664\u7ED1\u5B9A\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5',
  unbindFailedPrefix: '\u89E3\u9664\u7ED1\u5B9A\u5931\u8D25\uFF1A',
  unbindSuccessPrefix: '\u5DF2\u89E3\u9664\u7ED1\u5B9A\u300C',
  unbindSuccessSuffix: '\u300D',
  unbindModalTitle: '\u89E3\u9664\u7A7A\u95F4\u7ED1\u5B9A\uFF1F',
  currentSpace: '\u5F53\u524D\u7A7A\u95F4\uFF1A',
  unbindModalDesc: '\u89E3\u9664\u540E\u4E0D\u4F1A\u5220\u9664\u7A7A\u95F4\u5185\u5BB9\uFF0C\u4F60\u4ECD\u53EF\u901A\u8FC7\u5BC6\u94A5\u91CD\u65B0\u8FDB\u5165\u5E76\u518D\u6B21\u7ED1\u5B9A\u3002',
  cancel: '\u53D6\u6D88',
  confirmUnbind: '\u786E\u8BA4\u89E3\u9664',
  noLoginTip: '\u8F93\u5165\u5BC6\u94A5\u5373\u53EF\u76F4\u63A5\u8FDB\u5165\u7A7A\u95F4\uFF1B\u767B\u5F55\u540E\u8FD8\u53EF\u81EA\u52A8\u4FDD\u5B58\u7ED1\u5B9A\u8BB0\u5F55\u3002',
  noBoundTip: '\u4F60\u8FD8\u6CA1\u6709\u5DF2\u7ED1\u5B9A\u7684\u7A7A\u95F4\uFF0C\u8F93\u5165\u5BC6\u94A5\u5373\u53EF\u8FDB\u5165\u5E76\u81EA\u52A8\u7ED1\u5B9A\u3002',
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

  const hasBindings = boundAlbums.length > 0;
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
      <div className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]">
        <PageTopHeader title={COPY.fallbackTitle} badge={COPY.fallbackBadge} />
      </div>

      <PreviewAwareScrollArea className="min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-8" bottomPaddingMode="scroll">
        <div className="mx-auto w-full max-w-md space-y-4 pb-4">
          <AnimatePresence initial={false}>
            {listNotice ? (
              <motion.div
                key={listNotice.message}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className={`rounded-2xl px-4 py-3 text-sm font-semibold shadow-sm ${
                  listNotice.type === 'success'
                    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                    : 'border border-red-200 bg-red-50 text-red-600'
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

                  return (
                    <motion.div
                      key={album.id}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.06 }}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleAlbumClick(album.access_key)}
                      className="cursor-pointer overflow-hidden rounded-[28px] border border-[#EADFC8] bg-white px-4 py-4 shadow-[0_10px_26px_rgba(93,64,55,0.08)] transition-shadow duration-300 hover:shadow-[0_14px_30px_rgba(93,64,55,0.12)]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="h-20 w-20 flex-none overflow-hidden rounded-[22px] bg-[#F8F2E6]">
                          {album.cover_url ? (
                            <img
                              src={album.cover_url}
                              alt={album.title || COPY.unnamedSpace}
                              loading="lazy"
                              decoding="async"
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[#5D4037]/22">
                              <Sparkles className="h-8 w-8" />
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <h3 className="truncate text-[15px] font-black text-[#5D4037]">
                            {album.title || COPY.unnamedSpace}
                          </h3>
                          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#8D6E63]">
                            <Calendar className="h-[13px] w-[13px] flex-none" />
                            <span className="truncate">{formatAlbumDate(album.created_at)}</span>
                          </div>
                          <div className={`mt-1 text-[12px] font-medium ${isExpired ? 'text-red-500' : daysRemaining <= 3 ? 'text-orange-500' : 'text-[#8D6E63]'}`}>
                            {'\u2728 '}{expiryText}
                          </div>
                        </div>

                        <div className="flex flex-none items-center gap-2 self-center">
                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.92 }}
                            disabled={unbindingAlbumId === album.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleRequestUnbindAlbum(album);
                            }}
                            aria-label={unbindingAlbumId === album.id ? COPY.unbinding : COPY.unbind}
                            title={unbindingAlbumId === album.id ? COPY.unbinding : COPY.unbind}
                            className="icon-button action-icon-btn action-icon-btn--delete"
                          >
                            <Trash2 className={`action-icon-svg action-icon-svg--delete ${unbindingAlbumId === album.id ? 'animate-pulse' : ''}`} />
                          </motion.button>

                          <motion.button
                            type="button"
                            whileTap={{ scale: 0.98 }}
                            onClick={(event) => {
                              event.stopPropagation();
                              handleAlbumClick(album.access_key);
                            }}
                            aria-label={COPY.enterAlbum}
                            title={COPY.enterAlbum}
                            className="icon-button inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-[#F3D08A] bg-[#FFF7E2] text-[#B7791F] shadow-[0_4px_12px_rgba(255,200,87,0.16)] transition-all hover:bg-[#FFF1CC] hover:text-[#9F6312]"
                          >
                            <ArrowRight className="h-4 w-4 translate-x-[0.5px]" />
                          </motion.button>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              <motion.button
                type="button"
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  setShowKeyInput(true);
                  setError('');
                }}
                className="flex w-full items-center justify-center gap-2 rounded-[28px] border-2 border-dashed border-[#5D4037]/24 bg-transparent px-5 py-5 text-[15px] font-bold text-[#5D4037]/72 transition-colors hover:border-[#5D4037]/40 hover:text-[#5D4037]"
              >
                <Plus className="h-4 w-4" />
                <span>{COPY.addOtherSpace}</span>
              </motion.button>
            </div>
          ) : (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              <div className="rounded-[30px] border border-[#EADFC8] bg-white px-5 py-6 shadow-[0_10px_26px_rgba(93,64,55,0.08)]">
                <div className="mb-6 flex justify-center">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#FFC857]/18 text-[#C7891E]">
                    <Lock className="h-9 w-9" />
                  </div>
                </div>

                <div className="mb-5 text-center">
                  <h2 className="text-xl font-black text-[#5D4037]">{COPY.inputTitle}</h2>
                  <p className="mt-2 text-sm leading-6 text-[#8D6E63]">{emptyTip}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={COPY.inputPlaceholder}
                      value={accessKey}
                      onChange={(event) => setAccessKey(normalizeAccessKey(event.target.value))}
                      disabled={isLoading}
                      className={`h-[52px] w-full rounded-2xl border-[1.5px] bg-[#FFFCF4] px-4 pr-12 text-center text-[16px] font-bold tracking-[0.08em] text-[#5D4037] outline-none transition-colors ${
                        error ? 'border-red-300 focus:border-red-400' : 'border-[#5D4037]/16 focus:border-[#FFC857]'
                      } ${isLoading ? 'opacity-60' : ''}`}
                      style={{ fontFamily: "'ZQKNNY', 'YouYuan', 'Microsoft YaHei', sans-serif" }}
                    />

                    {!isWechat ? (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.94 }}
                        onClick={async () => {
                          try {
                            const text = await getClipboardText();
                            const normalized = normalizeAccessKey(text || '');
                            if (!normalized) {
                              setError(COPY.clipboardEmpty);
                              return;
                            }
                            setAccessKey(normalized);
                            setError('');
                          } catch {
                            setError(COPY.clipboardReadFailed);
                          }
                        }}
                        disabled={isLoading}
                        className="compact-button absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-[#5D4037]/12 bg-[#FFE8B0] text-[#5D4037] shadow-[0_3px_8px_rgba(93,64,55,0.12)] transition-colors hover:bg-[#FFD989] disabled:opacity-60"
                        aria-label={COPY.pasteKey}
                        title={COPY.pasteKey}
                      >
                        <Clipboard className="h-4 w-4" strokeWidth={2.2} />
                      </motion.button>
                    ) : null}
                  </div>

                  {error ? <p className="text-center text-sm text-red-500">{error}</p> : null}

                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.98 }}
                    disabled={isLoading}
                    className="mx-auto flex h-[52px] w-[74%] min-w-[200px] max-w-[280px] items-center justify-center gap-2 rounded-2xl border-2 border-[#5D4037] bg-gradient-to-b from-[#FFD86A] to-[#FFC857] text-[15px] font-black text-[#5D4037] shadow-[0_5px_0_#704D3B] transition-all active:translate-y-[3px] active:shadow-[0_2px_0_#704D3B] disabled:opacity-60"
                  >
                    {isLoading ? (
                      <>
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                          <Sparkles className="h-4 w-4" />
                        </motion.div>
                        <span>{COPY.entering}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4" />
                        <span>{COPY.enterSpace}</span>
                      </>
                    )}
                  </motion.button>
                </form>
              </div>

              {hasBindings ? (
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setShowKeyInput(false);
                    setError('');
                  }}
                  className="mx-auto inline-flex items-center justify-center rounded-full border border-[#5D4037]/14 bg-white px-5 py-2.5 text-sm font-semibold text-[#5D4037]/72 shadow-sm transition-colors hover:text-[#5D4037]"
                >
                  {COPY.backToBoundSpaces}
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
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/42 p-4"
            onClick={() => {
              if (!unbindingAlbumId) {
                setUnbindTargetAlbum(null);
              }
            }}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              onClick={(event) => event.stopPropagation()}
              className="w-full max-w-sm rounded-[28px] bg-white p-6 shadow-[0_22px_60px_rgba(93,64,55,0.24)]"
            >
              <div className="mb-5 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-500">
                  <Trash2 className="h-6 w-6" />
                </div>
                <h3 className="text-xl font-black text-[#5D4037]">{COPY.unbindModalTitle}</h3>
                <p className="mt-3 text-sm leading-6 text-[#8D6E63]">
                  {COPY.currentSpace}<span className="font-semibold text-[#5D4037]">{unbindTargetAlbum.title || COPY.unnamedSpace}</span>
                </p>
                <p className="mt-2 text-sm leading-6 text-[#8D6E63]">{COPY.unbindModalDesc}</p>
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  disabled={Boolean(unbindingAlbumId)}
                  onClick={() => setUnbindTargetAlbum(null)}
                  className="flex-1 rounded-full bg-[#5D4037]/10 px-4 py-3 text-sm font-semibold text-[#5D4037] transition-colors hover:bg-[#5D4037]/16 disabled:opacity-60"
                >
                  {COPY.cancel}
                </button>
                <button
                  type="button"
                  disabled={Boolean(unbindingAlbumId)}
                  onClick={() => void handleConfirmUnbindAlbum()}
                  className="flex-1 rounded-full bg-red-500 px-4 py-3 text-sm font-semibold text-white shadow-[0_10px_18px_rgba(239,68,68,0.24)] transition-colors hover:bg-red-600 disabled:opacity-60"
                >
                  {unbindingAlbumId ? COPY.unbinding : COPY.confirmUnbind}
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

