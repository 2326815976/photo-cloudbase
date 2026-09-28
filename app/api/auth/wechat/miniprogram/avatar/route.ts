import { NextResponse } from 'next/server';
import { getSessionUserFromRequest } from '@/lib/auth/context';
import { executeSQL } from '@/lib/cloudbase/sql-executor';
import { deleteCloudBaseObjects, uploadFileToCloudBase } from '@/lib/cloudbase/storage';

export const dynamic = 'force-dynamic';

const NOW_UTC8_EXPR = 'DATE_ADD(UTC_TIMESTAMP(), INTERVAL 8 HOUR)';
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;
const DEFAULT_PROFILE_NAME = '拾光者';
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function isImageFileAllowed(file: File): boolean {
  const fileName = String(file.name ?? '').toLowerCase().trim();
  const contentType = String(file.type ?? '').toLowerCase().trim();
  if (ALLOWED_IMAGE_TYPES.includes(contentType)) {
    return true;
  }
  return ALLOWED_IMAGE_EXTENSIONS.some((ext) => fileName.endsWith(ext));
}

function normalizeAvatarKey(input: string): string {
  const fileName =
    String(input || '')
      .trim()
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .pop() || '';

  const sanitized = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').replace(/-+/g, '-');
  return sanitized || `wechat-avatar-${Date.now()}.jpg`;
}

export async function POST(request: Request) {
  let uploadedTargets: string[] = [];

  try {
    const user = await getSessionUserFromRequest(request);
    if (!user) {
      return NextResponse.json(
        {
          data: { avatarUrl: '' },
          error: { message: '未授权，请先登录' },
        },
        { status: 401 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const key = String(formData.get('key') ?? '').trim();

    if (!(file instanceof File) || !key) {
      return NextResponse.json(
        {
          data: { avatarUrl: '' },
          error: { message: '缺少必要参数' },
        },
        { status: 400 }
      );
    }

    if (!isImageFileAllowed(file)) {
      return NextResponse.json(
        {
          data: { avatarUrl: '' },
          error: { message: `不支持的头像类型：${file.type || file.name}` },
        },
        { status: 400 }
      );
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return NextResponse.json(
        {
          data: { avatarUrl: '' },
          error: { message: `头像大小超过限制（最多 ${MAX_AVATAR_SIZE / 1024 / 1024}MB）` },
        },
        { status: 400 }
      );
    }

    const profileResult = await executeSQL(
      `
        SELECT
          u.id,
          u.email AS user_email,
          u.role AS user_role,
          p.id AS profile_id,
          p.name AS profile_name,
          p.avatar AS profile_avatar,
          p.email AS profile_email,
          p.role AS profile_role
        FROM users u
        LEFT JOIN profiles p ON p.id = u.id
        WHERE u.id = {{user_id}} AND u.deleted_at <=> NULL
        LIMIT 1
      `,
      { user_id: user.id }
    );

    const profileRow = profileResult.rows[0] ?? null;
    if (!profileRow) {
      return NextResponse.json(
        {
          data: { avatarUrl: '' },
          error: { message: '用户不存在' },
        },
        { status: 404 }
      );
    }

    const currentAvatar = String((profileRow.profile_avatar as unknown) ?? '').trim();
    if (currentAvatar) {
      return NextResponse.json({
        data: {
          avatarUrl: currentAvatar,
          stored: true,
          reused: true,
        },
        error: null,
      });
    }

    const uploadKey = `users/${user.id}/${normalizeAvatarKey(key)}`;
    const uploadResult = await uploadFileToCloudBase(file, uploadKey, 'avatars');
    uploadedTargets = [uploadResult.fileId, uploadResult.cloudPath, uploadResult.downloadUrl];

    const hasProfile = Boolean(String((profileRow.profile_id as unknown) ?? '').trim());

    if (hasProfile) {
      await executeSQL(
        `
          UPDATE profiles
          SET avatar = COALESCE(NULLIF(TRIM(avatar), ''), {{avatar}})
          WHERE id = {{user_id}}
        `,
        {
          avatar: uploadResult.downloadUrl,
          user_id: user.id,
        }
      );
    } else {
      await executeSQL(
        `
          INSERT INTO profiles (
            id, email, name, avatar, role, phone, wechat, created_at
          ) VALUES (
            {{id}}, {{email}}, {{name}}, {{avatar}}, {{role}}, NULL, NULL, ${NOW_UTC8_EXPR}
          )
        `,
        {
          id: user.id,
          email: String((profileRow.profile_email as unknown) ?? (profileRow.user_email as unknown) ?? '').trim() || null,
          name: String((profileRow.profile_name as unknown) ?? '').trim() || DEFAULT_PROFILE_NAME,
          avatar: uploadResult.downloadUrl,
          role: String((profileRow.profile_role as unknown) ?? (profileRow.user_role as unknown) ?? 'user').trim() || 'user',
        }
      );
    }

    const storedAvatarResult = await executeSQL(
      `
        SELECT avatar
        FROM profiles
        WHERE id = {{user_id}}
        LIMIT 1
      `,
      { user_id: user.id }
    );

    const storedAvatar = String((storedAvatarResult.rows[0]?.avatar as unknown) ?? '').trim();
    if (!storedAvatar) {
      throw new Error('头像保存失败，请稍后重试');
    }

    if (storedAvatar !== uploadResult.downloadUrl) {
      await deleteCloudBaseObjects(uploadedTargets).catch(() => undefined);
      uploadedTargets = [];
    }

    return NextResponse.json({
      data: {
        avatarUrl: storedAvatar,
        stored: true,
        reused: storedAvatar !== uploadResult.downloadUrl,
        path: uploadResult.cloudPath,
        fileId: uploadResult.fileId,
      },
      error: null,
    });
  } catch (error) {
    if (uploadedTargets.length > 0) {
      await deleteCloudBaseObjects(uploadedTargets).catch(() => undefined);
    }

    return NextResponse.json(
      {
        data: { avatarUrl: '' },
        error: {
          message: error instanceof Error ? error.message : '头像上传失败',
        },
      },
      { status: 500 }
    );
  }
}
