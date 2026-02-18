/**
 * SWR 自定义 Hooks
 * 封装常用的数据获取逻辑，提供统一的缓存和错误处理
 */

import useSWR from 'swr';
import { createClient } from '@/lib/cloudbase/client';
import { CACHE_TIME } from './config';

function isSortOrderColumnMissing(error: unknown): boolean {
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '').toLowerCase()
      : String(error ?? '').toLowerCase();
  return (
    message.includes('sort_order') &&
    (message.includes('unknown column') ||
      message.includes('does not exist') ||
      (message.includes('column') && message.includes('not found')))
  );
}

/**
 * 照片墙数据 Hook
 */
export function useGallery(
  page: number = 1,
  pageSize: number = 20,
  fallbackData?: any,
  cacheToken: string | number = 'default'
) {
  const fetcher = async () => {
    const dbClient = createClient();
    if (!dbClient) {
      throw new Error('数据库客户端不可用');
    }

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('gallery_fetch_timeout')), 8000);
    });

    const queryPromise = dbClient.rpc('get_public_gallery', {
      page_no: page,
      page_size: pageSize
    });

    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);

    if (error) throw error;
    return data;
  };

  return useSWR(
    ['gallery', cacheToken, page, pageSize],
    fetcher,
    {
      dedupingInterval: CACHE_TIME.GALLERY,
      revalidateOnFocus: false,
      revalidateOnReconnect: true,
      fallbackData,
      revalidateOnMount: !fallbackData,
    }
  );
}

/**
 * 相册列表 Hook
 */
export function useAlbums() {
  const fetcher = async () => {
    const dbClient = createClient();
    if (!dbClient) {
      throw new Error('数据库客户端不可用');
    }
    const { data, error } = await dbClient
      .from('albums')
      .select('id, access_key, title, cover_url, recipient_name, expires_at, created_at')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  };

  return useSWR(
    'albums',
    fetcher,
    {
      dedupingInterval: CACHE_TIME.ALBUMS,
      revalidateOnFocus: true,
    }
  );
}

/**
 * 相册内容 Hook
 */
export function useAlbumContent(albumId: string | null) {
  const fetcher = async () => {
    if (!albumId) return null;

    const dbClient = createClient();
    if (!dbClient) {
      throw new Error('数据库客户端不可用');
    }
    const { data, error } = await dbClient.rpc('get_album_content', {
      input_key: albumId
    });

    if (error) throw error;
    return data;
  };

  return useSWR(
    albumId ? ['album-content', albumId] : null,
    fetcher,
    {
      dedupingInterval: CACHE_TIME.ALBUM_CONTENT,
      revalidateOnFocus: true,
    }
  );
}

/**
 * 摆姿列表 Hook
 */
export function usePoses(tags: string[] = []) {
  const fetcher = async () => {
    const dbClient = createClient();
    if (!dbClient) {
      throw new Error('数据库客户端不可用');
    }
    let query = dbClient
      .from('poses')
      .select('*')
      .order('created_at', { ascending: false });

    // 如果有标签筛选
    if (tags.length > 0) {
      query = query.contains('tags', tags);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data;
  };

  return useSWR(
    ['poses', ...tags],
    fetcher,
    {
      dedupingInterval: CACHE_TIME.POSES,
      revalidateOnFocus: true,
    }
  );
}

/**
 * 标签列表 Hook
 */
export function useTags() {
  const fetcher = async () => {
    const dbClient = createClient();
    if (!dbClient) {
      throw new Error('数据库客户端不可用');
    }
    let { data, error } = await dbClient
      .from('pose_tags')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('usage_count', { ascending: false })
      .order('name', { ascending: true });

    if (error && isSortOrderColumnMissing(error)) {
      const fallback = await dbClient
        .from('pose_tags')
        .select('*')
        .order('usage_count', { ascending: false });
      data = fallback.data;
      error = fallback.error;
    }

    if (error) throw error;
    return data;
  };

  return useSWR(
    'tags',
    fetcher,
    {
      dedupingInterval: CACHE_TIME.TAGS,
      revalidateOnFocus: false, // 标签变化不频繁，不需要焦点重新验证
    }
  );
}
