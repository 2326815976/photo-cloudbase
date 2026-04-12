-- 专属空间欢迎信方式兼容迁移
-- 为 albums 表补充 welcome_letter_mode 字段，支持 envelope / stamp / none 三种方式

SET @has_albums := (
  SELECT COUNT(*)
  FROM information_schema.tables
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
);

SET @has_welcome_letter_mode := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'welcome_letter_mode'
);

SET @has_enable_welcome_letter := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'enable_welcome_letter'
);

SET @add_welcome_letter_mode_sql := IF(
  @has_albums = 1 AND @has_welcome_letter_mode = 0,
  'ALTER TABLE `albums` ADD COLUMN `welcome_letter_mode` VARCHAR(24) NOT NULL DEFAULT ''envelope'' AFTER `enable_welcome_letter`',
  'SELECT 1'
);
PREPARE stmt_add_welcome_letter_mode FROM @add_welcome_letter_mode_sql;
EXECUTE stmt_add_welcome_letter_mode;
DEALLOCATE PREPARE stmt_add_welcome_letter_mode;

SET @has_welcome_letter_mode := (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'albums'
    AND column_name = 'welcome_letter_mode'
);

SET @normalize_welcome_letter_mode_sql := IF(
  @has_albums = 1 AND @has_welcome_letter_mode = 1 AND @has_enable_welcome_letter = 1,
  'UPDATE `albums`
      SET `welcome_letter_mode` = CASE
        WHEN `enable_welcome_letter` = 0 THEN ''none''
        WHEN TRIM(COALESCE(`welcome_letter_mode`, '''')) IN (''envelope'', ''stamp'', ''none'')
          THEN TRIM(`welcome_letter_mode`)
        ELSE ''envelope''
      END',
  IF(
    @has_albums = 1 AND @has_welcome_letter_mode = 1,
    'UPDATE `albums`
        SET `welcome_letter_mode` = CASE
          WHEN TRIM(COALESCE(`welcome_letter_mode`, '''')) IN (''envelope'', ''stamp'', ''none'')
            THEN TRIM(`welcome_letter_mode`)
          ELSE ''envelope''
        END',
    'SELECT 1'
  )
);
PREPARE stmt_normalize_welcome_letter_mode FROM @normalize_welcome_letter_mode_sql;
EXECUTE stmt_normalize_welcome_letter_mode;
DEALLOCATE PREPARE stmt_normalize_welcome_letter_mode;

SET @modify_welcome_letter_mode_sql := IF(
  @has_albums = 1 AND @has_welcome_letter_mode = 1,
  'ALTER TABLE `albums` MODIFY COLUMN `welcome_letter_mode` VARCHAR(24) NOT NULL DEFAULT ''envelope''',
  'SELECT 1'
);
PREPARE stmt_modify_welcome_letter_mode FROM @modify_welcome_letter_mode_sql;
EXECUTE stmt_modify_welcome_letter_mode;
DEALLOCATE PREPARE stmt_modify_welcome_letter_mode;
