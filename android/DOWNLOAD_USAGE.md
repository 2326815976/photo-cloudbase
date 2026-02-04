# Android 下载功能使用说明

## 功能概述

已为 Android APK 端添加以下功能适配：

### 1. ✅ 定位权限
- `ACCESS_COARSE_LOCATION` - 粗略定位
- `ACCESS_FINE_LOCATION` - 精确定位
- **用途：** 支持约拍定位功能

### 2. ✅ 剪切板权限
- Android 系统自带支持，无需额外配置
- **用途：** 支持返图模块的粘贴功能

### 3. ✅ 下载功能
- `WRITE_EXTERNAL_STORAGE` 权限（Android 9 及以下）
- 下载到系统 Downloads 目录
- **用途：** 支持返图空间的下载原图功能

## Web 端调用方式

### 方式一：使用 Capacitor 插件（推荐）

在 Web 端代码中调用下载功能：

```typescript
import { Plugins } from '@capacitor/core';
const { Download } = Plugins;

// 下载文件
async function downloadFile(url: string, filename?: string) {
  try {
    const result = await Download.download({
      url: url,
      filename: filename // 可选，不传则自动从 URL 推断
    });

    console.log('下载已开始', result);
    // result.downloadId - 下载任务ID
    // result.message - 提示信息
  } catch (error) {
    console.error('下载失败', error);
  }
}

// 使用示例
downloadFile('https://example.com/photo.jpg', 'my-photo.jpg');
```

### 方式二：使用 HTML5 download 属性

对于简单的下载需求，可以直接使用 HTML5 的 download 属性：

```html
<a href="https://example.com/photo.jpg" download="photo.jpg">
  下载原图
</a>
```

或通过 JavaScript 触发：

```javascript
function downloadFile(url, filename) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
```

## 下载路径

- **Android 10+：** `/storage/emulated/0/Download/`
- **Android 9-：** `/storage/emulated/0/Download/`
- 用户可在系统的"文件管理器"或"下载"应用中查看下载的文件

## 权限处理

### 运行时权限请求

Android 6.0+ 需要在运行时请求权限。Capacitor 会自动处理权限请求，但你也可以手动检查：

```typescript
import { Plugins } from '@capacitor/core';
const { Permissions } = Plugins;

// 检查存储权限
async function checkStoragePermission() {
  const result = await Permissions.query({ name: 'storage' });
  if (result.state !== 'granted') {
    const requestResult = await Permissions.request({ name: 'storage' });
    return requestResult.state === 'granted';
  }
  return true;
}
```

## 文件结构

```
android/app/src/main/java/com/slogan/photo/
├── MainActivity.java                    # 主活动，注册下载插件
└── download/
    ├── DownloadHelper.java             # 下载辅助类
    └── DownloadPlugin.java             # Capacitor 下载插件
```

## 注意事项

1. **网络权限：** 已配置 `INTERNET` 权限，支持网络下载
2. **HTTPS：** 建议使用 HTTPS 链接，HTTP 可能被系统阻止
3. **文件名：** 如果不指定文件名，系统会自动从 URL 推断
4. **重复文件：** 如果文件已存在，系统会自动添加序号（如 photo(1).jpg）
5. **下载通知：** 下载过程中会在通知栏显示进度，完成后可点击打开

## 测试建议

1. 测试不同文件类型的下载（图片、PDF、视频等）
2. 测试长文件名和特殊字符
3. 测试网络异常情况
4. 测试权限被拒绝的情况
5. 在不同 Android 版本上测试（特别是 Android 10 前后）

## 故障排查

### 下载失败
- 检查网络连接
- 确认 URL 是否有效
- 检查存储空间是否充足
- 查看 Logcat 日志：`adb logcat | grep Download`

### 权限问题
- 确认 AndroidManifest.xml 中已添加权限
- 检查应用设置中的存储权限是否已授予
- Android 11+ 可能需要额外的存储权限配置

## 后续优化建议

如需更高级的下载功能，可以考虑：
1. 添加下载进度回调
2. 支持暂停/恢复下载
3. 支持后台下载
4. 添加下载队列管理
5. 支持自定义下载目录
