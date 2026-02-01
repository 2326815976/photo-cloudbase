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

  // 在服务端获取标签列表
  const { data: tags } = await supabase
    .from('pose_tags')
    .select('*')
    .order('usage_count', { ascending: false });

  // 在服务端预加载适量摆姿数据（50张）用于快速切换
  const { data: initialPoses } = await supabase
    .from('poses')
    .select('*')
    .limit(50);

  let initialPose: Pose | null = null;
  if (initialPoses && initialPoses.length > 0) {
    const randomIndex = Math.floor(Math.random() * initialPoses.length);
    const selectedPose = initialPoses[randomIndex];

    // 更新浏览次数
    await supabase
      .from('poses')
      .update({ view_count: selectedPose.view_count + 1 })
      .eq('id', selectedPose.id);

    initialPose = { ...selectedPose, view_count: selectedPose.view_count + 1 };
  }

  return <PoseViewer initialTags={tags || []} initialPose={initialPose} initialPoses={initialPoses || []} />;
}
