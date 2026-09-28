'use client';

import { AlbumDetailPageContent } from '../albums/[id]/AlbumDetailPageContent';

const PHOTO_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';

export default function AdminGalleryPage() {
  return <AlbumDetailPageContent albumIdOverride={PHOTO_WALL_ALBUM_ID} forceSystemWall />;
}
