import { createClient } from '@/lib/supabase/server';
import dynamic from 'next/dynamic';
import { Camera } from 'lucide-react';

const GalleryClient = dynamic(() => import('./GalleryClient'), {
  loading: () => (
    <div className="flex flex-col items-center justify-center h-screen bg-[#FFFBF0]">
      <div className="flex flex-col items-center gap-6">
        <div className="relative">
          <div className="w-24 h-24 rounded-full border-4 border-[#FFC857]/30 border-t-[#FFC857] animate-spin" />
          <div className="absolute inset-3 rounded-full border-4 border-[#5D4037]/20 border-b-[#5D4037] animate-spin" style={{ animationDirection: 'reverse' }} />
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="w-8 h-8 text-[#FFC857]" />
          </div>
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-[#5D4037] mb-2" style={{ fontFamily: "'ZQKNNY', cursive" }}>
            加载中...
          </p>
          <p className="text-sm text-[#5D4037]/60">
            正在加载照片墙
          </p>
        </div>
      </div>
    </div>
  )
});

interface Photo {
  id: string;
  thumbnail_url: string;
  preview_url: string;
  storage_path?: string;
  width: number;
  height: number;
  blurhash?: string;
  like_count: number;
  view_count: number;
  is_liked: boolean;
  created_at: string;
}

export default async function GalleryPage() {
  const supabase = await createClient();

  // 在服务端预加载第一页数据
  const { data, error } = await supabase.rpc('get_public_gallery', {
    page_no: 1,
    page_size: 20
  });

  const initialPhotos: Photo[] = (!error && data) ? (data.photos || []) : [];
  const initialTotal: number = (!error && data) ? (data.total || 0) : 0;

  return <GalleryClient initialPhotos={initialPhotos} initialTotal={initialTotal} initialPage={1} />;
}
