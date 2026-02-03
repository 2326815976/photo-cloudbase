-- ================================================================================================
-- 📂 项目：拾光谣 - 添加相册过期信息
-- 📝 版本：v1.0 - Add Expires Info to Album
-- 🎯 目标：在 get_album_content 函数中返回过期时间和创建时间
-- 📅 日期：2026-02-03
-- ================================================================================================

-- 更新 get_album_content RPC 函数，添加 expires_at 和 created_at 字段
create or replace function public.get_album_content(input_key text)
returns jsonb language plpgsql security definer as $$
declare
  target_album_id uuid;
  result jsonb;
begin
  select id into target_album_id from public.albums where access_key = input_key;
  if target_album_id is null then return null; end if;

  select jsonb_build_object(
    'album', (
        select jsonb_build_object(
            'id', id,
            'title', title,
            'welcome_letter', welcome_letter,
            'cover_url', cover_url,
            'enable_tipping', enable_tipping,
            'donation_qr_code_url', donation_qr_code_url,
            'recipient_name', recipient_name,
            'admin_qr_path', (select payment_qr_code from profiles where role='admin' limit 1),
            -- 添加过期时间和创建时间
            'created_at', created_at,
            'expires_at', coalesce(expires_at, created_at + interval '7 days'),
            'is_expired', case
              when expires_at is not null then expires_at < now()
              else (created_at + interval '7 days') < now()
            end
        ) from public.albums where id = target_album_id
    ),
    'folders', (
        select coalesce(json_agg(jsonb_build_object('id', id, 'name', name)), '[]'::json)
        from public.album_folders where album_id = target_album_id
    ),
    'photos', (
       select coalesce(json_agg(
           jsonb_build_object(
               'id', id,
               'folder_id', folder_id,
               'thumbnail_url', coalesce(thumbnail_url, url),
               'preview_url', coalesce(preview_url, url),
               'original_url', coalesce(original_url, url),
               'width', width,
               'height', height,
               'blurhash', blurhash,
               'is_public', is_public,
               'rating', rating,
               -- 仅在专属空间内返回评论数据
               'comments', (
                   select coalesce(json_agg(
                       jsonb_build_object('nickname', nickname, 'content', content, 'is_admin', is_admin_reply, 'created_at', created_at)
                       order by created_at asc
                   ), '[]'::json)
                   from public.photo_comments where photo_id = album_photos.id
               )
           ) order by created_at desc
       ), '[]'::json)
       from public.album_photos where album_id = target_album_id
    )
  ) into result;

  return result;
end;
$$;

-- ================================================================================================
-- 完成
-- ================================================================================================

DO $$
BEGIN
  RAISE NOTICE '✅ 相册过期信息已添加！';
  RAISE NOTICE '📊 已更新 get_album_content RPC 函数以返回 expires_at、created_at 和 is_expired 字段';
END $$;
