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

  // Android WebView优化：大幅减少首屏预取，加快加载速度
  try {
    const prefetchCount = 1; // 优化：从6张减少到1张
    const randomSeed = Math.random();

    // 设置5秒超时，避免在Android WebView中长时间阻塞（优化：从2秒增加到5秒）
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Prefetch timeout')), 5000)
    );

    const [posesResult, tagsResult] = await Promise.race([
      Promise.all([
        supabase
          .from('poses')
          .select('id, image_url, tags, storage_path, view_count, rand_key')
          .gte('rand_key', randomSeed)
          .order('rand_key')
          .limit(prefetchCount),
        supabase.from('pose_tags').select('id, name, usage_count').order('usage_count', { ascending: false }).limit(15) // 优化：从20减少到15
      ]),
      timeoutPromise
    ]) as any;

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

    const normalizedPoses = posesData.map((pose: Pose) => ({
      ...pose,
      tags: Array.isArray(pose.tags) ? pose.tags : [],
    }));

    let initialPose: Pose | null = null;
    if (normalizedPoses.length > 0) {
      const selectedPose = normalizedPoses[0];
      initialPose = selectedPose;

      // 异步更新浏览次数，不阻塞渲染（优化：移除await，完全非阻塞）
      void supabase.rpc('increment_pose_view', {
        p_pose_id: selectedPose.id
      });
    }

    return <PoseViewer initialTags={tagsResult.data || []} initialPose={initialPose} initialPoses={normalizedPoses} />;
  } catch (error) {
    // 超时或查询失败时的降级处理
    if (error instanceof Error && error.message === 'Prefetch timeout') {
      console.warn('[服务端] 数据预取超时，使用客户端加载');
    } else {
      console.error('[服务端] 首页数据加载失败:', error);
    }
    // 降级处理：返回空数据，让客户端自行加载
    return <PoseViewer initialTags={[]} initialPose={null} initialPoses={[]} />;
  }
}
