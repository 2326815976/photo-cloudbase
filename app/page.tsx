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

  // 并行获取标签和摆姿数据，移除阻塞的写操作
  const [tagsResult, posesResult] = await Promise.all([
    supabase.from('pose_tags').select('*').order('usage_count', { ascending: false }),
    supabase.from('poses').select('*').limit(10)
  ]);

  let initialPose: Pose | null = null;
  if (posesResult.data && posesResult.data.length > 0) {
    const randomIndex = Math.floor(Math.random() * posesResult.data.length);
    initialPose = posesResult.data[randomIndex];

    // 异步更新浏览次数，不阻塞渲染
    supabase
      .from('poses')
      .update({ view_count: initialPose.view_count + 1 })
      .eq('id', initialPose.id)
      .then(() => {})
      .catch(() => {});
  }

  return <PoseViewer initialTags={tagsResult.data || []} initialPose={initialPose} initialPoses={posesResult.data || []} />;
}
