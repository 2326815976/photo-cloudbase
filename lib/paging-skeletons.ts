export interface PagingSkeletonItem {
  id: string;
  aspectRatio: number;
  paddingTop: string;
}

const DEFAULT_PAGING_SKELETON_RATIOS = [0.92, 1.18, 0.84, 1.32, 1.04, 1.26, 0.98, 1.4];

function resolveSkeletonAspectRatio(source: unknown): number {
  const ratio = Number((source as { __ratio?: number } | null | undefined)?.__ratio || 0);
  if (ratio > 0) {
    return ratio;
  }

  const width = Number((source as { width?: number } | null | undefined)?.width || 0);
  const height = Number((source as { height?: number } | null | undefined)?.height || 0);
  if (width > 0 && height > 0) {
    return height / width;
  }

  return 1;
}

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

export function createPagingSkeletonItemsFromPhotos(
  photos: unknown[],
  options?: { prefix?: string; seed?: number }
): PagingSkeletonItem[] {
  const source = Array.isArray(photos) ? photos : [];
  const prefix = String(options?.prefix || 'paging').trim() || 'paging';
  const seed = Math.max(0, Math.floor(Number(options?.seed) || Date.now()));

  return source.map((photo, index) => {
    const aspectRatio = Math.max(0.4, resolveSkeletonAspectRatio(photo));
    return {
      id: `__${prefix}_photo_skeleton_${seed}_${String((photo as { id?: string | number } | null | undefined)?.id ?? index)}`,
      aspectRatio,
      paddingTop: `${aspectRatio * 100}%`,
    };
  });
}
