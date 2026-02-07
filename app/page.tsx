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
  created_at?: string;
  rand_key?: number;
}

export default async function HomePage() {
  const supabase = await createClient();

  // 服务端预取数据，减少客户端请求（添加超时保护）
  try {
    const prefetchCount = 6;
    const randomSeed = Math.random();
    const [posesResult, tagsResult] = await Promise.all([
      supabase
        .from('poses')
        .select('id, image_url, tags, storage_path, view_count, rand_key')
        .gte('rand_key', randomSeed)
        .order('rand_key')
        .limit(prefetchCount),
      supabase.from('pose_tags').select('id, name, usage_count').order('usage_count', { ascending: false }).limit(20)
    ]);

    if (posesResult.error) {
      console.error('[服务端] Poses 查询错误:', posesResult.error);
    }
    if (tagsResult.error) {
      console.error('[服务端] Tags 查询错误:', tagsResult.error);
    }

    let posesData = posesResult.data || [];
    if (posesData.length < prefetchCount) {
      const { data: fallbackData } = await supabase
        .from('poses')
        .select('id, image_url, tags, storage_path, view_count, rand_key')
        .order('rand_key')
        .limit(prefetchCount);

      const combined = [...posesData, ...(fallbackData || [])];
      const uniqueMap = new Map(combined.map((pose) => [pose.id, pose]));
      posesData = Array.from(uniqueMap.values());
    }

    const normalizedPoses = posesData.map((pose) => ({
      ...pose,
      tags: Array.isArray(pose.tags) ? pose.tags : [],
    }));

    let initialPose: Pose | null = null;
    if (normalizedPoses.length > 0) {
      const selectedPose = normalizedPoses[0];
      initialPose = selectedPose;

      // 异步更新浏览次数，不阻塞渲染
      void supabase.rpc('increment_pose_view', {
        p_pose_id: selectedPose.id
      });
    }

    return <PoseViewer initialTags={tagsResult.data || []} initialPose={initialPose} initialPoses={normalizedPoses} />;
  } catch (error) {
    console.error('[服务端] 首页数据加载失败:', error);
    // 降级处理：返回空数据，让客户端自行加载
    return <PoseViewer initialTags={[]} initialPose={null} initialPoses={[]} />;
  }
}
