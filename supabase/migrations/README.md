# 数据库迁移文件说明

## 📋 迁移文件执行顺序

请在 Supabase SQL Editor 中按照以下顺序执行迁移文件：

### 1. 核心结构
```sql
01_core_schema.sql
```
**内容：** 用户系统、统计系统、摆姿系统、相册系统、照片系统、版本发布

### 2. 相册系统
```sql
02_album_system.sql
```
**内容：** 用户绑定、访问控制、有效期管理、打赏功能、级联删除

### 3. 照片墙功能
```sql
03_photo_wall.sql
```
**内容：** 浏览量去重、点赞功能、定格到照片墙、多版本图片

### 4. 预约系统
```sql
04_booking_system.sql
```
**内容：** 约拍类型、城市限制、预约管理、档期锁定、取消策略、进行中状态

### 5. 统计分析
```sql
05_analytics.sql
```
**内容：** 管理员仪表板统计、实时数据、趋势分析、进行中状态统计

### 6. Storage 配置
```sql
06_storage_buckets.sql
```
**内容：** APK 存储桶配置（照片使用腾讯云 COS）

### 7. 清理维护
```sql
07_cleanup_maintenance.sql
```
**内容：** 过期数据清理、定期维护任务

### 8. 性能索引
```sql
08_performance_indexes.sql
```
**内容：** 所有表的性能优化索引（包含首屏加载优化）

---

## 🔄 与旧版本的对比

### 已合并的文件

**04_booking_system.sql 合并了：**
- ✅ 09_fix_bookings_updated_at.sql - updated_at 字段已包含在表定义中
- ✅ 10_add_in_progress_status.sql - in_progress 状态已包含在状态约束中

**05_analytics.sql 合并了：**
- ✅ 11_update_stats_for_in_progress.sql - 统计函数已包含 in_progress 状态

**08_performance_indexes.sql 合并了：**
- ✅ 13_performance_indexes.sql - 原有的所有索引
- ✅ 14_optimize_first_screen_query.sql - 首屏优化索引

### 移除的文件

- ❌ 12_create_user_profiles.sql - 此表与 profiles 表功能重复，建议根据实际需求决定是否需要

---

## ⚠️ 重要说明

1. **执行前备份：** 在生产环境执行前，请务必备份数据库
2. **顺序执行：** 必须按照上述顺序执行，因为存在依赖关系
3. **错误处理：** 如果某个迁移文件执行失败，请先解决错误再继续
4. **幂等性：** 所有迁移文件都使用了 `IF NOT EXISTS` 等幂等性检查，可以安全地重复执行
5. **定时任务：** 部分迁移文件包含定时任务配置（需要 pg_cron 扩展）

---

## 📊 数据库结构概览

### 核心表
- `profiles` - 用户档案
- `user_active_logs` - 用户活跃日志
- `analytics_daily` - 每日统计快照

### 摆姿系统
- `poses` - 拍照姿势
- `pose_tags` - 摆姿标签

### 相册系统
- `albums` - 相册
- `album_folders` - 相册文件夹
- `album_photos` - 照片
- `user_album_bindings` - 用户相册绑定

### 照片墙
- `photo_views` - 照片浏览记录
- `photo_likes` - 点赞
- `photo_comments` - 评论

### 预约系统
- `booking_types` - 约拍类型
- `allowed_cities` - 允许预约的城市
- `bookings` - 预约信息
- `booking_blackouts` - 档期锁定

### 版本发布
- `app_releases` - 应用版本发布

---

## 🔧 维护建议

1. **定期执行维护任务：**
   ```sql
   SELECT public.run_maintenance_tasks();
   ```

2. **更新每日统计快照：**
   ```sql
   SELECT public.update_daily_analytics_snapshot();
   ```

3. **清理过期预约：**
   ```sql
   SELECT public.auto_complete_expired_bookings();
   ```

---

## 📝 版本历史

- **v2.0** (2026-02-05) - 清洗和合并迁移文件，优化结构
- **v1.0** (2026-02-04) - 初始版本
