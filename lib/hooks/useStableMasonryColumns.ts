import { useMemo, useRef } from 'react';

interface UseStableMasonryColumnsOptions<T> {
  items: T[];
  getItemId: (item: T) => string;
  estimateItemHeight: (item: T) => number;
  columnCount?: number;
  resetKey?: string;
}

interface StableMasonryColumnsResult<T> {
  columns: T[][];
  heights: number[];
}

export function useStableMasonryColumns<T>({
  items,
  getItemId,
  estimateItemHeight,
  columnCount = 2,
  resetKey = 'default',
}: UseStableMasonryColumnsOptions<T>): StableMasonryColumnsResult<T> {
  const normalizedColumnCount = Math.max(1, Math.floor(Number(columnCount) || 1));
  const assignmentRef = useRef<Map<string, number>>(new Map());
  const lastResetKeyRef = useRef(resetKey);

  return useMemo(() => {
    if (lastResetKeyRef.current !== resetKey) {
      assignmentRef.current = new Map();
      lastResetKeyRef.current = resetKey;
    }

    const activeIds = new Set(items.map((item) => String(getItemId(item))));
    assignmentRef.current.forEach((_, itemId) => {
      if (!activeIds.has(itemId)) {
        assignmentRef.current.delete(itemId);
      }
    });

    const columns = Array.from({ length: normalizedColumnCount }, () => [] as T[]);
    const heights = Array.from({ length: normalizedColumnCount }, () => 0);

    for (const item of items) {
      const itemId = String(getItemId(item));
      const estimatedHeight = Math.max(1, Number(estimateItemHeight(item)) || 1);

      let columnIndex = assignmentRef.current.get(itemId);
      if (columnIndex == null || columnIndex < 0 || columnIndex >= normalizedColumnCount) {
        let shortestColumnIndex = 0;
        for (let index = 1; index < heights.length; index += 1) {
          if (heights[index] < heights[shortestColumnIndex]) {
            shortestColumnIndex = index;
          }
        }
        columnIndex = shortestColumnIndex;
        assignmentRef.current.set(itemId, columnIndex);
      }

      columns[columnIndex].push(item);
      heights[columnIndex] += estimatedHeight;
    }

    return { columns, heights };
  }, [columnCount, estimateItemHeight, getItemId, items, normalizedColumnCount, resetKey]);
}
