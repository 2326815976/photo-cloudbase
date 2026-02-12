import { NextResponse } from 'next/server';
import { createClient } from '@/lib/cloudbase/server';
import { deleteCloudBaseObjects } from '@/lib/cloudbase/storage';

export const dynamic = 'force-dynamic';

function collectAlbumAssetTargets(album: any, photos: any[]): string[] {
  const targets = new Set<string>();

  const albumAssets = [
    String(album?.cover_url ?? '').trim(),
    String(album?.donation_qr_code_url ?? '').trim(),
  ].filter(Boolean);

  albumAssets.forEach((item) => targets.add(item));

  photos.forEach((photo) => {
    [
      String(photo?.thumbnail_url ?? '').trim(),
      String(photo?.preview_url ?? '').trim(),
      String(photo?.original_url ?? '').trim(),
      String(photo?.url ?? '').trim(),
    ]
      .filter(Boolean)
      .forEach((item) => targets.add(item));
  });

  return Array.from(targets);
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const albumId = String(id ?? '').trim();
    if (!albumId) {
      return NextResponse.json({ error: '相册 ID 非法' }, { status: 400 });
    }

    const dbClient = await createClient();

    const { data: authUser } = await dbClient.auth.getUser();
    if (!authUser?.user) {
      return NextResponse.json({ error: '未授权' }, { status: 401 });
    }

    const { data: profile } = await dbClient
      .from('profiles')
      .select('role')
      .eq('id', authUser.user.id)
      .single();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: '需要管理员权限' }, { status: 403 });
    }

    const { data: album, error: albumError } = await dbClient
      .from('albums')
      .select('id, cover_url, donation_qr_code_url')
      .eq('id', albumId)
      .single();

    if (albumError || !album) {
      return NextResponse.json({ error: '相册不存在' }, { status: 404 });
    }

    const { data: photos, error: photosError } = await dbClient
      .from('album_photos')
      .select('thumbnail_url, preview_url, original_url, url')
      .eq('album_id', albumId);

    if (photosError) {
      return NextResponse.json({ error: `读取相册资源失败：${photosError.message}` }, { status: 500 });
    }

    const deleteTargets = collectAlbumAssetTargets(album, photos || []);
    if (deleteTargets.length > 0) {
      try {
        await deleteCloudBaseObjects(deleteTargets);
      } catch (error) {
        return NextResponse.json(
          {
            error: `删除云存储文件失败：${error instanceof Error ? error.message : '未知错误'}`,
          },
          { status: 500 }
        );
      }
    }

    const { error: deleteError } = await dbClient
      .from('albums')
      .delete()
      .eq('id', albumId);

    if (deleteError) {
      return NextResponse.json({ error: `删除相册记录失败：${deleteError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      deletedFiles: deleteTargets.length,
    });
  } catch (error) {
    console.error('删除相册失败:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '删除相册失败' },
      { status: 500 }
    );
  }
}

