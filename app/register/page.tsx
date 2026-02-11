'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Phone, Lock, ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { env } from '@/lib/env';

// 动态导入 Turnstile 组件，延迟加载，不在首页加载时执行
const Turnstile = dynamic(
  () => import('@marsidev/react-turnstile').then((mod) => mod.Turnstile),
  { ssr: false }
);

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileKey, setTurnstileKey] = useState(0);
  const [turnstileLoading, setTurnstileLoading] = useState(true);

  // 每次进入页面时强制刷新 Turnstile（清除缓存的 token）
  useEffect(() => {
    // 清空旧的 token
    setTurnstileToken('');
    setTurnstileLoading(true);
    // 强制重新渲染 Turnstile 组件
    setTurnstileKey(Date.now());

    // 固定3秒后隐藏加载动画
    const timer = setTimeout(() => {
      setTurnstileLoading(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      setError('请输入有效的手机号');
      return;
    }

    // 验证密码强度
    if (password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }

    // 验证 Turnstile
    if (!turnstileToken) {
      setError('请完成人机验证');
      return;
    }

    setLoading(true);

    try {
      // 调用后端 API 进行注册
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          password,
          turnstileToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '注册失败，请重试');
        // 重置 Turnstile 组件
        setTurnstileToken('');
        setTurnstileKey(prev => prev + 1);
        return;
      }

      // 注册成功，自动登录
      const supabase = createClient();
      if (!supabase) {
        setError('服务初始化失败，请刷新页面后重试');
        return;
      }
      const email = `${phone}@slogan.app`;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        // 登录失败，跳转到登录页面
        setTurnstileToken('');
        router.push('/login');
        return;
      }

      // 登录成功，跳转到个人资料页面
      setTurnstileToken('');
      router.push('/profile');
      router.refresh();
    } catch (err) {
      console.error('注册错误:', err);
      setError('网络错误，请重试');
      // 重置 Turnstile 组件
      setTurnstileToken('');
      setTurnstileKey(prev => prev + 1);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      {/* 返回按钮 */}
      <button
        onClick={() => router.back()}
        className="absolute left-6 top-6 w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

      {/* 标题 */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-12 mt-8"
      >
        <h1 className="text-3xl font-bold text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
          ✨ 欢迎注册
        </h1>
        <p className="text-sm text-[#5D4037]/60">创建账号，开启美好瞬间记录之旅</p>
      </motion.div>

      {/* 表单 */}
      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleRegister}
        className="flex-1 flex flex-col max-w-md mx-auto w-full"
      >
        <div className="space-y-4 mb-6">
          {/* 手机号输入框 */}
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              maxLength={11}
              required
            />
          </div>

          {/* 密码输入框 */}
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="password"
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
          </div>

          {/* Turnstile 验证 */}
          <div className="w-full flex justify-center min-h-[65px] relative">
            {turnstileLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-lg">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-3 border-[#FFC857] border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm text-[#5D4037]/60">加载人机验证中...</span>
                </div>
              </div>
            )}
            <Turnstile
              key={turnstileKey}
              siteKey={env.TURNSTILE_SITE_KEY() || '0x4AAAAAACXpmi0p6LhPcGAW'}
              onSuccess={(token) => {
                setTurnstileToken(token);
                setError('');
              }}
              onError={(errorCode) => {
                console.error('Turnstile 错误:', errorCode);
                setError('人机验证失败，请刷新重试');
              }}
              onTimeout={() => {
                console.error('Turnstile 超时');
                setError('验证超时，请重试');
              }}
              onExpire={() => {
                console.error('Turnstile 过期');
                setTurnstileToken('');
              }}
              options={{
                theme: 'light',
                size: 'normal',
                retry: 'auto',
                retryInterval: 8000,
                refreshExpired: 'auto',
                language: 'zh-cn',
                execution: 'render',
                appearance: 'always',
              }}
            />
          </div>

          {/* 错误提示 */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="bg-red-50 border border-red-200 rounded-2xl p-3 text-sm text-red-600 text-center"
              >
                {error}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* 提交按钮 */}
        <motion.button
          type="submit"
          disabled={loading}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full h-16 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-[#5D4037] font-bold text-lg disabled:opacity-50 transition-all"
        >
          {loading ? '注册中...' : '立即注册 →'}
        </motion.button>

        {/* 底部链接 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-center mt-8"
        >
          <p className="text-sm text-[#5D4037]/60">
            已有账号？
            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-[#FFC857] font-medium ml-1 hover:underline"
            >
              立即登录
            </button>
          </p>
        </motion.div>
      </motion.form>

      {/* 底部提示 */}
      <p className="text-center text-xs text-[#5D4037]/40 mt-6">
        注册即表示同意我们的服务条款和隐私政策
      </p>
    </div>
  );
}
