export interface PhotoDimensionLike {
  id?: string | number | null;
  width?: number | null;
  height?: number | null;
  thumbnail_url?: string | null;
  preview_url?: string | null;
  original_url?: string | null;
  thumbnail_url_resolved?: string | null;
  preview_url_resolved?: string | null;
  original_url_resolved?: string | null;
}

interface ImageDimensions {
  width: number;
  height: number;
}

const dimensionPromiseCache = new Map<string, Promise<ImageDimensions | null>>();
const DEFAULT_DIMENSION_PROBE_CONCURRENCY = 6;

function normalizePhotoUrl(value: unknown): string {
  const text = String(value ?? '').trim();
  return text;
}

function resolvePhotoDimensionProbeUrl(photo: PhotoDimensionLike | null | undefined): string {
  if (!photo || typeof photo !== 'object') {
    return '';
  }

  const candidates = [
    photo.thumbnail_url_resolved,
    photo.thumbnail_url,
    photo.preview_url_resolved,
    photo.preview_url,
    photo.original_url_resolved,
    photo.original_url,
  ];

  for (const candidate of candidates) {
    const normalized = normalizePhotoUrl(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

export function hasStablePhotoDimensions(photo: PhotoDimensionLike | null | undefined): boolean {
  const width = Number(photo?.width || 0);
  const height = Number(photo?.height || 0);
  return width > 0 && height > 0;
}

export function photoListHasMissingDimensions<T extends PhotoDimensionLike>(photos: T[]): boolean {
  return Array.isArray(photos) && photos.some((photo) => !hasStablePhotoDimensions(photo));
}

async function loadImageDimensions(src: string): Promise<ImageDimensions | null> {
  const normalizedSrc = normalizePhotoUrl(src);
  if (!normalizedSrc || typeof window === 'undefined') {
    return null;
  }

  const cachedPromise = dimensionPromiseCache.get(normalizedSrc);
  if (cachedPromise) {
    return cachedPromise;
  }

  const task = new Promise<ImageDimensions | null>((resolve) => {
    const image = new Image();
    let settled = false;

    const finalize = (value: ImageDimensions | null) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    image.onload = () => {
      const width = Number(image.naturalWidth || 0);
      const height = Number(image.naturalHeight || 0);
      if (width > 0 && height > 0) {
        finalize({ width, height });
        return;
      }
      finalize(null);
    };

    image.onerror = () => finalize(null);
    image.decoding = 'async';
    image.src = normalizedSrc;

    if (image.complete) {
      const width = Number(image.naturalWidth || 0);
      const height = Number(image.naturalHeight || 0);
      if (width > 0 && height > 0) {
        finalize({ width, height });
      }
    }
  });

  dimensionPromiseCache.set(normalizedSrc, task);
  const result = await task;
  if (!result) {
    dimensionPromiseCache.delete(normalizedSrc);
  }
  return result;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const normalizedConcurrency = Math.max(1, Math.min(items.length, Math.floor(Number(concurrency) || 1)));
  const results: R[] = new Array(items.length);
  let cursor = 0;

  const worker = async () => {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: normalizedConcurrency }, () => worker()));
  return results;
}

export async function hydratePhotoDimensions<T extends PhotoDimensionLike>(
  photos: T[],
  concurrency: number = DEFAULT_DIMENSION_PROBE_CONCURRENCY
): Promise<T[]> {
  const source = Array.isArray(photos) ? photos : [];
  if (source.length === 0) {
    return source;
  }

  let changed = false;
  const nextPhotos = await mapWithConcurrency(source, concurrency, async (photo) => {
    if (hasStablePhotoDimensions(photo)) {
      return photo;
    }

    const probeUrl = resolvePhotoDimensionProbeUrl(photo);
    if (!probeUrl) {
      return photo;
    }

    const dimensions = await loadImageDimensions(probeUrl);
    if (!dimensions) {
      return photo;
    }

    changed = true;
    return {
      ...photo,
      width: dimensions.width,
      height: dimensions.height,
    };
  });

  return changed ? nextPhotos : source;
}
