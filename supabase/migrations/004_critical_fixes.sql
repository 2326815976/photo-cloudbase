-- ================================================================================================
-- 📂 项目：拾光谣 - 关键修复和优化
-- 📝 版本：v4.0 - Critical Fixes (合并 007 + 009)
-- 🎯 目标：相册删除、有效期管理、多个关键修复
-- 📅 日期：2026-02-02
-- ================================================================================================

-- ================================================================================================
-- Part 1: 相册有效期管理
-- ================================================================================================

-- 添加有效期字段和收件人名称字段到 albums 表
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS recipient_name text DEFAULT '拾光者';

-- 更新现有相册的有效期（如果为空，设置为创建时间+7天作为初始值）
UPDATE public.albums
SET expires_at = created_at + interval '7 days'
WHERE expires_at IS NULL;

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_albums_expires_at
  ON public.albums(expires_at)
  WHERE expires_at IS NOT NULL;

-- ================================================================================================
-- Part 2: 相册级联删除触发器
-- ================================================================================================

-- 删除旧函数（如果存在）
DROP FUNCTION IF EXISTS public.cascade_delete_album() CASCADE;

-- 创建专门的相册删除触发器函数（级联删除所有相关内容）
CREATE OR REPLACE FUNCTION public.cascade_delete_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  -- 删除相册下的所有照片
  DELETE FROM public.album_photos WHERE album_id = old.id;

  -- 删除相册下的所有文件夹
  DELETE FROM public.album_folders WHERE album_id = old.id;

  -- 删除用户绑定关系
  DELETE FROM public.user_album_bindings WHERE album_id = old.id;

  RETURN old;
END;
$$;

-- 绑定触发器到 albums 表
DROP TRIGGER IF EXISTS on_album_deleted ON public.albums;
CREATE TRIGGER on_album_deleted
  BEFORE DELETE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_album();

COMMENT ON FUNCTION public.cascade_delete_album() IS '触发器函数：删除相册时级联删除所有照片、文件夹和用户绑定';

-- 存储删除队列相关代码已移除（项目已迁移至腾讯云COS）

-- ================================================================================================
-- Part 3: 数据库字段补充
-- ================================================================================================

-- 为 albums 表添加 created_by 字段（用于级联删除用户时删除其创建的相册）
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 为现有相册设置默认创建者（设为第一个管理员）
UPDATE public.albums
SET created_by = (SELECT id FROM public.profiles WHERE role = 'admin' ORDER BY created_at LIMIT 1)
WHERE created_by IS NULL;

-- 为 profiles 表添加 nickname 字段（用于评论显示）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;

-- 将现有用户的 name 复制到 nickname
UPDATE public.profiles
SET nickname = name
WHERE nickname IS NULL;

COMMENT ON COLUMN public.albums.created_by IS '相册创建者，用于级联删除';
COMMENT ON COLUMN public.profiles.nickname IS '用户昵称，用于评论显示（从name字段复制）';

-- ================================================================================================
-- Part 4: 用户活跃日志触发器
-- ================================================================================================

-- 创建更新用户最后活跃时间的触发器函数
CREATE OR REPLACE FUNCTION public.update_last_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = new.user_id;
  RETURN new;
END;
$$;

-- 绑定触发器
DROP TRIGGER IF EXISTS on_user_active ON public.user_active_logs;
CREATE TRIGGER on_user_active
  AFTER INSERT ON public.user_active_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_active();

-- 存储桶策略已移除（项目已迁移至腾讯云COS）

-- ================================================================================================
-- Part 5: 用户级联删除触发器
-- ================================================================================================

-- 创建用户删除时的级联删除函数
CREATE OR REPLACE FUNCTION public.cascade_delete_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  -- 删除用户创建的所有相册（会触发 cascade_delete_album）
  DELETE FROM public.albums WHERE created_by = old.id;

  -- 删除用户的所有点赞
  DELETE FROM public.photo_likes WHERE user_id = old.id;

  -- 删除用户的所有评论
  DELETE FROM public.photo_comments WHERE user_id = old.id;

  -- 删除用户的活跃日志
  DELETE FROM public.user_active_logs WHERE user_id = old.id;

  RETURN old;
END;
$$;

