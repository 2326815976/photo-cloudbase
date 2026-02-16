import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/security/rate-limit';
import { issueSliderCaptcha } from '@/lib/security/slider-captcha';

export const dynamic = 'force-dynamic';

async function issueCaptcha(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    const issueResult = await issueSliderCaptcha(clientIP, userAgent);

    if (!issueResult.ok) {
      return NextResponse.json(
        {
          error: issueResult.reason || '请求过于频繁，请稍后再试',
          retryAfter: issueResult.retryAfter || 60,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(issueResult.retryAfter || 60),
          },
        }
      );
    }

    return NextResponse.json({
      captchaId: issueResult.captchaId,
      expiresAt: issueResult.expiresAt,
    });
  } catch (error) {
    console.error('生成验证码错误:', error);
    return NextResponse.json({ error: '生成验证码失败' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return issueCaptcha(request);
}

export async function POST(request: NextRequest) {
  return issueCaptcha(request);
}
