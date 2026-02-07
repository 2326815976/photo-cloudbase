/**
 * 简单的内存缓存机制
 * 用于缓存Supabase请求结果，减少不必要的网络请求
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const requestCache = new Map<string, CacheEntry<any>>();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟

/**
 * 从缓存中获取数据
 */
export function getCachedData<T>(key: string): T | null {
  const cached = requestCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data as T;
  }
  // 缓存过期，删除
  if (cached) {
    requestCache.delete(key);
  }
  return null;
}

/**
 * 将数据存入缓存
 */
export function setCachedData<T>(key: string, data: T): void {
  requestCache.set(key, { data, timestamp: Date.now() });
}

/**
 * 清除指定key的缓存
 */
export function clearCachedData(key: string): void {
  requestCache.delete(key);
}

/**
 * 清除所有缓存
 */
export function clearAllCache(): void {
  requestCache.clear();
}

/**
 * 清除过期缓存
 */
export function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of requestCache.entries()) {
    if (now - entry.timestamp >= CACHE_DURATION) {
      requestCache.delete(key);
    }
  }
}

// 定期清理过期缓存（仅客户端，每分钟）
if (typeof window !== 'undefined') {
  setInterval(cleanExpiredCache, 60 * 1000);
}
