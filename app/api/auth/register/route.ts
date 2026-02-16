import { NextRequest, NextResponse } from 'next/server';
import { checkIPRateLimit, recordIPAttempt, getClientIP } from '@/lib/security/rate-limit';
import { consumeSliderCaptchaToken } from '@/lib/security/slider-captcha';
import { createSession } from '@/lib/auth/session-store';
import { getSessionCookieOptions, SESSION_COOKIE_NAME } from '@/lib/auth/cookie';
import { registerUserWithPhone } from '@/lib/auth/service';
import { isValidChinaMobile, normalizeChinaMobile } from '@/lib/utils/phone';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    const rateLimitCheck = await checkIPRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      return NextResponse.json(
        {
          error: rateLimitCheck.reason || '请求过于频繁，请稍后重试',
          retryAfter: rateLimitCheck.retryAfter,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitCheck.retryAfter || 3600),
          },
        }
      );
    }

    const { phone, password, captchaId, captchaToken } = await request.json();
    const normalizedPhone = normalizeChinaMobile(String(phone ?? ''));

    if (!normalizedPhone || !password || !captchaId || !captchaToken) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    if (!isValidChinaMobile(normalizedPhone)) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }

    if (password.length < 6) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 });
    }

    const captchaValid = await consumeSliderCaptchaToken(
      String(captchaId),
      String(captchaToken),
      clientIP,
      userAgent
    );

    if (!captchaValid) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '验证码错误或已过期，请重新验证' }, { status: 400 });
    }

    const result = await registerUserWithPhone(normalizedPhone, password);
    if (result.error || !result.user) {
      await recordIPAttempt(clientIP, false, userAgent);

      let errorMessage = '注册失败，请重试';
      if (result.error === 'already_registered') {
        errorMessage = '该手机号已注册，请直接登录';
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    await recordIPAttempt(clientIP, true, userAgent);

    const response = NextResponse.json({
      success: true,
      message: '注册成功',
      user: {
        id: result.user.id,
        phone: normalizedPhone,
      },
    });

    try {
      const sessionToken = await createSession(result.user.id, userAgent, clientIP);
      response.cookies.set(SESSION_COOKIE_NAME, sessionToken, getSessionCookieOptions());
    } catch (sessionError) {
      console.error('注册后自动登录失败:', sessionError);
      // 保持注册成功语义；未写入会话时前端可提示手动登录
    }

    return response;
  } catch (error) {
    console.error('注册错误:', error);

    try {
      const clientIP = getClientIP(request);
      const userAgent = request.headers.get('user-agent') || undefined;
      await recordIPAttempt(clientIP, false, userAgent);
    } catch (recordError) {
      console.error('记录IP尝试失败:', recordError);
    }

    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 });
  }
}
