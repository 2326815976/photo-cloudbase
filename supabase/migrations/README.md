# 数据库迁移文件说明

## 📋 迁移文件清单

本目录包含拾光谣项目的所有数据库迁移文件，已整理为“主迁移 + 修复补丁”两部分；部署时请严格按顺序执行，包含手工补丁文件。

### 执行顺序

**必须按照以下顺序依次执行迁移文件：**

| 序号 | 文件名 | 功能说明 | 依赖关系 |
|------|--------|----------|----------|
| 01 | `01_core_schema.sql` | 核心数据库结构：用户系统、统计系统、摆姿系统、相册系统、照片系统、版本发布 | 无 |
| 02 | `02_album_system.sql` | 相册系统完整功能：用户绑定、访问控制、有效期管理、打赏功能、欢迎信控制 | 依赖 01 |
| 03 | `03_photo_wall.sql` | 照片墙功能：浏览量去重、点赞功能、定格到照片墙 | 依赖 01, 02 |
| 04 | `04_booking_system.sql` | 预约系统：约拍类型、城市限制、预约管理、档期锁定、竞态条件防护 | 依赖 01 |
| 05 | `05_analytics.sql` | 统计分析系统：管理员仪表板、实时数据、趋势分析 | 依赖 01 |
| 06 | `06_storage_buckets.sql` | 存储桶配置：APK文件存储（其他文件使用腾讯云COS） | 依赖 01 |
| 07 | `07_cleanup_maintenance.sql` | 清理和维护函数：过期数据清理、定期维护任务 | 依赖 01-05 |
| 08 | `08_performance_optimization.sql` | 性能优化索引：为高频查询添加必要的索引 | 依赖 01-04 |
| 09 | `09_cos_cleanup_queue.sql` | COS文件清理队列：确保删除数据库记录时同步清理COS存储文件 | 依赖 01, 02 |
| 10 | `10_ip_rate_limit.sql` | IP注册频率限制：防止恶意注册 | 依赖 01 |
| 11 | `11_query_optimization.sql` | 查询性能优化：添加缺失索引、优化多表查询、创建高效RPC函数 | 依赖 01-04 |
| 12 | `12_fix_booking_types_updated_at.sql` | 修复约拍类型表的 `updated_at` 自动更新时间触发器 | 依赖 04 |
| 99 | `99_manual_patch_utc8_and_fixes.sql` | 手工补丁：统一 UTC+8、预约/相册权限与维护任务修正 | 依赖 01-12 |

## 🔄 合并历史

### 已合并的文件

以下文件已被合并到主迁移文件中，不再需要单独执行：

- ✅ `09_fix_user_registration.sql` → 合并到 `01_core_schema.sql`
- ✅ `14_unify_timezone_handling.sql` → 合并到 `01_core_schema.sql`
- ✅ `15_add_enable_welcome_letter.sql` → 合并到 `02_album_system.sql`
- ✅ `16_update_get_album_content_function.sql` → 合并到 `02_album_system.sql`
- ✅ `11_fix_booking_race_condition.sql` → 合并到 `04_booking_system.sql`

### 合并详情

#### 01_core_schema.sql (v2.0)
**整合内容：**
- 原始核心架构 (001, 002, 007, 010)
- 用户注册修复：从 user_metadata 读取手机号，设置默认用户名为"拾光者"
- UTC时区设置：统一数据库时区为UTC，与应用层保持一致

#### 02_album_system.sql (v2.0)
**整合内容：**
- 原始相册系统 (003, 004, 008, 009)
- 欢迎信控制：添加 `enable_welcome_letter` 字段
- 更新 `get_album_content` 函数：返回欢迎信显示状态

#### 04_booking_system.sql (v3.0)
**整合内容：**
- 原始预约系统 (04, 09, 10)
- 竞态条件防护：
  - 添加唯一索引 `idx_bookings_unique_active_date`
  - `check_date_availability` 函数使用 `FOR UPDATE` 行级锁
  - 防止同一日期多个活跃预约

## 📊 优化成果

- **文件数量：** 从 16 个减少到 11 个（减少 31.25%）
- **冗余消除：** 移除了 5 个重复定义的迁移文件
- **冲突解决：** 修复了函数重复定义和时区设置冲突
- **依赖优化：** 明确了迁移文件之间的依赖关系

## 🚀 执行指南

### 全新数据库初始化

```bash
# 按顺序执行所有迁移文件
cd supabase/migrations
for file in $(ls *.sql | sort); do
  echo "执行迁移: $file"
  psql -d your_database -f "$file"
done
```

### Supabase CLI 执行

```bash
# 使用 Supabase CLI 自动执行迁移
supabase db reset
```

### 验证迁移

```sql
-- 检查所有表是否创建成功
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 检查所有函数是否创建成功
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- 检查所有索引是否创建成功
SELECT indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY indexname;
```

## ⚠️ 注意事项

1. **执行顺序：** 必须严格按照编号顺序执行，否则会因为依赖关系导致失败
2. **幂等性：** 所有迁移文件都使用了 `IF NOT EXISTS` 和 `CREATE OR REPLACE`，可以安全地重复执行
3. **时区设置：** 若执行 `99_manual_patch_utc8_and_fixes.sql`，数据库时区将统一为 `Asia/Shanghai`（UTC+8）；应用层需保持同一口径
4. **定时任务：** 部分迁移文件包含 pg_cron 定时任务配置，需要确保扩展已启用
5. **备份：** 执行迁移前建议备份数据库，原始迁移文件已备份到 `migrations_backup/` 目录

## 🔧 故障排查

### 常见问题

**问题1：时区相关的日期偏差**
- **原因：** 数据库时区与应用层不一致
- **解决：** 先确认是否已执行 `99_manual_patch_utc8_and_fixes.sql`；若已执行，请按 UTC+8 口径处理日期逻辑

**问题2：预约日期冲突**
- **原因：** 并发预约导致竞态条件
- **解决：** 已通过唯一索引和行级锁解决，确保 `04_booking_system.sql` 正确执行

**问题3：函数未找到**
- **原因：** 迁移文件执行顺序错误
- **解决：** 按照编号顺序重新执行迁移文件

**问题4：COS文件未删除**
- **原因：** 删除队列未正确处理
- **解决：** 检查 `09_cos_cleanup_queue.sql` 是否正确执行，并配置后台任务定期处理删除队列

## 📝 维护建议

1. **定期清理：** 配置定时任务每天执行 `run_maintenance_tasks()` 函数
2. **性能监控：** 定期执行 `get_table_stats()` 查看表统计信息
3. **索引优化：** 根据实际查询情况调整索引策略
4. **数据归档：** 定期归档历史数据，保持数据库性能

## 📚 相关文档

- [Supabase 官方文档](https://supabase.com/docs)
- [PostgreSQL 官方文档](https://www.postgresql.org/docs/)

---

**最后更新：** 2026-02-07  
**维护者：** 拾光谣开发团队
