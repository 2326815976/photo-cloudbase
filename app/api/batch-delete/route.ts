import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/cloudbase/server';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';

const MAX_DELETE_TARGETS = 1000; // 单次请求最多删除 1000 个对象
const MAX_PHOTO_IDS = 250; // 非管理员相册路径最多处理 250 张照片（最多约 1000 个版本文件）
const DELETE_CHUNK_SIZE = 100; // 按 100 分批删除，避免单次请求过大

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
    )
  );
}

async function deleteTargetsInChunks(targets: string[]): Promise<void> {
  for (let i = 0; i < targets.length; i += DELETE_CHUNK_SIZE) {
    const chunk = targets.slice(i, i + DELETE_CHUNK_SIZE);
    await deleteCloudBaseObjects(chunk);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys, urls, fileIds, accessKey, photoIds } = body || {};
    const deleteTargets = normalizeStringArray([
      ...normalizeStringArray(keys),
      ...normalizeStringArray(urls),
      ...normalizeStringArray(fileIds),
    ]);

    const dbClient = await createClient();
    const { data: { user } } = await dbClient.auth.getUser();

    let isAdmin = false;
    if (user) {
      const { data: profile } = await dbClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      isAdmin = profile?.role === 'admin';
    }

    // 管理员路径：直接按 keys 删除
    if (isAdmin) {
      if (deleteTargets.length === 0) {
        return NextResponse.json(
          { error: '缺少文件标识数组参数' },
          { status: 400 }
        );
      }

      if (deleteTargets.length > MAX_DELETE_TARGETS) {
        return NextResponse.json(
          { error: `批量删除数量超过限制（最多${MAX_DELETE_TARGETS}个）` },
          { status: 400 }
        );
      }

      await deleteTargetsInChunks(deleteTargets);
      return NextResponse.json({ success: true, deleted: deleteTargets.length });
    }

    // 非管理员：必须提供 accessKey + photoIds，按相册密钥校验后删除
    const normalizedAccessKey = String(accessKey ?? '').trim().toUpperCase();
    const normalizedPhotoIds = normalizeStringArray(photoIds);

    if (!normalizedAccessKey || normalizedPhotoIds.length === 0) {
      return NextResponse.json(
        { error: '未授权：需要管理员权限或有效的相册密钥' },
        { status: 403 }
      );
    }

    if (normalizedPhotoIds.length > MAX_PHOTO_IDS) {
      return NextResponse.json(
        { error: `单次删除照片数量超过限制（最多${MAX_PHOTO_IDS}张）` },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data: album, error: albumError } = await adminClient
      .from('albums')
      .select('id')
      .eq('access_key', normalizedAccessKey)
      .single();

    if (albumError || !album) {
      return NextResponse.json(
        { error: '密钥无效或相册不存在' },
        { status: 404 }
      );
    }

    const { data: photos, error: photosError } = await adminClient
      .from('album_photos')
      .select('id, thumbnail_url, preview_url, original_url, url')
      .eq('album_id', album.id)
      .in('id', normalizedPhotoIds);

    if (photosError) {
      return NextResponse.json(
        { error: '读取相册照片失败' },
        { status: 500 }
      );
    }

    const targetsToDelete = new Set<string>();
    (photos || []).forEach((photo: any) => {
      const urls = [
        photo.thumbnail_url,
        photo.preview_url,
        photo.original_url,
        photo.url
      ].filter(Boolean) as string[];

      urls.forEach((url) => {
        targetsToDelete.add(url);
      });
    });

    const finalTargets = Array.from(targetsToDelete);
    if (finalTargets.length === 0) {
      return NextResponse.json({ success: true, message: '无需删除文件' });
    }

    if (finalTargets.length > MAX_DELETE_TARGETS) {
      return NextResponse.json(
        { error: `批量删除文件数量超过限制（最多${MAX_DELETE_TARGETS}个）` },
        { status: 400 }
      );
    }

    await deleteTargetsInChunks(finalTargets);
    return NextResponse.json({
      success: true,
      deleted: finalTargets.length,
      photos: normalizedPhotoIds.length,
    });
  } catch (error) {
    console.error('批量删除失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量删除失败' },
      { status: 500 }
    );
  }
}


