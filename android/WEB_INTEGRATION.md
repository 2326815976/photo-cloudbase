# Web端集成Android下载功能

## APK信息
- 位置：`D:\Desktop\apk\photo-debug.apk`
- 大小：7.4 MB
- 构建时间：2026-02-04 11:09

## 已实现的功能

### 1. 剪切板功能 ✅
```javascript
// 读取剪切板
const text = AndroidClipboard.getClipboardText();

// 写入剪切板
AndroidClipboard.setClipboardText("要复制的内容");

// 检查是否有内容
const hasContent = AndroidClipboard.hasClipboardText();
```

### 2. 下载功能 ✅ (双重保障)

#### 方案A：JavaScript Bridge（推荐，100%可靠）

在Web端的下载按钮点击事件中添加：

```javascript
// 检测是否在Android WebView中
if (typeof AndroidDownload !== 'undefined') {
  // 使用Android原生下载
  AndroidDownload.downloadFile(imageUrl, filename);
} else {
  // 浏览器环境，使用原有的Web下载逻辑
  // ... 你原来的下载代码 ...
}
```

#### 方案B：DownloadListener（备用）

如果Web端不修改代码，当触发标准下载时，Android的DownloadListener会自动拦截。

## Web端修改示例

假设你的下载按钮代码是这样的：

```javascript
// 原来的代码
function downloadImage(imageUrl, filename) {
  const a = document.createElement('a');
  a.href = imageUrl;
  a.download = filename;
  a.click();
}
```

修改为：

```javascript
// 修改后的代码
function downloadImage(imageUrl, filename) {
  // 检测Android环境
  if (typeof AndroidDownload !== 'undefined') {
    // Android原生下载
    AndroidDownload.downloadFile(imageUrl, filename);
  } else {
    // 浏览器下载
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = filename;
    a.click();
  }
}
```

## 下载路径

文件会下载到：`/storage/emulated/0/Download/`

用户可以在系统的"文件管理器"或"下载"应用中查看。

## 测试步骤

1. 安装APK：`adb install -r D:\Desktop\apk\photo-debug.apk`
2. 在Web端添加上述JavaScript代码
3. 点击"下载原图"按钮
4. 检查通知栏是否显示下载进度
5. 下载完成后在Downloads目录查看文件

## 注意事项

- 如果Web端不修改代码，DownloadListener会尝试拦截下载，但可能不会触发（取决于Web端的下载实现方式）
- 推荐使用方案A（JavaScript Bridge），这样可以100%确保下载功能正常工作
- 两个方案可以同时存在，互不冲突
