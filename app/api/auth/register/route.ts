import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { phone, password, turnstileToken } = await request.json();

    // 1. 验证必填字段
    if (!phone || !password || !turnstileToken) {
      return NextResponse.json(
        { error: '请填写完整信息' },
        { status: 400 }
      );
    }

    // 2. 验证手机号格式
    if (!/^1[3-9]\d{9}$/.test(phone)) {
      return NextResponse.json(
        { error: '手机号格式不正确' },
        { status: 400 }
      );
    }

    // 3. 验证密码强度
    if (password.length < 6) {
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
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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
      // 处理常见错误
      if (signUpError.message.includes('already registered')) {
        return NextResponse.json(
          { error: '该手机号已注册，请直接登录' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: signUpError.message || '注册失败，请重试' },
        { status: 400 }
      );
    }

    // 6. 创建用户扩展信息表（同时写入 profiles 和 user_profiles 表）
    if (authData.user) {
      // 写入 user_profiles 表（手机号注册系统）
      const { error: userProfileError } = await supabaseAdmin
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          phone,
          phone_verified: false,
          upload_count: 0,
          upload_limit: 20,
        });

      if (userProfileError) {
        console.error('创建 user_profiles 失败:', userProfileError);
      }

      // 写入 profiles 表（用户资料系统）
      const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .insert({
          id: authData.user.id,
          email,
          name: '拾光者', // 默认用户名
          phone,
          role: 'user',
        });

      if (profileError) {
        console.error('创建 profiles 失败:', profileError);
      }
    }

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
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
