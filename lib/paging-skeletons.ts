export interface PagingSkeletonItem {
  id: string;
  aspectRatio: number;
  paddingTop: string;
}

const DEFAULT_PAGING_SKELETON_RATIOS = [0.92, 1.18, 0.84, 1.32, 1.04, 1.26, 0.98, 1.4];

export function createPagingSkeletonItems(
  count: number,
  options?: { prefix?: string; seed?: number }
): PagingSkeletonItem[] {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const prefix = String(options?.prefix || 'paging').trim() || 'paging';
  const seed = Math.max(0, Math.floor(Number(options?.seed) || Date.now()));

  return Array.from({ length: safeCount }, (_, index) => {
    const aspectRatio = DEFAULT_PAGING_SKELETON_RATIOS[(seed + index) % DEFAULT_PAGING_SKELETON_RATIOS.length];
    return {
      id: `__${prefix}_skeleton_${seed}_${index}`,
      aspectRatio,
      paddingTop: `${aspectRatio * 100}%`,
    };
  });
}
