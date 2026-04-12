import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/context';
import { updateUserPassword, updateUserProfile, verifyUserPassword } from '@/lib/auth/service';
import { SESSION_COOKIE_NAME, getSessionCookieOptions } from '@/lib/auth/cookie';
import { clearSessionCacheByUserId } from '@/lib/auth/session-store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'Not authenticated' },
        },
        { status: 401 }
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const hasPassword = Object.prototype.hasOwnProperty.call(body, 'password');
    const hasProfilePatch = ['name', 'phone', 'wechat'].some((key) =>
      Object.prototype.hasOwnProperty.call(body, key)
    );

    if (!hasPassword && !hasProfilePatch) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'No supported fields to update' },
        },
        { status: 400 }
      );
    }

    const password = String(body?.password ?? '');
    const currentPassword = String(body?.currentPassword ?? '');

    if (hasPassword && (!password || password.length < 6)) {
      return NextResponse.json(
        {
          data: { user: null },
          error: { message: 'Password should be at least 6 characters' },
        },
        { status: 400 }
      );
    }

    let nextUser = user;

    if (hasProfilePatch) {
      const profileResult = await updateUserProfile(user.id, {
        name: typeof body.name === 'string' ? body.name : String(body.name ?? ''),
        phone: body.phone === null ? null : typeof body.phone === 'string' ? body.phone : String(body.phone ?? ''),
        wechat:
          body.wechat === null ? null : typeof body.wechat === 'string' ? body.wechat : String(body.wechat ?? ''),
      });

      if (profileResult.error) {
        const messageMap: Record<string, string> = {
          name_required: '姓名不能为空',
          user_not_found: '用户不存在',
          phone_already_in_use: '手机号已被其他账号使用',
        };

        return NextResponse.json(
          {
            data: { user: null },
            error: { message: messageMap[profileResult.error] || profileResult.error },
          },
          { status: profileResult.error === 'phone_already_in_use' ? 409 : 400 }
        );
      }

      clearSessionCacheByUserId(user.id);
      nextUser = profileResult.user || nextUser;
    }

    if (hasPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          {
            data: { user: null },
            error: { message: 'Current password is required' },
          },
          { status: 400 }
        );
      }

      const verification = await verifyUserPassword(user.id, currentPassword);
      if (!verification.valid) {
        const message =
          verification.error === 'invalid_current_password' ? 'Current password is incorrect' : verification.error;
        return NextResponse.json(
          {
            data: { user: null },
            error: { message },
          },
          { status: verification.error === 'user_not_found' ? 404 : 400 }
        );
      }

      const result = await updateUserPassword(user.id, password);
      if (result.error) {
        return NextResponse.json(
          {
            data: { user: null },
            error: { message: result.error },
          },
          { status: 400 }
        );
      }
    }

    const response = NextResponse.json({
      data: { user: nextUser },
      error: null,
    });
    if (hasPassword) {
      response.cookies.set(SESSION_COOKIE_NAME, '', {
        ...getSessionCookieOptions(),
        maxAge: 0,
      });
    }
    return response;
  } catch (error) {
    return NextResponse.json(
      {
        data: { user: null },
        error: {
          message: error instanceof Error ? error.message : 'Update user failed',
        },
      },
      { status: 500 }
    );
  }
}
