/**
 * SWR 全局配置
 * 提供统一的缓存策略和错误处理
 */

import { SWRConfiguration } from 'swr';

export const swrConfig: SWRConfiguration = {
  // Android WebView优化：减少不必要的重新验证
  revalidateOnFocus: false,          // 禁用窗口聚焦时重新验证（Android WebView中频繁触发）
  revalidateOnReconnect: true,       // 网络重连时重新验证
  revalidateIfStale: false,          // 禁用数据过期时自动重新验证，使用手动刷新

  // 缓存时间配置
  dedupingInterval: 5000,            // 5秒内的重复请求会被去重（增加去重时间）
  focusThrottleInterval: 10000,      // 10秒内只触发一次焦点重新验证

  // 错误重试配置
  errorRetryCount: 2,                // 最多重试2次（减少重试次数）
  errorRetryInterval: 3000,          // 重试间隔3秒

  // 性能优化
  keepPreviousData: true,            // 更新时保留旧数据，避免闪烁

  // 首屏优先：延迟localStorage持久化，避免阻塞首屏
  provider: () => {
    const map = new Map();

    // 延迟3秒后再从localStorage恢复缓存，确保首屏优先
    if (typeof window !== 'undefined' && window.localStorage) {
      setTimeout(() => {
        try {
          const cached = localStorage.getItem('swr-cache');
          if (cached) {
            const parsed = JSON.parse(cached);
            Object.entries(parsed).forEach(([key, value]) => {
              // 只恢复还未加载的数据
              if (!map.has(key)) {
                map.set(key, value);
              }
            });
          }
        } catch (e) {
          // 忽略解析错误
        }

        // 延迟5秒后开始定期保存缓存（每30秒）
        setTimeout(() => {
          setInterval(() => {
            try {
              const cache: Record<string, any> = {};
              map.forEach((value, key) => {
                cache[key] = value;
              });
              localStorage.setItem('swr-cache', JSON.stringify(cache));
            } catch (e) {
              // 忽略存储错误
            }
          }, 30000);
        }, 5000);
      }, 3000);
    }

    return map;
  },
};

/**
 * 不同数据类型的缓存时间配置（毫秒）
 * Android WebView优化：延长缓存时间，减少网络请求
 */
export const CACHE_TIME = {
  GALLERY: 30 * 60 * 1000,     // 照片墙：30分钟（从5分钟增加）
  ALBUMS: 60 * 60 * 1000,      // 相册列表：60分钟（从10分钟增加）
  ALBUM_CONTENT: 30 * 60 * 1000, // 相册内容：30分钟（从5分钟增加）
  POSES: 60 * 60 * 1000,       // 摆姿：60分钟（从10分钟增加）
  TAGS: 120 * 60 * 1000,       // 标签：120分钟（从30分钟增加）
} as const;
