/**
 * 数据库客户端缓存包装器
 * 为常用查询添加缓存层
 * 说明：仅使用 CloudBase SQL 客户端。
 */

import { createClient } from '@/lib/cloudbase/client';
import { getCachedData, setCachedData, clearCachedData } from './requestCache';

/**
 * 获取相册内容（带缓存）
 */
export async function getCachedAlbumContent(accessKey: string) {
  const cacheKey = `album_content_${accessKey}`;

  // 尝试从缓存获取
  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }

  // 缓存未命中，从数据库获取
  const dbClient = createClient();
  if (!dbClient) {
    return { data: null, error: { message: '数据库客户端不可用' } };
  }
  const { data, error } = await dbClient.rpc('get_album_content', {
    input_key: accessKey
  });

  // 如果成功，存入缓存
  if (!error && data) {
    setCachedData(cacheKey, { data, error });
  }

  return { data, error };
}

/**
 * 获取公开画廊（带缓存）
 */
export async function getCachedPublicGallery() {
  const cacheKey = 'public_gallery';

  const cached = getCachedData(cacheKey);
  if (cached) {
    return cached;
  }

  const dbClient = createClient();
  if (!dbClient) {
    return { data: null, error: { message: '数据库客户端不可用' } };
  }
  const { data, error } = await dbClient.rpc('get_public_gallery');

  if (!error && data) {
    setCachedData(cacheKey, { data, error });
  }

  return { data, error };
}

/**
 * 清除特定相册的缓存
 */
export function clearAlbumCache(accessKey: string) {
  clearCachedData(`album_content_${accessKey}`);
}

/**
 * 清除画廊缓存
 */
export function clearGalleryCache() {
  clearCachedData('public_gallery');
}


