import { NextRequest, NextResponse } from 'next/server';
import { checkIPRateLimit, recordIPAttempt, getClientIP } from '@/lib/security/rate-limit';
import { registerUserWithPhone } from '@/lib/auth/service';

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

    const { phone, password, turnstileToken } = await request.json();

    if (!phone || !password || !turnstileToken) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }

    if (!/^1[3-9]\d{9}$/.test(phone)) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }

    if (password.length < 6) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json({ error: '密码至少需要 6 位' }, { status: 400 });
    }

    if (process.env.NODE_ENV === 'production') {
      const turnstileResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: process.env.TURNSTILE_SECRET_KEY,
          response: turnstileToken,
        }),
      });

      const turnstileData = await turnstileResponse.json();
      if (!turnstileData.success) {
        await recordIPAttempt(clientIP, false, userAgent);
        return NextResponse.json({ error: '人机验证失败，请重试' }, { status: 400 });
      }
    } else {
      console.log('开发环境：跳过 Turnstile 验证');
    }

    const result = await registerUserWithPhone(phone, password);
    if (result.error || !result.user) {
      await recordIPAttempt(clientIP, false, userAgent);

      let errorMessage = '注册失败，请重试';
      if (result.error === 'already_registered') {
        errorMessage = '该手机号已注册，请直接登录';
      }

      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    await recordIPAttempt(clientIP, true, userAgent);

    return NextResponse.json({
      success: true,
      message: '注册成功',
      user: {
        id: result.user.id,
        phone,
      },
    });
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
