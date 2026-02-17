export const GALLERY_PAGE_CACHE_KEY = 'gallery-page-1-cache-v1';

const GALLERY_CACHE_DIRTY_KEY = 'gallery-cache-dirty-v1';

function canUseLocalStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function clearGalleryPageCacheStorage(): void {
  if (!canUseLocalStorage()) return;
  try {
    window.localStorage.removeItem(GALLERY_PAGE_CACHE_KEY);
  } catch {
    // ignore
  }
}

export function markGalleryCacheDirty(timestamp: number = Date.now()): void {
  if (!canUseLocalStorage()) return;
  clearGalleryPageCacheStorage();

  try {
    window.localStorage.setItem(GALLERY_CACHE_DIRTY_KEY, String(Number(timestamp) || Date.now()));
  } catch {
    // ignore
  }
}

export function consumeGalleryCacheDirtyFlag(): boolean {
  if (!canUseLocalStorage()) return false;
  try {
    const value = window.localStorage.getItem(GALLERY_CACHE_DIRTY_KEY);
    if (!value) return false;
    window.localStorage.removeItem(GALLERY_CACHE_DIRTY_KEY);
    return true;
  } catch {
    return false;
  }
}

