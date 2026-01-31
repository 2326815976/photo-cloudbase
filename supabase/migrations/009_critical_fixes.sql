-- ================================================================================================
-- 第二轮 + 第四轮 + 第五轮复盘：严重问题修复合集
-- ================================================================================================
-- 本迁移文件修复了多轮复盘中发现的所有严重问题：
-- 第二轮：albums表RLS安全漏洞、用户活跃日志机制、releases存储桶策略
-- 第四轮：管理员QR码泄露、字段不完整、评论nickname处理、删除账户流程
-- 第五轮：数据结构字段缺失、函数重复定义
-- ================================================================================================

-- ================================================================================================
-- 问题1: 修复 albums 表 RLS 安全漏洞
-- ================================================================================================
DROP POLICY IF EXISTS "Allow public read access with access_key" ON public.albums;

COMMENT ON TABLE public.albums IS
  '专属返图空间表。安全设计:RLS默认拒绝所有直接访问,必须通过RPC函数get_album_content(access_key)携带密钥访问。';

-- ================================================================================================
-- 问题2: 添加用户活跃日志自动记录机制
-- ================================================================================================
CREATE OR REPLACE FUNCTION public.log_user_activity()
RETURNS void
LANGUAGE plpgsql
SECURITY definer
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.user_active_logs (user_id, active_date)
  VALUES (v_user_id, current_date)
  ON CONFLICT (user_id, active_date) DO NOTHING;

  IF NOT EXISTS (
    SELECT 1 FROM public.user_active_logs
    WHERE user_id = v_user_id
    AND active_date = current_date
    AND created_at < now() - interval '1 second'
  ) THEN
    INSERT INTO public.analytics_daily (date, active_users_count)
    VALUES (current_date, 1)
    ON CONFLICT (date)
    DO UPDATE SET active_users_count = analytics_daily.active_users_count + 1;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.log_user_activity() IS
  '记录用户活跃日志。前端需要在用户登录后或页面加载时调用此RPC函数。每个用户每天只记录一次。';

CREATE OR REPLACE FUNCTION public.update_last_active()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  UPDATE public.profiles
  SET last_active_at = now()
  WHERE id = auth.uid();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_user_active ON public.user_active_logs;
CREATE TRIGGER on_user_active
  AFTER INSERT ON public.user_active_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_last_active();

-- ================================================================================================
-- 问题3: 配置 releases 存储桶策略
-- ================================================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('releases', 'releases', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Admin can upload releases" ON storage.objects;
CREATE POLICY "Admin can upload releases"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'releases'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admin can delete releases" ON storage.objects;
CREATE POLICY "Admin can delete releases"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'releases'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Admin can update releases" ON storage.objects;
CREATE POLICY "Admin can update releases"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'releases'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
    AND role = 'admin'
  )
);

DROP POLICY IF EXISTS "Public can view releases" ON storage.objects;
CREATE POLICY "Public can view releases"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'releases');

-- ================================================================================================
-- 问题4: 添加数据库字段
-- ================================================================================================
-- 为 albums 表添加 created_by 字段（用于级联删除用户时删除其创建的相册）
ALTER TABLE public.albums ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 为现有相册设置默认创建者（设为第一个管理员）
UPDATE public.albums
SET created_by = (SELECT id FROM public.profiles WHERE role = 'admin' LIMIT 1)
WHERE created_by IS NULL;

-- 为 profiles 表添加 nickname 字段（用于评论显示）
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS nickname text;

-- 将现有的 name 复制到 nickname
UPDATE public.profiles
SET nickname = name
WHERE nickname IS NULL AND name IS NOT NULL;

