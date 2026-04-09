-- 项目：拾光谣（photo）页面发布中心
-- 目标：为页面注册表补充显式的 Web 底部菜单候选能力字段

SET @has_column_is_nav_candidate_web := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'app_page_registry'
    AND column_name = 'is_nav_candidate_web'
);

SET @alter_sql := IF(
  @has_column_is_nav_candidate_web = 0,
  'ALTER TABLE app_page_registry ADD COLUMN is_nav_candidate_web TINYINT(1) NOT NULL DEFAULT 0 AFTER default_guest_tab_text',
  'SELECT 1'
);
PREPARE stmt FROM @alter_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE app_page_registry
SET is_nav_candidate_web = CASE WHEN IFNULL(icon_key, '''') <> '' THEN 1 ELSE 0 END
WHERE IFNULL(is_nav_candidate_web, 0) = 0;

