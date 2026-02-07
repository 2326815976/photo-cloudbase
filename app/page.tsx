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
    console.log('[服务端] 开始查询数据...');
    const startTime = Date.now();

    const randomSeed = Math.random();
    const [posesResult, tagsResult] = await Promise.all([
      supabase
        .from('poses')
        .select('id, image_url, tags, storage_path, view_count, rand_key')
        .gte('rand_key', randomSeed)
        .order('rand_key')
        .limit(1),
      supabase.from('pose_tags').select('id, name, usage_count').order('usage_count', { ascending: false }).limit(20)
    ]);

    const queryTime = Date.now() - startTime;
    console.log(`[服务端] 查询完成，耗时: ${queryTime}ms`);
    console.log(`[服务端] Poses 数量: ${posesResult.data?.length || 0}`);
    console.log(`[服务端] Tags 数量: ${tagsResult.data?.length || 0}`);

    if (posesResult.error) {
      console.error('[服务端] Poses 查询错误:', posesResult.error);
    }
    if (tagsResult.error) {
      console.error('[服务端] Tags 查询错误:', tagsResult.error);
    }

    let posesData = posesResult.data || [];
    if (posesData.length === 0) {
      const { data: fallbackData } = await supabase
        .from('poses')
        .select('id, image_url, tags, storage_path, view_count, rand_key')
        .order('rand_key')
        .limit(1);
      posesData = fallbackData || [];
    }

    const normalizedPoses = posesData.map((pose) => ({
      ...pose,
      tags: Array.isArray(pose.tags) ? pose.tags : [],
    }));

    let initialPose: Pose | null = null;
    if (normalizedPoses.length > 0) {
      const selectedPose = normalizedPoses[0];
      initialPose = selectedPose;
      console.log(`[服务端] 选中 Pose ID: ${selectedPose.id}`);

      // 异步更新浏览次数，不阻塞渲染
      void supabase.rpc('increment_pose_view', {
        p_pose_id: selectedPose.id
      });
    } else {
      console.warn('[服务端] 没有找到任何 Poses 数据');
    }

    return <PoseViewer initialTags={tagsResult.data || []} initialPose={initialPose} initialPoses={normalizedPoses} />;
  } catch (error) {
    console.error('[服务端] 首页数据加载失败:', error);
    // 降级处理：返回空数据，让客户端自行加载
    return <PoseViewer initialTags={[]} initialPose={null} initialPoses={[]} />;
  }
}
