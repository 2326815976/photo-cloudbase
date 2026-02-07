-- ================================================================================================
-- 📂 项目：拾光谣 - 相册系统完整功能
-- 📝 版本：v2.0_Consolidated
-- 🎯 目标：相册访问控制、有效期管理、打赏功能、级联删除、欢迎信控制
-- 📅 日期：2026-02-05
-- 🔄 合并自：003, 004, 008, 009, 15_add_enable_welcome_letter.sql, 16_update_get_album_content_function.sql
-- ================================================================================================

-- ================================================================================================
-- 1. 用户-相册绑定表
-- ================================================================================================

-- 表：用户相册绑定
CREATE TABLE IF NOT EXISTS public.user_album_bindings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  album_id uuid REFERENCES public.albums(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, album_id)
);

CREATE INDEX IF NOT EXISTS idx_bindings_user ON public.user_album_bindings(user_id);

-- RLS 策略
ALTER TABLE public.user_album_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "User manage own bindings" ON user_album_bindings
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Admin view all bindings" ON user_album_bindings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ================================================================================================
-- 2. 相册表 RLS 策略优化
-- ================================================================================================

-- 删除可能存在的旧策略
DROP POLICY IF EXISTS "Allow public read access with access_key" ON public.albums;
DROP POLICY IF EXISTS "Allow authenticated users to read albums" ON public.albums;
DROP POLICY IF EXISTS "Allow admin full access" ON public.albums;

-- 创建新策略：仅允许已绑定的用户读取相册
CREATE POLICY "Allow bound users read albums"
  ON public.albums FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_album_bindings b
      WHERE b.album_id = albums.id AND b.user_id = auth.uid()
    )
  );

-- 确保管理员可以完全管理相册
CREATE POLICY "Allow admin full access"
  ON public.albums FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ================================================================================================
-- 3. 相册级联删除触发器
-- ================================================================================================

-- 创建专门的相册删除触发器函数（级联删除所有相关内容）
CREATE OR REPLACE FUNCTION public.cascade_delete_album()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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

DROP TRIGGER IF EXISTS on_album_deleted ON public.albums;
CREATE TRIGGER on_album_deleted
  BEFORE DELETE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_album();

COMMENT ON FUNCTION public.cascade_delete_album() IS '触发器函数：删除相册时级联删除所有照片、文件夹和用户绑定';

-- ================================================================================================
-- 4. 用户级联删除触发器
-- ================================================================================================

-- 创建用户删除时的级联删除函数
CREATE OR REPLACE FUNCTION public.cascade_delete_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
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

DROP TRIGGER IF EXISTS on_user_deleted ON public.profiles;
CREATE TRIGGER on_user_deleted
  BEFORE DELETE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.cascade_delete_user();

COMMENT ON FUNCTION public.cascade_delete_user() IS '用户删除时级联删除其创建的所有相册和相关数据';

-- ================================================================================================
-- 5. RPC 函数：绑定用户与相册
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.bind_user_to_album(p_access_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_user_id uuid;
  v_album_id uuid;
  v_album_info jsonb;
BEGIN
  v_user_id := auth.uid();

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION '请先登录';
  END IF;

  -- 验证密钥并获取相册ID
  SELECT id INTO v_album_id FROM public.albums WHERE access_key = p_access_key;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '密钥错误';
  END IF;

  -- 插入绑定记录（如果已存在则忽略）
  INSERT INTO public.user_album_bindings (user_id, album_id)
  VALUES (v_user_id, v_album_id)
  ON CONFLICT (user_id, album_id) DO NOTHING;

  -- 返回相册信息
  SELECT jsonb_build_object(
    'id', id,
    'title', title,
    'cover_url', cover_url,
    'created_at', created_at
  ) INTO v_album_info
  FROM public.albums
  WHERE id = v_album_id;

  RETURN v_album_info;
END;
$$;

-- ================================================================================================
-- 6. RPC 函数：获取用户绑定的所有相册
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.get_user_bound_albums()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
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

-- ================================================================================================
-- 7. 添加欢迎信控制字段
-- ================================================================================================

-- 添加 enable_welcome_letter 字段到 albums 表
ALTER TABLE public.albums
ADD COLUMN IF NOT EXISTS enable_welcome_letter boolean DEFAULT true;

-- 添加字段注释
COMMENT ON COLUMN public.albums.enable_welcome_letter IS '是否启用欢迎信显示（默认true）';

-- 更新现有记录，默认启用欢迎信
UPDATE public.albums
SET enable_welcome_letter = true
WHERE enable_welcome_letter IS NULL;

-- ================================================================================================
-- 8. RPC 函数：获取相册内容（完整版，包含欢迎信控制）
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.get_album_content(input_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_album_id uuid;
  result jsonb;
BEGIN
  -- 验证密钥并获取相册ID
  SELECT id INTO v_album_id FROM public.albums WHERE access_key = input_key;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '密钥错误';
  END IF;

  -- 构建返回数据（添加 enable_welcome_letter 字段）
  SELECT jsonb_build_object(
    'album', jsonb_build_object(
      'id', a.id,
      'title', a.title,
      'welcome_letter', a.welcome_letter,
      'cover_url', a.cover_url,
      'enable_tipping', a.enable_tipping,
      'enable_welcome_letter', COALESCE(a.enable_welcome_letter, true),
      'donation_qr_code_url', a.donation_qr_code_url,
      'recipient_name', COALESCE(a.recipient_name, '拾光者'),
      'created_at', a.created_at,
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
        'thumbnail_url', COALESCE(p.thumbnail_url, p.url),
        'preview_url', COALESCE(p.preview_url, p.url),
        'original_url', COALESCE(p.original_url, p.url),
        'width', p.width,
        'height', p.height,
        'blurhash', p.blurhash,
        'is_public', p.is_public,
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

COMMENT ON FUNCTION public.get_album_content(text) IS '获取相册完整内容（包含欢迎信显示控制）';

-- ================================================================================================
-- 8. RPC 函数：删除相册照片（带密钥验证）
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.delete_album_photo(
  p_access_key text,
  p_photo_id uuid
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_album_id uuid;
BEGIN
  -- 验证密钥并获取相册ID
  SELECT a.id INTO v_album_id
  FROM public.albums a
  JOIN public.album_photos p ON p.album_id = a.id
  WHERE a.access_key = p_access_key AND p.id = p_photo_id;

  IF v_album_id IS NULL THEN
    RAISE EXCEPTION '无权操作：密钥错误或照片不属于该空间';
  END IF;

  -- 删除数据库记录
  DELETE FROM public.album_photos WHERE id = p_photo_id;
END;
$$;

COMMENT ON FUNCTION public.delete_album_photo(text, uuid) IS '删除相册照片（带密钥验证，防止越权删除）';

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 相册系统完整功能创建完成！';
  RAISE NOTICE '📊 已创建：用户绑定、访问控制、有效期管理、打赏功能';
  RAISE NOTICE '🔒 RLS 策略已优化';
  RAISE NOTICE '⚡ 级联删除触发器已设置';
  RAISE NOTICE '🔄 RPC 函数已创建';
END $$;
