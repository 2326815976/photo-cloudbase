'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

const PHOTO_WALL_ALBUM_ID = '00000000-0000-0000-0000-000000000000';

export default function AdminGalleryPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(`/admin/albums/${PHOTO_WALL_ALBUM_ID}`);
  }, [router]);

  return (
    <div className="flex items-center justify-center py-16 text-[#5D4037]/70">
      正在进入照片墙空间管理...
    </div>
  );
}
