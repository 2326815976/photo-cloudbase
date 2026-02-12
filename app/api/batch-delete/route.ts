import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/cloudbase/server';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';

const MAX_BATCH_DELETE = 100; // 最多一次删除100个文件

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys, urls, fileIds, accessKey, photoIds } = body || {};
    const deleteTargets = [
      ...(Array.isArray(keys) ? keys : []),
      ...(Array.isArray(urls) ? urls : []),
      ...(Array.isArray(fileIds) ? fileIds : []),
    ]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean);

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

      if (deleteTargets.length > MAX_BATCH_DELETE) {
        return NextResponse.json(
          { error: `批量删除数量超过限制（最多${MAX_BATCH_DELETE}个）` },
          { status: 400 }
        );
      }

      await deleteCloudBaseObjects(deleteTargets);
      return NextResponse.json({ success: true });
    }

    // 非管理员：必须提供 accessKey + photoIds，按相册密钥校验后删除
    if (!accessKey || !Array.isArray(photoIds) || photoIds.length === 0) {
      return NextResponse.json(
        { error: '未授权：需要管理员权限或有效的相册密钥' },
        { status: 403 }
      );
    }

    const adminClient = createAdminClient();
    const { data: album, error: albumError } = await adminClient
      .from('albums')
      .select('id')
      .eq('access_key', accessKey)
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
      .in('id', photoIds);

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

    if (finalTargets.length > MAX_BATCH_DELETE) {
      return NextResponse.json(
        { error: `批量删除数量超过限制（最多${MAX_BATCH_DELETE}个）` },
        { status: 400 }
      );
    }

    await deleteCloudBaseObjects(finalTargets);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('批量删除失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量删除失败' },
      { status: 500 }
    );
  }
}


