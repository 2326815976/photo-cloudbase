-- ================================================================================================
-- 修复用户注册：正确设置手机号和默认用户名
-- ================================================================================================

-- 修改触发器函数，从 user_metadata 中读取手机号，并设置默认用户名为"拾光者"
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, nickname, phone, role)
  VALUES (
    new.id,
    new.email,
    '拾光者', -- 默认用户名
    '拾光者', -- 默认昵称
    new.raw_user_meta_data->>'phone', -- 从 user_metadata 中读取手机号
    'user'
  );

  -- 更新日增用户统计
  INSERT INTO public.analytics_daily (date, new_users_count) VALUES (CURRENT_DATE, 1)
  ON CONFLICT (date) DO UPDATE SET new_users_count = analytics_daily.new_users_count + 1;

  RETURN new;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE '✅ 用户注册触发器已更新';
  RAISE NOTICE '   - 默认用户名：拾光者';
  RAISE NOTICE '   - 手机号从 user_metadata 中读取';
END $$;
