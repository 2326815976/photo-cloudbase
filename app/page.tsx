import { createClient } from '@/lib/supabase/server';
import PoseViewer from './PoseViewer';

interface PoseTag {
  id: number;
  name: string;
  usage_count: number;
}

interface Pose {
  id: number;
  image_url: string;
  tags: string[];
  storage_path: string;
  view_count: number;
  created_at: string;
}

export default async function HomePage() {
  const supabase = await createClient();

  // 服务端预取数据，减少客户端请求
  const [posesResult, tagsResult] = await Promise.all([
    supabase.from('poses').select('*').limit(5),
    supabase.from('pose_tags').select('*').order('usage_count', { ascending: false })
  ]);

  let initialPose: Pose | null = null;
  if (posesResult.data && posesResult.data.length > 0) {
    const randomIndex = Math.floor(Math.random() * posesResult.data.length);
    const selectedPose = posesResult.data[randomIndex];
    initialPose = selectedPose;

    // 异步更新浏览次数，不阻塞渲染
    void supabase
      .from('poses')
      .update({ view_count: selectedPose.view_count + 1 })
      .eq('id', selectedPose.id);
  }

  return <PoseViewer initialTags={tagsResult.data || []} initialPose={initialPose} initialPoses={posesResult.data || []} />;
}
