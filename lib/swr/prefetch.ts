/**
 * SWR 预加载工具
 * 根据当前路由智能预加载可能访问的页面数据
 */

import { mutate } from 'swr';
import { createClient } from '@/lib/supabase/client';

/**
 * 预加载照片墙数据
 */
export async function prefetchGallery(page: number = 1, pageSize: number = 20) {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase.rpc('get_public_gallery', {
    page_no: page,
    page_size: pageSize
  });

  if (data) {
    mutate(['gallery', page, pageSize], data, false);
  }
}

/**
 * 预加载相册列表
 */
export async function prefetchAlbums() {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase
    .from('albums')
    .select('*')
    .order('created_at', { ascending: false });

  if (data) {
    mutate('albums', data, false);
  }
}

/**
 * 预加载摆姿列表
 * @param limit - 限制预加载数量，默认10张
 */
export async function prefetchPoses(limit: number = 10) {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase
    .from('poses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (data) {
    mutate(['poses'], data, false);
  }
}

/**
 * 预加载标签列表
 */
export async function prefetchTags() {
  const supabase = createClient();
  if (!supabase) return;
  const { data } = await supabase
    .from('pose_tags')
    .select('*')
    .order('usage_count', { ascending: false });

  if (data) {
    mutate('tags', data, false);
  }
}

/**
 * 根据当前路由预加载相关数据
 * 优先级策略：摆姿 > 照片墙 > 其他
 */
export async function prefetchByRoute(pathname: string) {
  // 首页：优先加载摆姿，再加载照片墙
  if (pathname === '/') {
    await prefetchPoses(); // 优先加载摆姿（10张）
    prefetchGallery(); // 摆姿加载完成后再加载照片墙
    return;
  }

  // 照片墙页面：预加载相册列表
  if (pathname === '/gallery') {
    // 相册列表仅管理员可访问，避免公共路由触发无权限预取
  }

  // 相册页面：预加载照片墙
  if (pathname === '/album' || pathname.startsWith('/album/')) {
    prefetchGallery();
  }

  // 预约页面：预加载照片墙和相册
  if (pathname === '/booking') {
    prefetchGallery();
  }
}
