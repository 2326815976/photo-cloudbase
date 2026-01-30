-- ================================================================================================
-- 修复标签删除时的触发器冲突问题
-- ================================================================================================

-- 1. 删除旧的触发器
drop trigger if exists trigger_remove_tag_from_poses on public.pose_tags;
drop trigger if exists trigger_update_tag_usage_count on public.poses;

-- 2. 重新创建触发器函数（修复版本）

-- 删除标签时自动从所有摆姿中移除该标签（改为AFTER DELETE）
create or replace function public.remove_tag_from_poses()
returns trigger language plpgsql security definer as $$
begin
  -- 从所有poses的tags数组中移除被删除的标签
  update public.poses
  set tags = array_remove(tags, old.name)
  where old.name = any(tags);

  return old;
end;
$$;

-- 改为AFTER DELETE，避免与usage_count更新冲突
create trigger trigger_remove_tag_from_poses
  after delete on public.pose_tags
  for each row
  execute procedure public.remove_tag_from_poses();

-- 更新标签使用次数（添加存在性检查）
create or replace function public.update_tag_usage_count()
returns trigger language plpgsql security definer as $$
declare
  tag_name text;
begin
  -- 当poses表的tags字段变化时，更新相关标签的使用次数
  if TG_OP = 'INSERT' or TG_OP = 'UPDATE' then
    -- 更新新标签的使用次数
    foreach tag_name in array new.tags
    loop
      -- 只更新存在的标签
      update public.pose_tags
      set usage_count = (
        select count(*) from public.poses where tag_name = any(tags)
      )
      where name = tag_name;
    end loop;
  end if;

  if TG_OP = 'DELETE' or TG_OP = 'UPDATE' then
    -- 更新旧标签的使用次数
    foreach tag_name in array old.tags
    loop
      -- 只更新存在的标签（如果标签已被删除则跳过）
      update public.pose_tags
      set usage_count = (
        select count(*) from public.poses where tag_name = any(tags)
      )
      where name = tag_name;
    end loop;
  end if;

  return new;
end;
$$;

create trigger trigger_update_tag_usage_count
  after insert or update or delete on public.poses
  for each row
  execute procedure public.update_tag_usage_count();
