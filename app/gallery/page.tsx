import { createClient } from '@/lib/supabase/server';
import GalleryClient from './GalleryClient';

interface Photo {
  id: string;
  storage_path: string;
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
