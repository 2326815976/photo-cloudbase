import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

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

    // 4. 验证 Turnstile Token
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

    // 5. 创建 Supabase 用户
    const supabase = await createClient();

    // 使用手机号作为邮箱格式（临时方案）
    const email = `${phone}@temp.local`;

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          phone, // 存储真实手机号
          phone_verified: false, // 标记为未验证
        },
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

    // 6. 创建用户扩展信息表
    if (authData.user) {
      const { error: profileError } = await supabase
        .from('user_profiles')
        .insert({
          id: authData.user.id,
          phone,
          phone_verified: false,
          upload_count: 0,
          upload_limit: 20, // 新用户限制
        });

      if (profileError) {
        console.error('创建用户资料失败:', profileError);
        // 不阻断注册流程，仅记录错误
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
