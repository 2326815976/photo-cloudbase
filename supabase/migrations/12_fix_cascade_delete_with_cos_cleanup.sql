-- ================================================================================================
-- 📂 项目：拾光谣 - 修复级联删除逻辑（添加COS文件清理）
-- 📝 版本：v1.0
-- 🎯 目标：确保删除数据库记录时同步清理COS存储文件
-- 📅 日期：2026-02-05
-- ================================================================================================

-- ================================================================================================
-- 1. 创建待删除文件队列表
-- ================================================================================================

-- 创建待删除文件队列表，用于记录需要从COS删除的文件
CREATE TABLE IF NOT EXISTS public.cos_deletion_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL,
  file_type text CHECK (file_type IN ('pose', 'photo_thumbnail', 'photo_preview', 'photo_original', 'album_cover', 'donation_qr')),
  related_id text,
  created_at timestamptz DEFAULT now(),
  processed_at timestamptz,
  status text DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_cos_deletion_queue_status ON public.cos_deletion_queue(status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_cos_deletion_queue_created_at ON public.cos_deletion_queue(created_at);

COMMENT ON TABLE public.cos_deletion_queue IS 'COS文件删除队列 - 记录需要从COS删除的文件路径';
COMMENT ON COLUMN public.cos_deletion_queue.storage_path IS 'COS存储路径';
COMMENT ON COLUMN public.cos_deletion_queue.file_type IS '文件类型';
COMMENT ON COLUMN public.cos_deletion_queue.related_id IS '关联的数据库记录ID';

-- ================================================================================================
-- 2. 创建触发器函数：摆姿图片删除时记录到队列
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.queue_pose_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 将摆姿图片的存储路径添加到删除队列
  IF OLD.storage_path IS NOT NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.storage_path, 'pose', OLD.id::text);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_pose_deletion ON public.poses;
CREATE TRIGGER trigger_queue_pose_deletion
  BEFORE DELETE ON public.poses
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_pose_deletion();

COMMENT ON FUNCTION public.queue_pose_deletion() IS '摆姿删除时将文件路径添加到COS删除队列';

-- ================================================================================================
-- 3. 创建触发器函数：相册照片删除时记录到队列
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.queue_photo_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 将照片的三个版本都添加到删除队列
  IF OLD.thumbnail_url IS NOT NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.thumbnail_url, 'photo_thumbnail', OLD.id::text);
  END IF;

  IF OLD.preview_url IS NOT NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.preview_url, 'photo_preview', OLD.id::text);
  END IF;

  IF OLD.original_url IS NOT NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.original_url, 'photo_original', OLD.id::text);
  END IF;

  -- 兼容旧的url字段
  IF OLD.url IS NOT NULL AND OLD.thumbnail_url IS NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.url, 'photo_original', OLD.id::text);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_photo_deletion ON public.album_photos;
CREATE TRIGGER trigger_queue_photo_deletion
  BEFORE DELETE ON public.album_photos
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_photo_deletion();

COMMENT ON FUNCTION public.queue_photo_deletion() IS '照片删除时将所有版本的文件路径添加到COS删除队列';

-- ================================================================================================
-- 4. 创建触发器函数：相册删除时记录封面和赞赏码到队列
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.queue_album_assets_deletion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 将相册封面添加到删除队列
  IF OLD.cover_url IS NOT NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.cover_url, 'album_cover', OLD.id::text);
  END IF;

  -- 将赞赏码添加到删除队列
  IF OLD.donation_qr_code_url IS NOT NULL THEN
    INSERT INTO public.cos_deletion_queue (storage_path, file_type, related_id)
    VALUES (OLD.donation_qr_code_url, 'donation_qr', OLD.id::text);
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trigger_queue_album_assets_deletion ON public.albums;
CREATE TRIGGER trigger_queue_album_assets_deletion
  BEFORE DELETE ON public.albums
  FOR EACH ROW
  EXECUTE FUNCTION public.queue_album_assets_deletion();

COMMENT ON FUNCTION public.queue_album_assets_deletion() IS '相册删除时将封面和赞赏码添加到COS删除队列';

-- ================================================================================================
-- 5. 创建RPC函数：获取待删除文件列表
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.get_pending_cos_deletions(batch_size int DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result jsonb;
BEGIN
  -- 获取待删除的文件列表
  SELECT json_agg(
    json_build_object(
      'id', id,
      'storage_path', storage_path,
      'file_type', file_type,
      'related_id', related_id
    )
  ) INTO result
  FROM (
    SELECT id, storage_path, file_type, related_id
    FROM public.cos_deletion_queue
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT batch_size
  ) t;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_pending_cos_deletions(int) IS '获取待删除的COS文件列表（用于后台任务处理）';

-- ================================================================================================
-- 6. 创建RPC函数：标记文件删除状态
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.mark_cos_deletion_status(
  deletion_ids uuid[],
  new_status text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE public.cos_deletion_queue
  SET
    status = new_status,
    processed_at = CASE WHEN new_status IN ('completed', 'failed') THEN now() ELSE processed_at END
  WHERE id = ANY(deletion_ids);
END;
$$;

COMMENT ON FUNCTION public.mark_cos_deletion_status(uuid[], text) IS '标记COS文件删除状态';

-- ================================================================================================
-- 7. 创建清理函数：删除已完成的记录
-- ================================================================================================

CREATE OR REPLACE FUNCTION public.cleanup_cos_deletion_queue()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- 删除7天前已完成的记录
  DELETE FROM public.cos_deletion_queue
  WHERE status = 'completed'
  AND processed_at < now() - interval '7 days';

  -- 重试失败的记录（将3天前失败的记录重置为pending）
  UPDATE public.cos_deletion_queue
  SET status = 'pending', processed_at = NULL
  WHERE status = 'failed'
  AND processed_at < now() - interval '3 days';
END;
$$;

COMMENT ON FUNCTION public.cleanup_cos_deletion_queue() IS '清理COS删除队列（删除已完成记录，重试失败记录）';

-- ================================================================================================
-- 8. RLS 策略
-- ================================================================================================

ALTER TABLE public.cos_deletion_queue ENABLE ROW LEVEL SECURITY;

-- 只有管理员可以查看和管理删除队列
CREATE POLICY "Admin manage cos deletion queue"
ON public.cos_deletion_queue
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  )
);

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 级联删除COS文件清理机制创建完成！';
  RAISE NOTICE '📊 已创建：';
  RAISE NOTICE '   - cos_deletion_queue 表：记录待删除文件';
  RAISE NOTICE '   - 触发器：自动记录删除的文件路径';
  RAISE NOTICE '   - RPC函数：获取和管理删除队列';
  RAISE NOTICE '💡 使用说明：';
  RAISE NOTICE '   1. 数据库删除操作会自动将文件路径添加到队列';
  RAISE NOTICE '   2. 后台任务定期调用 get_pending_cos_deletions() 获取待删除文件';
  RAISE NOTICE '   3. 删除COS文件后调用 mark_cos_deletion_status() 更新状态';
  RAISE NOTICE '   4. 定期调用 cleanup_cos_deletion_queue() 清理队列';
END $$;
