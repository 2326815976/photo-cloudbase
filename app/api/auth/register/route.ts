import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkIPRateLimit, recordIPAttempt, getClientIP } from '@/lib/security/rate-limit';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    // 0. 获取客户端IP并检查频率限制
    const clientIP = getClientIP(request);
    const userAgent = request.headers.get('user-agent') || undefined;

    const rateLimitCheck = await checkIPRateLimit(clientIP);
    if (!rateLimitCheck.allowed) {
      // BUG修复：不记录被限制的请求，避免数据膨胀
      return NextResponse.json(
        {
          error: rateLimitCheck.reason || '请求过于频繁，请稍后重试',
          retryAfter: rateLimitCheck.retryAfter
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimitCheck.retryAfter || 3600)
          }
        }
      );
    }

    const { phone, password, turnstileToken } = await request.json();

    // 1. 验证必填字段
    if (!phone || !password || !turnstileToken) {
      // BUG修复：记录验证失败的尝试
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json(
        { error: '请填写完整信息' },
        { status: 400 }
      );
    }

    // 2. 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      // BUG修复：记录验证失败的尝试
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json(
        { error: '手机号格式不正确' },
        { status: 400 }
      );
    }

    // 3. 验证密码强度
    if (password.length < 6) {
      // BUG修复：记录验证失败的尝试
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json(
        { error: '密码至少需要 6 位' },
        { status: 400 }
      );
    }

    // 4. 验证 Turnstile Token（开发环境降级处理）
    if (process.env.NODE_ENV === 'production') {
      const turnstileResponse = await fetch(
        'https://challenges.cloudflare.com/turnstile/v0/siteverify',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            secret: process.env.TURNSTILE_SECRET_KEY,
            response: turnstileToken,
          }),
        }
      );

      const turnstileData = await turnstileResponse.json();

      if (!turnstileData.success) {
        // BUG修复：记录验证失败的尝试
        await recordIPAttempt(clientIP, false, userAgent);
        return NextResponse.json(
          { error: '人机验证失败，请重试' },
          { status: 400 }
        );
      }
    } else {
      // 开发环境：如果没有 token 也允许通过（降级处理）
      console.log('开发环境：跳过 Turnstile 验证');
    }

    // 5. 创建 Supabase 用户（使用 Admin API 绕过邮箱验证）
    const supabaseUrl = env.SUPABASE_URL();
    const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY();

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      await recordIPAttempt(clientIP, false, userAgent);
      return NextResponse.json(
        { error: '服务配置错误，请联系管理员' },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(
      supabaseUrl,
      supabaseServiceRoleKey,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // 使用手机号作为邮箱格式
    const email = `${phone}@slogan.app`;

    const { data: authData, error: signUpError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // 自动确认邮箱，跳过验证
      user_metadata: {
        phone,
        phone_verified: false,
      },
    });

    if (signUpError) {
      // 记录失败的注册尝试
      await recordIPAttempt(clientIP, false, userAgent);

      // 处理常见错误并翻译为中文
      let errorMessage = '注册失败，请重试';

      if (signUpError.message.includes('already registered') || signUpError.message.includes('User already registered')) {
        errorMessage = '该手机号已注册，请直接登录';
      } else if (signUpError.message.includes('Password should be at least')) {
        errorMessage = '密码至少需要 6 位';
      } else if (signUpError.message.includes('Invalid email')) {
        errorMessage = '手机号格式不正确';
      } else if (signUpError.message.includes('Unable to validate email')) {
        errorMessage = '无法验证手机号，请重试';
      } else if (signUpError.message.includes('Database error')) {
        errorMessage = '数据库错误，请稍后重试';
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    // 记录成功的注册尝试
    await recordIPAttempt(clientIP, true, userAgent);

    return NextResponse.json({
      success: true,
      message: '注册成功',
      user: {
        id: authData.user?.id,
        phone,
      },
    });
  } catch (error) {
    console.error('注册错误:', error);

    // 记录异常情况下的尝试
    try {
      const clientIP = getClientIP(request);
      const userAgent = request.headers.get('user-agent') || undefined;
      await recordIPAttempt(clientIP, false, userAgent);
    } catch (recordError) {
      console.error('记录IP尝试失败:', recordError);
    }

    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
