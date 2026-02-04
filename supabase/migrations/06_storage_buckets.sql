-- ================================================================================================
-- 📂 项目：拾光谣 - SupaBase Storage 配置
-- 📝 版本：v1.0_Consolidated
-- 🎯 目标：创建APK存储桶（其他对象存储使用腾讯云COS）
-- 📅 日期：2026-02-04
-- 🔄 说明：APK文件使用SupaBase Storage，照片等其他文件使用腾讯云COS
-- ================================================================================================

-- ================================================================================================
-- 1. 创建 APK 存储桶
-- ================================================================================================

-- 创建公开的 APK 存储桶
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'apk-releases',
  'apk-releases',
  true,
  104857600, -- 100MB 限制
  ARRAY['application/vnd.android.package-archive']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 104857600,
  allowed_mime_types = ARRAY['application/vnd.android.package-archive']::text[];

COMMENT ON TABLE storage.buckets IS 'APK存储桶 - 用于存储Android应用安装包';

-- ================================================================================================
-- 2. Storage RLS 策略
-- ================================================================================================

-- 允许所有人读取 APK 文件
DROP POLICY IF EXISTS "Public APK read access" ON storage.objects;
CREATE POLICY "Public APK read access"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'apk-releases');

-- 只允许管理员上传 APK 文件
DROP POLICY IF EXISTS "Admin APK upload" ON storage.objects;
CREATE POLICY "Admin APK upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'apk-releases'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 只允许管理员更新 APK 文件
DROP POLICY IF EXISTS "Admin APK update" ON storage.objects;
CREATE POLICY "Admin APK update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'apk-releases'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 只允许管理员删除 APK 文件
DROP POLICY IF EXISTS "Admin APK delete" ON storage.objects;
CREATE POLICY "Admin APK delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'apk-releases'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ================================================================================================
-- 3. 存储桶说明
-- ================================================================================================

-- 注意事项：
-- 1. APK 文件存储在 SupaBase Storage 的 apk-releases 桶中
-- 2. 照片、图片等其他文件存储在腾讯云 COS 中
-- 3. 应用层需要处理腾讯云 COS 的文件上传、删除等操作
-- 4. 数据库中存储的是文件的 URL 或路径，而非文件本身

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ SupaBase Storage 配置完成！';
  RAISE NOTICE '📦 已创建存储桶：apk-releases（APK文件）';
  RAISE NOTICE '🔒 RLS 策略已配置：';
  RAISE NOTICE '   - 公开读取访问';
  RAISE NOTICE '   - 仅管理员可上传/更新/删除';
  RAISE NOTICE '💡 说明：';
  RAISE NOTICE '   - APK 文件使用 SupaBase Storage';
  RAISE NOTICE '   - 照片等其他文件使用腾讯云 COS';
  RAISE NOTICE '   - 应用层需要处理腾讯云 COS 的文件操作';
END $$;
