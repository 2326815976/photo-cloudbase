import { NextRequest, NextResponse } from 'next/server';
import { batchDeleteFromCOS } from '@/lib/storage/cos-client';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { extractKeyFromURL } from '@/lib/storage/cos-utils';

const MAX_BATCH_DELETE = 100; // 最多一次删除100个文件

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { keys, accessKey, photoIds } = body || {};

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    let isAdmin = false;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      isAdmin = profile?.role === 'admin';
    }

    // 管理员路径：直接按 keys 删除
    if (isAdmin) {
      if (!keys || !Array.isArray(keys) || keys.length === 0) {
        return NextResponse.json(
          { error: '缺少文件路径数组参数' },
          { status: 400 }
        );
      }

      if (keys.length > MAX_BATCH_DELETE) {
        return NextResponse.json(
          { error: `批量删除数量超过限制（最多${MAX_BATCH_DELETE}个）` },
          { status: 400 }
        );
      }

      await batchDeleteFromCOS(keys);
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

    const keysToDelete = new Set<string>();
    (photos || []).forEach((photo: any) => {
      const urls = [
        photo.thumbnail_url,
        photo.preview_url,
        photo.original_url,
        photo.url
      ].filter(Boolean) as string[];

      urls.forEach((url) => {
        const key = extractKeyFromURL(url);
        if (key) {
          keysToDelete.add(key);
        }
      });
    });

    const finalKeys = Array.from(keysToDelete);
    if (finalKeys.length === 0) {
      return NextResponse.json({ success: true, message: '无需删除文件' });
    }

    if (finalKeys.length > MAX_BATCH_DELETE) {
      return NextResponse.json(
        { error: `批量删除数量超过限制（最多${MAX_BATCH_DELETE}个）` },
        { status: 400 }
      );
    }

    await batchDeleteFromCOS(finalKeys);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('批量删除失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '批量删除失败' },
      { status: 500 }
    );
  }
}
