'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, Sparkles, Plus, Calendar, Clipboard, Unlink2 } from 'lucide-react';
import { createClient } from '@/lib/cloudbase/client';
import { getClipboardText } from '@/lib/android';
import { isWechatBrowser } from '@/lib/wechat';
import { formatDateDisplayUTC8, toTimestampUTC8 } from '@/lib/utils/date-helpers';
import { normalizeAccessKey } from '@/lib/utils/access-key';

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

export default function AlbumLoginPage() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [boundAlbums, setBoundAlbums] = useState<BoundAlbum[]>([]);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [accessKey, setAccessKey] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [unbindingAlbumId, setUnbindingAlbumId] = useState<string | null>(null);
  const [unbindTargetAlbum, setUnbindTargetAlbum] = useState<BoundAlbum | null>(null);
  const [error, setError] = useState('');
  const [listNotice, setListNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [isWechat, setIsWechat] = useState(false);

  // 检测微信环境
  useEffect(() => {
    setIsWechat(isWechatBrowser());
  }, []);

  // 初始化时检查登录状态并加载绑定相册
  useEffect(() => {
    loadUserData();
  }, []);

  useEffect(() => {
    if (!listNotice) {
      return;
    }
    const timer = setTimeout(() => {
      setListNotice(null);
    }, 3000);
    return () => clearTimeout(timer);
  }, [listNotice]);

  const loadUserData = async () => {
    setPageLoading(true);
    const dbClient = createClient();
    if (!dbClient) {
      setPageLoading(false);
      setError('服务初始化失败，请刷新页面后重试');
      return;
    }
    const {
      data: { user },
      error: userError,
    } = await dbClient.auth.getUser();

    if (userError) {
      setIsLoggedIn(false);
      setBoundAlbums([]);
      setPageLoading(false);
      setError(
        isTransientConnectionError(userError.message || '')
          ? '⚠️ 会话连接超时，请稍后重试'
          : `⚠️ 会话校验失败：${userError.message || '未知错误'}`
      );
      return;
    }

    setIsLoggedIn(!!user);

    if (user) {
      // 加载用户绑定的相册
      const { data, error: loadBindingsError } = await dbClient.rpc('get_user_bound_albums');
      if (!loadBindingsError && data) {
        setBoundAlbums(data);
      } else if (loadBindingsError) {
        setBoundAlbums([]);
        setListNotice({
          type: 'error',
          message: isTransientConnectionError(loadBindingsError.message || '')
            ? '空间列表加载超时，请稍后重试'
            : `空间列表加载失败：${loadBindingsError.message || '未知错误'}`,
        });
      }
    }
    setPageLoading(false);
  };

  const handleAlbumClick = (accessKey: string) => {
    router.push(`/album/${normalizeAccessKey(accessKey)}`);
  };

  const handleRequestUnbindAlbum = (album: BoundAlbum) => {
    if (unbindingAlbumId) {
      return;
    }
    setUnbindTargetAlbum(album);
  };

  const handleCancelUnbindAlbum = () => {
    if (unbindingAlbumId) {
      return;
    }
    setUnbindTargetAlbum(null);
  };

  const handleConfirmUnbindAlbum = async () => {
    if (!unbindTargetAlbum || unbindingAlbumId) {
      return;
    }

    const targetAlbum = unbindTargetAlbum;
    const albumTitle = targetAlbum.title || '未命名空间';

    setListNotice(null);
    setUnbindingAlbumId(targetAlbum.id);

    const dbClient = createClient();
    if (!dbClient) {
      setUnbindingAlbumId(null);
      setUnbindTargetAlbum(null);
      setListNotice({ type: 'error', message: '服务初始化失败，请刷新页面后重试' });
      return;
    }

    const { error: unbindError } = await dbClient.rpc('unbind_user_from_album', {
      p_album_id: targetAlbum.id
    });

    if (unbindError) {
      setUnbindingAlbumId(null);
      setUnbindTargetAlbum(null);
      setListNotice({
        type: 'error',
        message: `解除绑定失败：${unbindError.message || '未知错误'}`
      });
      return;
    }

    setBoundAlbums(prev => prev.filter((item) => item.id !== targetAlbum.id));
    setUnbindingAlbumId(null);
    setUnbindTargetAlbum(null);
    setListNotice({ type: 'success', message: `已解除绑定「${albumTitle}」` });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedAccessKey = normalizeAccessKey(accessKey);
    if (!normalizedAccessKey) {
      setError('请输入密钥');
      return;
    }

    setIsLoading(true);
    setAccessKey(normalizedAccessKey);

    const dbClient = createClient();
    if (!dbClient) {
      setError('服务初始化失败，请刷新页面后重试');
      setIsLoading(false);
      return;
    }

    // 使用 get_album_content RPC 验证密钥（可以绕过 RLS）
    const { data, error: checkError } = await dbClient.rpc('get_album_content', {
      input_key: normalizedAccessKey
    });

    if (checkError) {
      const rawMessage = String(
        (checkError as { message?: unknown; details?: unknown })?.message ??
        (checkError as { message?: unknown; details?: unknown })?.details ??
        '验证失败'
      );
      const normalizedMessage = rawMessage.toLowerCase();
      if (rawMessage.includes('密钥错误') || rawMessage.includes('密钥不存在')) {
        setError('❌ 密钥不存在，请检查后重试');
      } else if (
        normalizedMessage.includes('timeout') ||
        normalizedMessage.includes('timed out') ||
        normalizedMessage.includes('connect') ||
        normalizedMessage.includes('network') ||
        rawMessage.includes('连接')
      ) {
        setError('⚠️ 服务连接异常，请稍后重试');
      } else {
        setError(`⚠️ 验证失败：${rawMessage}`);
      }
      setIsLoading(false);
      return;
    }

    if (!data) {
      setError('❌ 密钥不存在，请检查后重试');
      setIsLoading(false);
      return;
    }

    // 检查是否过期
    if (data.album?.is_expired) {
      setError('⏰ 该空间已过期');
      setIsLoading(false);
      return;
    }

    // 如果已登录，先尝试绑定该相册
    if (isLoggedIn) {
      const { error: bindError } = await dbClient.rpc('bind_user_to_album', {
        p_access_key: normalizedAccessKey
      });

      if (!bindError) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem(`album_bind_notice_${normalizedAccessKey}`, '1');
        }
      }
    }

    // 验证通过，跳转到专属空间
    router.push(`/album/${normalizedAccessKey}`);
  };

  const hasBindings = isLoggedIn && boundAlbums.length > 0;

  // 格式化日期
  const formatDate = (dateStr: string) => {
    return formatDateDisplayUTC8(dateStr, { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  // 计算剩余天数
  const getDaysRemaining = (expiresAt: string) => {
    const expiryTime = toTimestampUTC8(expiresAt);
    if (expiryTime <= 0) {
      return 0;
    }
    const diff = Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  // 加载状态
  if (pageLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-6"
        >
          {/* 时光中动画 */}
          <div className="relative">
            {/* 外圈旋转 */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
              className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857]"
            />
            {/* 内圈反向旋转 */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037]"
            />
            {/* 中心图标 */}
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-[#FFC857]" />
            </div>
          </div>

          {/* 加载文字 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-center"
          >
            <p className="text-lg font-medium text-[#5D4037] mb-2">
              时光中...
            </p>
            <p className="text-sm text-[#5D4037]/60">
              正在加载返图空间
            </p>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      {/* 手账风页头 - 使用弹性布局适配不同屏幕 */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-none bg-[#FFFBF0]/95 backdrop-blur-md border-b-2 border-dashed border-[#5D4037]/15 shadow-[0_2px_12px_rgba(93,64,55,0.08)]"
      >
        <div className="px-4 py-3 flex items-center justify-between gap-2">
          <h1 className="text-xl font-bold text-[#5D4037] leading-none truncate" style={{ fontFamily: "'ZQKNNY', cursive" }}>专属返图空间</h1>
          <div className="inline-block px-2.5 py-0.5 bg-[#FFC857]/30 rounded-full transform -rotate-1 flex-shrink-0">
            <p className="text-[10px] font-bold text-[#8D6E63] tracking-wide whitespace-nowrap">🤫 嘘，这里藏着你的独家记忆 🤫</p>
          </div>
        </div>
      </motion.div>

      {/* 滚动区域 */}
      <div className="flex-1 overflow-y-auto px-6 pt-6 pb-20">
        {listNotice && (
          <div
            className={`mb-4 rounded-xl border px-4 py-3 text-sm ${
              listNotice.type === 'success'
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-red-50 border-red-200 text-red-700'
            }`}
          >
            {listNotice.message}
          </div>
        )}

        {/* 场景一：已登录且有绑定相册 */}
        {hasBindings && !showKeyInput ? (
          <div className="space-y-4">
            {/* 我的相册列表 */}
            <div className="space-y-3">
              {boundAlbums.map((album, index) => {
                const daysRemaining = getDaysRemaining(album.expires_at);
                const isExpired = album.is_expired;

                return (
                  <motion.div
                    key={album.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => handleAlbumClick(album.access_key)}
                    className="bg-white rounded-2xl shadow-[0_4px_12px_rgba(93,64,55,0.08)] hover:shadow-[0_6px_16px_rgba(93,64,55,0.12)] border border-[#5D4037]/10 overflow-hidden cursor-pointer transition-shadow duration-300"
                  >
                    <div className="flex gap-4 p-4">
                      {/* 封面图 */}
                      <div className="flex-none w-24 rounded-2xl overflow-hidden bg-gray-100">
                        {album.cover_url ? (
                          <img
                            src={album.cover_url}
                            alt={album.title}
                            loading="lazy"
                            decoding="async"
                            className="w-full h-auto"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[#5D4037]/20">
                            <Sparkles className="w-8 h-8" />
                          </div>
                        )}
                      </div>

                      {/* 信息区 */}
                      <div className="flex-1 flex flex-col justify-center">
                        <h3 className="text-base font-bold text-[#5D4037] mb-1">
                          {album.title || '未命名空间'}
                        </h3>
                        <div className="flex items-center gap-3 text-xs text-[#5D4037]/50 mb-1">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {formatDate(album.created_at)}
                          </span>
                        </div>
                        {/* 有效期提示 */}
                        <div className={`text-xs ${isExpired ? 'text-red-500' : daysRemaining <= 3 ? 'text-orange-500' : 'text-[#5D4037]/50'}`}>
                          {isExpired ? '⚠️ 已过期' : `✨ 剩余 ${daysRemaining} 天`}
                        </div>
                      </div>

                      {/* 操作区 */}
                      <div className="flex-none flex flex-col items-end justify-between gap-2">
                        <div className="w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center">
                          <span className="text-[#FFC857]">→</span>
                        </div>
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.95 }}
                          disabled={unbindingAlbumId === album.id}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleRequestUnbindAlbum(album);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 disabled:opacity-60"
                        >
                          <Unlink2 className="h-3.5 w-3.5" />
                          <span>{unbindingAlbumId === album.id ? '解除中...' : '解除绑定'}</span>
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* 添加新空间按钮 */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowKeyInput(true)}
              className="w-full bg-transparent border-2 border-dashed border-[#5D4037]/30 rounded-2xl p-6 flex items-center justify-center gap-2 text-[#5D4037]/60 hover:border-[#5D4037]/50 hover:text-[#5D4037] transition-all"
            >
              <Plus className="w-5 h-5" />
              <span className="font-medium">绑定/访问其他空间</span>
            </motion.button>
          </div>
        ) : (
          /* 场景二：密钥输入框 */
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-md mx-auto"
          >
            {/* 图标 */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', delay: 0.1 }}
              className="flex justify-center mb-6"
            >
              <div className="w-20 h-20 bg-[#FFC857]/20 rounded-full flex items-center justify-center">
                <Lock className="w-10 h-10 text-[#FFC857]" />
              </div>
            </motion.div>

            {/* 输入卡片 */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#5D4037]/10 p-6 relative overflow-hidden">
              {/* 装饰性背景 */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#FFC857]/10 rounded-full blur-3xl -z-10" />

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="输入神秘密钥..."
                      value={accessKey}
                      onChange={(e) => setAccessKey(normalizeAccessKey(e.target.value))}
                      disabled={isLoading}
                      className={`w-full px-4 py-3 ${!isWechat ? 'pr-12' : ''} text-center text-lg tracking-wider bg-[#FFFBF0] border-2 border-[#5D4037]/20 rounded-2xl focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.15)] transition-all disabled:opacity-50`}
                    />
                    {!isWechat && (
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.9 }}
                        onClick={async () => {
                          try {
                            const text = await getClipboardText();
                            if (text) {
                              setAccessKey(normalizeAccessKey(text));
                              setError('');
                            } else {
                              // 提示用户可以手动粘贴
                              setError('💡 提示：您也可以直接在输入框中长按粘贴');
                            }
                          } catch (err) {
                            setError('📋 无法读取剪贴板，请手动粘贴或授权剪贴板权限');
                          }
                        }}
                        disabled={isLoading}
                        className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[#FFC857]/20 hover:bg-[#FFC857]/30 flex items-center justify-center transition-colors disabled:opacity-50"
                        title="粘贴"
                      >
                        <Clipboard className="w-4 h-4 text-[#5D4037]" />
                      </motion.button>
                    )}
                  </div>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-sm text-red-500 mt-2 text-center whitespace-nowrap overflow-x-auto"
                    >
                      {error}
                    </motion.p>
                  )}
                </div>

                <motion.button
                  type="submit"
                  disabled={isLoading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full h-12 rounded-2xl bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] hover:shadow-[2px_2px_0px_#5D4037] hover:translate-x-[2px] hover:translate-y-[2px] text-[#5D4037] font-bold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Sparkles className="w-5 h-5" />
                      </motion.div>
                      <span>验证中...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>开启回忆</span>
                    </>
                  )}
                </motion.button>
              </form>

              {/* 提示信息 */}
              <div className="mt-6 pt-6 border-t border-[#5D4037]/10">
                <p className="text-xs text-[#5D4037]/50 text-center mb-2 whitespace-nowrap overflow-x-auto">
                  💡 提示：{isLoggedIn ? '输入密钥后将自动绑定并直接进入返图空间' : '登录后可绑定空间，下次无需输入密钥'}
                </p>
                <p className="text-xs text-[#5D4037]/50 text-center whitespace-nowrap overflow-x-auto">
                  密钥由摄影师提供，请妥善保管
                </p>
              </div>
            </div>

            {/* 返回按钮 */}
            {hasBindings && (
              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
                onClick={() => setShowKeyInput(false)}
                className="w-full mt-4 text-sm text-[#5D4037]/60 hover:text-[#5D4037] transition-colors"
              >
                ← 返回我的相册
              </motion.button>
            )}
          </motion.div>
        )}
      </div>

      {/* 解除绑定确认弹窗（对齐定格弹窗风格） */}
      <AnimatePresence>
        {unbindTargetAlbum && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleCancelUnbindAlbum}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6"
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl"
            >
              <div className="text-center mb-6">
                <div className="w-16 h-16 bg-[#FFC857]/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Unlink2 className="w-8 h-8 text-[#FFC857]" />
                </div>
                <h3 className="text-xl font-bold text-[#5D4037] mb-3">解除空间绑定？</h3>
                <p className="text-sm text-[#5D4037]/70 leading-relaxed mb-2">
                  解除后不会删除空间内容，你仍可通过密钥重新进入并再次绑定。
                </p>
                <p className="text-xs text-[#5D4037]/50">
                  当前空间：{unbindTargetAlbum.title || '未命名空间'}
                </p>
              </div>

              <div className="flex gap-3">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={!!unbindingAlbumId}
                  onClick={handleCancelUnbindAlbum}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#5D4037]/10 text-[#5D4037] hover:bg-[#5D4037]/20 transition-colors disabled:opacity-60"
                >
                  再想想
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  disabled={!!unbindingAlbumId}
                  onClick={() => {
                    void handleConfirmUnbindAlbum();
                  }}
                  className="flex-1 px-4 py-3 rounded-full text-sm font-medium bg-[#FFC857] text-[#5D4037] shadow-md hover:shadow-lg transition-all disabled:opacity-60"
                >
                  {unbindingAlbumId ? '解除中...' : '确认解除'}
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