-- 绑定触发器到 profiles 表
DROP TRIGGER IF EXISTS on_user_deleted ON public.profiles;
CREATE TRIGGER on_user_deleted
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_user();

COMMENT ON FUNCTION public.cascade_delete_user() IS '用户删除时级联删除其创建的所有相册和相关数据';

-- ================================================================================================
-- Part 6: RPC 函数优化
-- ================================================================================================

-- 更新 get_user_bound_albums 函数以使用新的 expires_at 字段
CREATE OR REPLACE FUNCTION public.get_user_bound_albums()
RETURNS jsonb LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_user_id uuid;
  result jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(json_agg(
    jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'cover_url', a.cover_url,
      'created_at', a.created_at,
      'access_key', a.access_key,
      'bound_at', b.created_at,
      'expires_at', COALESCE(a.expires_at, a.created_at + interval '7 days'),
      'is_expired', CASE
        WHEN a.expires_at IS NOT NULL THEN a.expires_at < now()
        ELSE (a.created_at + interval '7 days') < now()
      END
    )
    ORDER BY b.created_at DESC
  ), '[]'::json)
  INTO result
  FROM public.user_album_bindings b
  JOIN public.albums a ON a.id = b.album_id
  WHERE b.user_id = v_user_id;

  RETURN result;
END;
$$;

-- 更新 get_album_content 函数以包含有效期信息
CREATE OR REPLACE FUNCTION public.get_album_content(input_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_album_id uuid;
  result jsonb;
BEGIN
  -- 验证密钥并获取相册ID
  SELECT id INTO v_album_id FROM public.albums WHERE access_key = input_key;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '密钥错误';
  END IF;

  -- 构建返回数据
  SELECT jsonb_build_object(
    'album', jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'welcome_letter', a.welcome_letter,
      'cover_url', a.cover_url,
      'enable_tipping', a.enable_tipping,
      'recipient_name', COALESCE(a.recipient_name, '拾光者'),
      'expires_at', COALESCE(a.expires_at, a.created_at + interval '7 days'),
      'is_expired', CASE
        WHEN a.expires_at IS NOT NULL THEN a.expires_at < now()
        ELSE (a.created_at + interval '7 days') < now()
      END
    ),
    'folders', COALESCE((
      SELECT json_agg(jsonb_build_object('id', f.id, 'name', f.name) ORDER BY f.created_at DESC)
      FROM public.album_folders f
      WHERE f.album_id = v_album_id
    ), '[]'::json),
    'photos', COALESCE((
      SELECT json_agg(jsonb_build_object(
        'id', p.id,
        'folder_id', p.folder_id,
        'storage_path', p.url,
        'width', p.width,
        'height', p.height,
        'is_public', p.is_public,
        'blurhash', p.blurhash,
        'rating', p.rating,
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
          WHERE photo_id = p.id
        )
      ) ORDER BY p.created_at DESC)
      FROM public.album_photos p
      WHERE p.album_id = v_album_id
    ), '[]'::json)
  ) INTO result
  FROM public.albums a
  WHERE a.id = v_album_id;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_album_content(text) IS '获取相册内容（已修复：添加blurhash/rating/comments字段，移除管理员QR码泄露，优化评论查询）';

-- 更新 post_album_comment 函数以正确处理已登录用户的nickname
CREATE OR REPLACE FUNCTION public.post_album_comment(
  p_access_key text,
  p_photo_id uuid,
  p_content text
)
RETURNS void LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  valid_album_id uuid;
  v_user_id uuid;
  v_nickname text;
BEGIN
  v_user_id := auth.uid();

  -- 越权检测：验证 Key 是否对应照片所属相册
  SELECT a.id INTO valid_album_id
  FROM public.albums a
  JOIN public.album_photos p ON p.album_id = a.id
  WHERE a.access_key = p_access_key AND p.id = p_photo_id;

  IF valid_album_id IS NULL THEN
    RAISE EXCEPTION '无权操作：密钥错误或照片不属于该空间';
  END IF;

  -- 获取用户昵称（如果已登录）
  IF v_user_id IS NOT NULL THEN
    SELECT nickname INTO v_nickname FROM public.profiles WHERE id = v_user_id;
  END IF;

  INSERT INTO public.photo_comments (photo_id, user_id, content, nickname)
  VALUES (p_photo_id, v_user_id, p_content, COALESCE(v_nickname, '访客'));
