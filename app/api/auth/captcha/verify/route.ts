import { NextRequest, NextResponse } from 'next/server';
import { getClientIP } from '@/lib/security/rate-limit';
import { verifySliderCaptcha } from '@/lib/security/slider-captcha';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    const body = await request.json();
    const verifyResult = await verifySliderCaptcha(
      {
        captchaId: String(body?.captchaId || ''),
        positionPercent: Number(body?.positionPercent),
        trajectory: Array.isArray(body?.trajectory) ? body.trajectory : [],
        startTime: Number(body?.startTime),
        containerWidth: Number(body?.containerWidth),
        sliderWidth: Number(body?.sliderWidth),
      },
      clientIP,
      userAgent
    );

    if (!verifyResult.valid) {
      return NextResponse.json({
        valid: false,
        refreshCaptcha: verifyResult.refreshCaptcha || false,
        error: verifyResult.error || '验证失败，请重试',
      });
    }

    return NextResponse.json({
      valid: true,
      verificationToken: verifyResult.verificationToken,
    });
  } catch (error) {
    console.error('验证码验证错误:', error);
    return NextResponse.json(
      {
        valid: false,
        refreshCaptcha: false,
        error: '验证失败，请重试',
      },
      { status: 500 }
    );
  }
}
