# 数据库迁移文件说明

## 概述

本目录包含拾光谣项目的数据库迁移文件，已经过合并和清洗，按功能模块组织。

## 迁移文件列表

按顺序执行以下SQL文件即可完成数据库结构的完整迁移：

### 1. `01_core_schema.sql` - 核心数据库结构
**功能模块：**
- 用户系统 (profiles)
- 统计系统 (user_active_logs, analytics_daily)
- 摆姿资源系统 (poses, pose_tags)
- 专属返图空间 (albums, album_folders)
- 照片与互动 (album_photos, photo_comments, photo_likes)
- 版本发布 (app_releases)
- 核心RPC接口和触发器

**合并自：** 001, 002, 007, 010

### 2. `02_album_system.sql` - 相册系统完整功能
**功能模块：**
- 用户-相册绑定 (user_album_bindings)
- 相册访问控制和RLS策略优化
- 相册有效期管理
- 打赏功能
- 级联删除触发器
- 相册相关RPC函数

**合并自：** 003, 004, 008, 009

### 3. `03_photo_wall.sql` - 照片墙功能
**功能模块：**
- 多版本图片支持 (thumbnail_url, preview_url, original_url)
- 浏览量去重机制 (photo_views表)
- 点赞功能
- 定格照片到照片墙
- 照片墙数据获取

**合并自：** 005

### 4. `04_booking_system.sql` - 预约系统
**功能模块：**
- 约拍类型管理 (booking_types)
- 城市限制 (allowed_cities)
- 预约管理 (bookings)
- 档期锁定 (booking_blackouts)
- 预约取消策略
- 自动完成过期预约

**合并自：** 006, 012, 013

### 5. `05_analytics.sql` - 统计分析系统
**功能模块：**
- 扩展统计表 (analytics_daily)
- 实时统计查询函数
- 每日统计快照更新
- 历史趋势分析
- 管理员仪表板数据

**合并自：** 011

### 6. `06_storage_buckets.sql` - SupaBase Storage配置
**功能模块：**
- APK存储桶创建和配置
- Storage RLS策略
- 文件上传/下载权限控制

**说明：**
- APK文件使用SupaBase Storage
- 照片等其他文件使用腾讯云COS
- 应用层需要处理腾讯云COS的文件操作

### 7. `07_cleanup_maintenance.sql` - 清理和维护函数
**功能模块：**
- 清理过期数据 (照片、文件夹、相册)
- 清理旧浏览记录
- 自动完成过期预约
- 综合维护任务函数
- 定时任务配置

## 执行顺序

**重要：必须按照文件名顺序执行！**

```bash
# 方式1：使用psql命令行
psql -h your-host -U your-user -d your-database -f 01_core_schema.sql
psql -h your-host -U your-user -d your-database -f 02_album_system.sql
psql -h your-host -U your-user -d your-database -f 03_photo_wall.sql
psql -h your-host -U your-user -d your-database -f 04_booking_system.sql
psql -h your-host -U your-user -d your-database -f 05_analytics.sql
psql -h your-host -U your-user -d your-database -f 06_storage_buckets.sql
psql -h your-host -U your-user -d your-database -f 07_cleanup_maintenance.sql

# 方式2：使用Supabase CLI
supabase db push

# 方式3：在Supabase Dashboard中手动执行
# 依次复制每个文件的内容到SQL编辑器中执行
```

## 数据库架构特点

### 存储策略
- **APK文件：** SupaBase Storage (apk-releases桶)
- **照片/图片：** 腾讯云COS
- **数据库：** 仅存储文件URL/路径，不存储文件本身

### 安全特性
- 完整的RLS (Row Level Security) 策略
- 基于角色的访问控制 (admin/user)
- 密钥验证机制
- 级联删除保护

### 性能优化
- 合理的索引设计
- 统计数据缓存 (analytics_daily)
- 浏览量去重机制
- 定期清理过期数据

## 维护建议

### 定时任务
建议配置以下定时任务（使用pg_cron或Supabase Edge Functions）：

1. **每日凌晨1点：** 自动完成过期预约
   ```sql
   SELECT public.auto_complete_expired_bookings();
   ```

2. **每日凌晨2点：** 执行综合维护任务
   ```sql
   SELECT public.run_maintenance_tasks();
   ```

3. **每日凌晨3点：** 更新统计快照
   ```sql
   SELECT public.update_daily_analytics_snapshot();
   ```

### 备份策略
- 定期备份数据库
- 保留迁移文件历史版本
- 测试环境先验证迁移

## 回滚说明

如需回滚到旧版本迁移文件，请查看 `migrations_backup` 目录中的备份文件。

## 变更历史

### v1.0_Consolidated (2026-02-04)
- 合并13个迁移文件为7个功能模块
- 优化SQL结构和注释
- 统一RLS策略
- 添加完整的Storage配置
- 完善维护函数

### 原始版本
- 001-013: 分散的迁移文件（已备份至migrations_backup目录）

## 注意事项

1. **首次迁移：** 按顺序执行所有7个文件
2. **增量更新：** 只执行新增的迁移文件
3. **生产环境：** 务必先在测试环境验证
4. **数据备份：** 执行前务必备份数据库
5. **权限检查：** 确保数据库用户有足够权限

## 技术支持

如遇到问题，请检查：
1. PostgreSQL版本兼容性 (建议14+)
2. SupaBase扩展是否启用
3. 数据库连接权限
4. SQL执行日志

---

**项目：** 拾光谣 (Time Ballad)
**数据库：** PostgreSQL + SupaBase
**最后更新：** 2026-02-04