END;
$$;

COMMENT ON FUNCTION public.post_album_comment(text, uuid, text) IS '发表照片评论（已修复：正确处理已登录用户的nickname）';

-- 创建删除相册照片的 RPC 函数（带密钥验证）
CREATE OR REPLACE FUNCTION public.delete_album_photo(
  p_access_key text,
  p_photo_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_album_id uuid;
  v_storage_path text;
BEGIN
  -- 验证密钥并获取相册ID
  SELECT a.id INTO v_album_id
  FROM public.albums a
  JOIN public.album_photos p ON p.album_id = a.id
  WHERE a.access_key = p_access_key AND p.id = p_photo_id;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '无权操作：密钥错误或照片不属于该空间';
  END IF;

  -- 获取存储路径
  SELECT url INTO v_storage_path FROM public.album_photos WHERE id = p_photo_id;

  -- 删除数据库记录
  DELETE FROM public.album_photos WHERE id = p_photo_id;
END;
$$;

COMMENT ON FUNCTION public.delete_album_photo(text, uuid) IS '删除相册照片（带密钥验证，防止越权删除）';

-- 存储桶策略已移除（项目已迁移至腾讯云COS）

-- ================================================================================================
-- Part 7: 清理过期数据函数
-- ================================================================================================

-- 优化 cleanup_expired_data 函数（先删除旧版本）
DROP FUNCTION IF EXISTS public.cleanup_expired_data() CASCADE;

CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY definer
AS $$
DECLARE
  deleted_photos int := 0;
  deleted_folders int := 0;
  deleted_albums int := 0;
BEGIN
  -- 删除过期且未公开的照片
  WITH deleted AS (
    DELETE FROM public.album_photos
    WHERE created_at < now() - interval '7 days'
    AND is_public = false
    RETURNING id
  )
  SELECT count(*) INTO deleted_photos FROM deleted;

  -- 删除空文件夹
  WITH deleted AS (
    DELETE FROM public.album_folders
    WHERE id NOT IN (
      SELECT DISTINCT folder_id
      FROM public.album_photos
      WHERE folder_id IS NOT NULL
    )
    AND created_at < now() - interval '24 hours'
    RETURNING id
  )
  SELECT count(*) INTO deleted_folders FROM deleted;

  -- 删除过期的空相册
  WITH deleted AS (
    DELETE FROM public.albums
    WHERE expires_at < now()
    AND id NOT IN (
      SELECT DISTINCT album_id
      FROM public.album_photos
    )
    RETURNING id
  )
  SELECT count(*) INTO deleted_albums FROM deleted;

  RETURN jsonb_build_object(
    'deleted_photos', deleted_photos,
    'deleted_folders', deleted_folders,
    'deleted_albums', deleted_albums,
    'timestamp', now()
  );
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_data() IS '清理过期数据（照片、文件夹、相册），应由定时任务每天调用';

-- 添加索引优化查询性能
CREATE INDEX IF NOT EXISTS idx_album_photos_created_at
  ON public.album_photos(created_at)
  WHERE is_public = false;

-- 存储清理辅助函数已移除（项目已迁移至腾讯云COS）

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 关键修复和优化完成！';
  RAISE NOTICE '📅 已添加字段：expires_at, recipient_name, created_by, nickname';
  RAISE NOTICE '🔄 已创建触发器：';
  RAISE NOTICE '   - cascade_delete_album（相册级联删除）';
  RAISE NOTICE '   - cascade_delete_user（用户级联删除）';
  RAISE NOTICE '   - update_last_active（用户活跃时间更新）';
  RAISE NOTICE '🔧 已优化 RPC 函数：';
  RAISE NOTICE '   - get_user_bound_albums（包含有效期）';
  RAISE NOTICE '   - get_album_content（包含有效期和完整信息）';
  RAISE NOTICE '   - post_album_comment（修复nickname处理）';
  RAISE NOTICE '   - delete_album_photo（带密钥验证）';
  RAISE NOTICE '   - cleanup_expired_data（清理过期数据）';
END $$;