-- ================================================================================================
-- 问题5: 修复 get_album_content() 函数
-- ================================================================================================
CREATE OR REPLACE FUNCTION public.get_album_content(input_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  v_album_id uuid;
  result jsonb;
BEGIN
  SELECT id INTO v_album_id FROM public.albums WHERE access_key = input_key;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '密钥错误';
  END IF;

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
          SELECT COALESCE(json_agg(jsonb_build_object(
            'id', c.id,
            'content', c.content,
            'nickname', COALESCE(c.nickname, pr.nickname, pr.name, '访客'),
            'created_at', c.created_at
          ) ORDER BY c.created_at DESC), '[]'::json)
          FROM public.photo_comments c
          LEFT JOIN public.profiles pr ON pr.id = c.user_id
          WHERE c.photo_id = p.id
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

-- ================================================================================================
-- 问题6: 修复 post_album_comment() 函数
-- ================================================================================================
CREATE OR REPLACE FUNCTION public.post_album_comment(
  p_access_key text,
  p_photo_id uuid,
  p_content text
)
RETURNS void LANGUAGE plpgsql SECURITY definer AS $$
DECLARE
  valid_album_id uuid;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();

  SELECT a.id INTO valid_album_id
  FROM public.albums a
  JOIN public.album_photos p ON p.album_id = a.id
  WHERE a.access_key = p_access_key AND p.id = p_photo_id;

  IF valid_album_id IS NULL THEN
    RAISE EXCEPTION '无权操作：密钥错误或照片不属于该空间';
  END IF;

  INSERT INTO public.photo_comments (photo_id, user_id, content, nickname)
  VALUES (
    p_photo_id,
    v_user_id,
    p_content,
    CASE WHEN v_user_id IS NULL THEN '访客' ELSE NULL END
  );
END;
$$;

-- ================================================================================================
-- 问题7: 添加删除账户时的级联删除逻辑
-- ================================================================================================
CREATE OR REPLACE FUNCTION public.cascade_delete_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  DELETE FROM public.albums WHERE created_by = old.id;
  DELETE FROM public.user_album_bindings WHERE user_id = old.id;
  DELETE FROM public.photo_comments WHERE user_id = old.id;
  RETURN old;
END;
$$;

DROP TRIGGER IF EXISTS on_user_deleted ON public.profiles;
CREATE TRIGGER on_user_deleted
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_user();

-- ================================================================================================
-- 问题8: 添加索引优化查询性能
-- ================================================================================================
CREATE INDEX IF NOT EXISTS idx_photo_comments_photo_id ON public.photo_comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_album_photos_album_id ON public.album_photos(album_id);
CREATE INDEX IF NOT EXISTS idx_albums_created_by ON public.albums(created_by) WHERE created_by IS NOT NULL;

-- ================================================================================================
-- 问题9: 移除存储删除队列触发器（已改为前端立即删除）
-- ================================================================================================
-- 注意：由于采用了前端立即删除Storage文件的方案，不再需要队列和触发器
-- 如果之前已经创建了这些触发器，需要删除它们

DROP TRIGGER IF EXISTS on_photo_deleted ON public.album_photos;
DROP TRIGGER IF EXISTS on_pose_deleted ON public.poses;
DROP FUNCTION IF EXISTS public.queue_storage_deletion();

-- ================================================================================================
-- 问题10: 添加相册级联删除触发器（从007迁移）
-- ================================================================================================
CREATE OR REPLACE FUNCTION public.cascade_delete_album()
RETURNS trigger
LANGUAGE plpgsql
SECURITY definer
AS $$
BEGIN
  -- 删除相册下的所有照片（会触发 queue_storage_deletion）
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

-- ================================================================================================
-- 问题11: 添加 delete_album_photo() 函数（从006迁移）
-- ================================================================================================
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

  -- 删除数据库记录（触发器会自动加入删除队列）
  DELETE FROM public.album_photos WHERE id = p_photo_id;
END;
$$;

-- ================================================================================================
-- 问题12: 添加albums存储桶的认证用户读取权限（用于生成签名URL）
-- ================================================================================================
DROP POLICY IF EXISTS "Authenticated can read albums for signing" ON storage.objects;
CREATE POLICY "Authenticated can read albums for signing"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'albums');

-- ================================================================================================
-- 添加注释说明
-- ================================================================================================
COMMENT ON COLUMN public.albums.created_by IS '相册创建者，用于级联删除';
COMMENT ON COLUMN public.profiles.nickname IS '用户昵称，用于评论显示（从name字段复制）';
COMMENT ON FUNCTION public.get_album_content(text) IS '获取相册内容（已修复：添加blurhash/rating/comments字段，移除管理员QR码泄露，优化评论查询）';
COMMENT ON FUNCTION public.post_album_comment(text, uuid, text) IS '发表照片评论（已修复：正确处理已登录用户的nickname）';
COMMENT ON FUNCTION public.cascade_delete_album() IS '触发器函数：删除相册时级联删除所有照片、文件夹和用户绑定';
COMMENT ON FUNCTION public.delete_album_photo(text, uuid) IS '删除相册照片（带密钥验证，防止越权删除）';
COMMENT ON FUNCTION public.cascade_delete_user() IS '用户删除时级联删除其创建的所有相册和相关数据';
