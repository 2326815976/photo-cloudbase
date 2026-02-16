'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { Phone, Lock, ArrowLeft, Eye, EyeOff, ChevronsRight, RotateCcw } from 'lucide-react';
import { clampChinaMobileInput, isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';

const SLIDER_WIDTH = 56;

interface SliderPoint {
  position: number;
  timestamp: number;
}

export default function RegisterPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaToken, setCaptchaToken] = useState('');
  const [captchaExpiresAt, setCaptchaExpiresAt] = useState(0);
  const [sliderPixelPosition, setSliderPixelPosition] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [isCaptchaVerifying, setIsCaptchaVerifying] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startTimeRef = useRef(0);
  const trajectoryRef = useRef<SliderPoint[]>([]);

  const resetSlider = useCallback(() => {
    setSliderPixelPosition(0);
    setIsDragging(false);
    setIsVerified(false);
    setCaptchaToken('');
    trajectoryRef.current = [];
    startTimeRef.current = 0;
  }, []);

  const loadCaptcha = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/captcha', { cache: 'no-store' });
      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '加载验证码失败，请稍后重试');
        return;
      }

      setCaptchaId(String(data.captchaId || ''));
      setCaptchaExpiresAt(Number(data.expiresAt || 0));
      resetSlider();
      setError('');
    } catch (err) {
      console.error('加载验证码错误:', err);
      setError('加载验证码失败，请刷新重试');
    }
  }, [resetSlider]);

  const handleSliderStart = (e: React.MouseEvent | React.TouchEvent) => {
    if (isVerified || isCaptchaVerifying || !captchaId) return;

    if ('touches' in e && e.cancelable) {
      e.preventDefault();
    }

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const now = Date.now();

    startXRef.current = clientX;
    startTimeRef.current = now;
    trajectoryRef.current = [{ position: sliderPixelPosition, timestamp: now }];
    setIsDragging(true);
    setIsVerified(false);
    setCaptchaToken('');
    setError('');
  };

  const handleSliderMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isDragging || isVerified || isCaptchaVerifying || !containerRef.current) return;

      if ('touches' in e && e.cancelable) {
        e.preventDefault();
      }

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const offset = clientX - startXRef.current;

      const containerWidth = containerRef.current.clientWidth;
      const maxPosition = containerWidth - SLIDER_WIDTH;

      let newLeft = offset;
      if (newLeft < 0) newLeft = 0;
      if (newLeft > maxPosition) newLeft = maxPosition;

      setSliderPixelPosition(newLeft);

      const now = Date.now();
      const lastPoint = trajectoryRef.current[trajectoryRef.current.length - 1];
      if (!lastPoint || now - lastPoint.timestamp >= 12 || Math.abs(newLeft - lastPoint.position) >= 1) {
        const timestamp = lastPoint ? Math.max(now, lastPoint.timestamp + 1) : now;
        trajectoryRef.current.push({
          position: newLeft,
          timestamp,
        });
      }
    },
    [isDragging, isVerified, isCaptchaVerifying]
  );

  const handleSliderEnd = useCallback(async () => {
    if (!isDragging || isVerified || isCaptchaVerifying || !containerRef.current) return;

    const containerWidth = containerRef.current.clientWidth;
    const maxPosition = containerWidth - SLIDER_WIDTH;

    setIsDragging(false);

    if (sliderPixelPosition < maxPosition - 3) {
      setSliderPixelPosition(0);
      return;
    }

    if (!captchaId || !startTimeRef.current) {
      setError('验证码已失效，请刷新重试');
      await loadCaptcha();
      return;
    }

    if (captchaExpiresAt > 0 && Date.now() > captchaExpiresAt) {
      setError('验证码已过期，请重新验证');
      await loadCaptcha();
      return;
    }

    setSliderPixelPosition(maxPosition);
    const lastPoint = trajectoryRef.current[trajectoryRef.current.length - 1];
    const finalTimestamp = lastPoint ? Math.max(Date.now(), lastPoint.timestamp + 1) : Date.now();
    trajectoryRef.current.push({
      position: maxPosition,
      timestamp: finalTimestamp,
    });

    setIsCaptchaVerifying(true);

    try {
      const response = await fetch('/api/auth/captcha/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          captchaId,
          positionPercent: 100,
          trajectory: trajectoryRef.current,
          startTime: startTimeRef.current,
          containerWidth,
          sliderWidth: SLIDER_WIDTH,
        }),
      });

      const data = await response.json();

      if (response.ok && data.valid && data.verificationToken) {
        setIsVerified(true);
        setCaptchaToken(String(data.verificationToken));
        setError('');
        return;
      }

      setIsVerified(false);
      setCaptchaToken('');
      setError(data.error || '验证失败，请重新拖动');

      if (data.refreshCaptcha) {
        await loadCaptcha();
      } else {
        setSliderPixelPosition(0);
      }
    } catch (err) {
      console.error('验证错误:', err);
      setIsVerified(false);
      setCaptchaToken('');
      setError('验证失败，请重新拖动');
      await loadCaptcha();
    } finally {
      setIsCaptchaVerifying(false);
    }
  }, [
    isDragging,
    isVerified,
    isCaptchaVerifying,
    sliderPixelPosition,
    captchaId,
    captchaExpiresAt,
    loadCaptcha,
  ]);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleSliderMove);
      document.addEventListener('mouseup', handleSliderEnd);
      document.addEventListener('touchmove', handleSliderMove, { passive: false });
      document.addEventListener('touchend', handleSliderEnd);
    } else {
      document.removeEventListener('mousemove', handleSliderMove);
      document.removeEventListener('mouseup', handleSliderEnd);
      document.removeEventListener('touchmove', handleSliderMove);
      document.removeEventListener('touchend', handleSliderEnd);
    }

    return () => {
      document.removeEventListener('mousemove', handleSliderMove);
      document.removeEventListener('mouseup', handleSliderEnd);
      document.removeEventListener('touchmove', handleSliderMove);
      document.removeEventListener('touchend', handleSliderEnd);
    };
  }, [isDragging, handleSliderMove, handleSliderEnd]);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const normalizedPhone = normalizeChinaMobile(phone);

    if (!isValidChinaMobile(normalizedPhone)) {
      setError('请输入有效的手机号');
      return;
    }

    if (password.length < 6) {
      setError('密码至少需要 6 位');
      return;
    }

    if (!isVerified || !captchaToken) {
      setError('请完成滑块验证');
      return;
    }

    if (!captchaId) {
      setError('验证码已过期，请刷新重试');
      return;
    }

    if (captchaExpiresAt > 0 && Date.now() > captchaExpiresAt) {
      setError('验证码已过期，请重新验证');
      await loadCaptcha();
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          phone: normalizedPhone,
          password,
          captchaId,
          captchaToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || '注册失败，请重试');
        await loadCaptcha();
        return;
      }

      const sessionResponse = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-store',
      });
      const sessionBody = await sessionResponse.json().catch(() => null);
      const hasSessionUser = Boolean(sessionResponse.ok && (sessionBody?.user || sessionBody?.session?.user));

      if (!hasSessionUser) {
        const loginResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            phone: normalizedPhone,
            password,
          }),
        });
        const loginBody = await loginResponse.json().catch(() => null);

        if (!loginResponse.ok || loginBody?.error || !loginBody?.data?.user) {
          setError('注册成功，但自动登录失败，请前往登录页手动登录');
          router.push('/login');
          return;
        }
      }

      router.push('/profile');
      router.refresh();
    } catch (err) {
      console.error('注册错误:', err);
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFBF0] flex flex-col px-8 pt-12 pb-20">
      <button
        onClick={() => router.back()}
        className="absolute left-6 top-6 w-8 h-8 rounded-full bg-[#FFC857]/20 flex items-center justify-center hover:bg-[#FFC857]/30 transition-colors"
      >
        <ArrowLeft className="w-5 h-5 text-[#5D4037]" />
      </button>

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

      <motion.form
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        onSubmit={handleRegister}
        className="flex-1 flex flex-col max-w-md mx-auto w-full"
      >
        <div className="space-y-4 mb-6">
          <div className="relative">
            <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type="tel"
              placeholder="手机号"
              value={phone}
              onChange={(e) => setPhone(clampChinaMobileInput(e.target.value))}
              className="w-full h-14 pl-12 pr-4 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              maxLength={11}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="tel"
              required
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#5D4037]/40" />
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full h-14 pl-12 pr-12 rounded-full bg-white border-2 border-[#5D4037]/20 focus:border-[#FFC857] focus:outline-none focus:shadow-[0_0_0_3px_rgba(255,200,87,0.1)] transition-all text-[#5D4037] placeholder:text-[#5D4037]/40 text-base"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#5D4037]/40 hover:text-[#5D4037] transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <p className="text-xs text-[#5D4037]/60">安全验证</p>
              <button
                type="button"
                onClick={loadCaptcha}
                disabled={loading || isCaptchaVerifying || isDragging}
                className="inline-flex items-center gap-1 text-xs text-[#5D4037]/65 hover:text-[#5D4037] disabled:opacity-40 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                刷新
              </button>
            </div>

            <div
              ref={containerRef}
              className="slider-container relative w-full h-14 bg-gradient-to-r from-white via-[#fffef6] to-[#fff7e0] border-2 border-[#5D4037]/20 rounded-2xl flex items-center overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
            >
              <div
                className="absolute left-0 top-0 h-full bg-[#FFC857]/20 rounded-l-2xl pointer-events-none"
                style={{
                  width: `${Math.max(SLIDER_WIDTH, sliderPixelPosition + SLIDER_WIDTH)}px`,
                  transition: isDragging ? 'none' : 'width 0.2s',
                }}
              />

              <div
                className={`relative z-10 h-full w-14 border-r-2 border-[#5D4037]/20 rounded-l-2xl flex items-center justify-center select-none ${
                  isVerified ? 'bg-[#b8f2c6]' : 'bg-[#FFC857]'
                } ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                style={{
                  left: '0',
                  transform: `translateX(${sliderPixelPosition}px)`,
                  transition: isDragging ? 'none' : 'transform 0.2s',
                }}
                onMouseDown={handleSliderStart}
                onTouchStart={handleSliderStart}
              >
                <ChevronsRight className="w-5 h-5 text-[#5D4037]" />
              </div>

              <div className="absolute inset-0 flex items-center justify-center text-sm text-[#5D4037]/55 pointer-events-none">
                {isVerified
                  ? '验证成功，继续注册'
                  : isCaptchaVerifying
                    ? '正在验证轨迹...'
                    : '向右拖动滑块完成验证'}
              </div>
            </div>
          </div>

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

        <motion.button
          type="submit"
          disabled={loading || isCaptchaVerifying}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          className="w-full h-16 rounded-full bg-[#FFC857] border-2 border-[#5D4037] shadow-[4px_4px_0px_#5D4037] text-[#5D4037] font-bold text-lg disabled:opacity-50 transition-all"
        >
          {loading ? '注册中...' : '立即注册 →'}
        </motion.button>

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

      <p className="text-center text-xs text-[#5D4037]/40 mt-6">注册即表示同意我们的服务条款和隐私政策</p>
    </div>
  );
}
