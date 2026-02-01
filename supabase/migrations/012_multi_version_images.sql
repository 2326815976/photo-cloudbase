-- ================================================================================================
-- 📂 项目：拾光谣 - 多层级图片加载优化
-- 📝 版本：v6.0 - Multi-Version Images
-- 🎯 目标：通过多版本图片策略优化加载速度，节省存储空间
-- 📅 日期：2026-02-01
-- ================================================================================================

-- [优化策略]
-- 1. 照片墙/返图空间：上传时生成 thumbnail(速览) + preview(高质量) + original(原图)
-- 2. 首页摆姿：单一版本，压缩到合理大小
-- 3. 加载策略：列表加载 thumbnail（极快），点击预览加载 preview（高质量），可选下载 original

-- ================================================================================================
-- 1. 为 album_photos 表添加多版本图片字段
-- ================================================================================================

-- 添加新字段
ALTER TABLE public.album_photos
ADD COLUMN IF NOT EXISTS thumbnail_url text,     -- 速览图 URL (300px, 质量75, ~50-100KB)
ADD COLUMN IF NOT EXISTS preview_url text,       -- 高质量预览 URL (1200px, 质量85, ~300-500KB)
ADD COLUMN IF NOT EXISTS original_url text;      -- 原图 URL (仅返图空间，完整质量)

-- 添加字段注释
COMMENT ON COLUMN public.album_photos.thumbnail_url IS '速览图URL - 用于列表快速加载 (300px, 质量75)';
COMMENT ON COLUMN public.album_photos.preview_url IS '高质量预览URL - 用于点击预览 (1200px, 质量85)';
COMMENT ON COLUMN public.album_photos.original_url IS '原图URL - 仅返图空间，用于下载 (完整质量)';

-- 保留 url 字段用于向后兼容，但改为可空（新数据不再使用）
ALTER TABLE public.album_photos ALTER COLUMN url DROP NOT NULL;
COMMENT ON COLUMN public.album_photos.url IS '兼容字段 - 新数据使用 thumbnail_url/preview_url/original_url';

-- ================================================================================================
-- 2. 更新 RPC 函数以返回多版本 URL
-- ================================================================================================

-- 更新获取照片墙数据的 RPC 函数
CREATE OR REPLACE FUNCTION public.get_public_gallery(page_no int, page_size int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  total_count int;
  photos_data jsonb;
BEGIN
  -- 获取总数
  SELECT COUNT(*) INTO total_count
  FROM public.album_photos
  WHERE is_public = true;

  -- 获取分页数据
  SELECT COALESCE(json_agg(t), '[]'::json) INTO photos_data FROM (
    SELECT
      p.id,
      -- 优先使用新字段，如果为空则回退到 url 字段（向后兼容）
      COALESCE(p.thumbnail_url, p.url) as thumbnail_url,
      COALESCE(p.preview_url, p.url) as preview_url,
      p.width,
      p.height,
      p.blurhash,
      p.like_count,
      p.view_count,
      p.created_at,
      EXISTS(
        SELECT 1 FROM public.photo_likes pl
        WHERE pl.photo_id = p.id AND pl.user_id = auth.uid()
      ) as is_liked
    FROM public.album_photos p
    WHERE p.is_public = true
    ORDER BY p.created_at DESC
    LIMIT page_size
    OFFSET (page_no - 1) * page_size
  ) t;

  -- 返回包含 photos 和 total 的对象
  RETURN jsonb_build_object(
    'photos', photos_data,
    'total', total_count
  );
END;
$$;

-- 更新获取专属相册内容的 RPC 函数
CREATE OR REPLACE FUNCTION public.get_album_content(input_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  target_album_id uuid;
  result jsonb;
BEGIN
  SELECT id INTO target_album_id FROM public.albums WHERE access_key = input_key;
  IF target_album_id IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'album', (
        SELECT jsonb_build_object(
            'id', id,
            'title', title,
            'welcome_letter', welcome_letter,
            'cover_url', cover_url,
            'enable_tipping', enable_tipping,
            'admin_qr_path', (SELECT payment_qr_code FROM profiles WHERE role='admin' LIMIT 1)
        ) FROM public.albums WHERE id = target_album_id
    ),
    'folders', (
        SELECT COALESCE(json_agg(jsonb_build_object('id', id, 'name', name)), '[]'::json)
        FROM public.album_folders WHERE album_id = target_album_id
    ),
    'photos', (
       SELECT COALESCE(json_agg(
           jsonb_build_object(
               'id', id,
               'folder_id', folder_id,
               -- 返回多版本 URL，优先使用新字段
               'thumbnail_url', COALESCE(thumbnail_url, url),
               'preview_url', COALESCE(preview_url, url),
               'original_url', COALESCE(original_url, url),
               'width', width,
               'height', height,
               'blurhash', blurhash,
               'is_public', is_public,
               'rating', rating,
               'comments', (
                   SELECT COALESCE(json_agg(
                       jsonb_build_object(
                           'nickname', nickname,
                           'content', content,
                           'is_admin', is_admin_reply,
                           'created_at', created_at
                       ) ORDER BY created_at ASC
                   ), '[]'::json)
                   FROM public.photo_comments
                   WHERE photo_id = album_photos.id
               )
           ) ORDER BY created_at DESC
       ), '[]'::json)
       FROM public.album_photos WHERE album_id = target_album_id
    )
  ) INTO result;

  RETURN result;
END;
$$;

-- ================================================================================================
-- 3. 数据迁移：为现有数据填充新字段
-- ================================================================================================

-- 将现有的 url 字段值复制到新字段（作为回退）
UPDATE public.album_photos
SET
  thumbnail_url = COALESCE(thumbnail_url, url),
  preview_url = COALESCE(preview_url, url),
  original_url = COALESCE(original_url, url)
WHERE thumbnail_url IS NULL OR preview_url IS NULL OR original_url IS NULL;

-- ================================================================================================
-- 4. 添加索引优化查询性能
-- ================================================================================================

-- 为新字段添加索引（如果需要按 URL 查询）
CREATE INDEX IF NOT EXISTS idx_album_photos_thumbnail_url ON public.album_photos(thumbnail_url) WHERE thumbnail_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_album_photos_preview_url ON public.album_photos(preview_url) WHERE preview_url IS NOT NULL;

-- ================================================================================================
-- 完成
-- ================================================================================================

-- 迁移完成提示
DO $$
BEGIN
  RAISE NOTICE '✅ 多层级图片加载优化迁移完成！';
  RAISE NOTICE '📊 新增字段：thumbnail_url, preview_url, original_url';
  RAISE NOTICE '🔄 已更新 RPC 函数：get_public_gallery, get_album_content';
  RAISE NOTICE '📝 现有数据已迁移，使用 url 字段作为回退';
END $$;
