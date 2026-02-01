/**
 * SWR 全局配置
 * 提供统一的缓存策略和错误处理
 */

import { SWRConfiguration } from 'swr';

export const swrConfig: SWRConfiguration = {
  // 重新验证配置
  revalidateOnFocus: true,           // 窗口聚焦时重新验证
  revalidateOnReconnect: true,       // 网络重连时重新验证
  revalidateIfStale: true,           // 数据过期时重新验证

  // 缓存时间配置
  dedupingInterval: 2000,            // 2秒内的重复请求会被去重
  focusThrottleInterval: 5000,       // 5秒内只触发一次焦点重新验证

  // 错误重试配置
  errorRetryCount: 3,                // 最多重试3次
  errorRetryInterval: 5000,          // 重试间隔5秒

  // 性能优化
  keepPreviousData: true,            // 更新时保留旧数据，避免闪烁
};

/**
 * 不同数据类型的缓存时间配置（毫秒）
 */
export const CACHE_TIME = {
  GALLERY: 5 * 60 * 1000,      // 照片墙：5分钟
  ALBUMS: 10 * 60 * 1000,      // 相册列表：10分钟
  ALBUM_CONTENT: 5 * 60 * 1000, // 相册内容：5分钟
  POSES: 10 * 60 * 1000,       // 摆姿：10分钟
  TAGS: 30 * 60 * 1000,        // 标签：30分钟
} as const;
