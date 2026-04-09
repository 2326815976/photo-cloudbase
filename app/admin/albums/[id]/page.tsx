import { redirect } from 'next/navigation';
import AlbumDetailPageContent from './AlbumDetailPageContent';

export const dynamic = 'force-dynamic';

const SYSTEM_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';

export default async function AdminAlbumDetailPage({
  params,
}: {
  params?: Promise<{ id: string }>;
}) {
  const resolvedParams = params ? await params : undefined;
  const albumId = String(resolvedParams?.id || '').trim();

  if (albumId === SYSTEM_WALL_ALBUM_ID) {
    redirect('/admin/gallery');
  }

  return <AlbumDetailPageContent albumIdOverride={albumId} />;
}
