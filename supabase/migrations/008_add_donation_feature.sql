-- ================================================================================================
-- 📂 项目：拾光谣 - 打赏功能完整实现
-- 📝 版本：v1.0 - Complete Donation Feature
-- 🎯 目标：为 albums 表添加赞赏码字段并更新 RPC 函数
-- 📅 日期：2026-02-02
-- ================================================================================================

-- 1. 添加赞赏码图片URL字段
alter table public.albums
add column if not exists donation_qr_code_url text;

-- 添加注释
comment on column public.albums.donation_qr_code_url is '赞赏码图片URL：管理员上传的赞赏码图片地址，配合 enable_tipping 字段使用';

-- 2. 更新 get_album_content RPC 函数，添加 donation_qr_code_url 字段
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
            'id', id, 'title', title, 'welcome_letter', welcome_letter, 'cover_url', cover_url,
            'enable_tipping', enable_tipping, 'donation_qr_code_url', donation_qr_code_url,
            'admin_qr_path', (select payment_qr_code from profiles where role='admin' limit 1)
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
  RAISE NOTICE '✅ 打赏功能已完整实现！';
  RAISE NOTICE '📊 已为 albums 表添加 donation_qr_code_url 字段';
  RAISE NOTICE '📊 已更新 get_album_content RPC 函数以返回赞赏码字段';
END $$;
