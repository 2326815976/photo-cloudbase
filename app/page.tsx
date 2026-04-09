import { redirect } from 'next/navigation';
import PoseViewer from './PoseViewer';
import { buildWebShellRuntime } from '@/lib/page-center/runtime';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function readSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? String(value[0] || '').trim() : String(value || '').trim();
}

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<SearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const presentation = readSearchParam(resolvedSearchParams.presentation);
  const pageKey = readSearchParam(resolvedSearchParams.page_key);
  const isPreviewMode = presentation === 'preview' && Boolean(pageKey);

  if (!isPreviewMode) {
    try {
      const runtime = await buildWebShellRuntime();
      const homePath = String(runtime.homePath || '/').trim();
      if (homePath && homePath !== '/') {
        redirect(homePath);
      }
    } catch {
      // 运行时读取失败时，回退为默认首页内容
    }
  }

  return <PoseViewer initialTags={[]} initialPose={null} initialPoses={[]} />;
}