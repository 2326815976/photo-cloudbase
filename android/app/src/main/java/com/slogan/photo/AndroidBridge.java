package com.slogan.photo;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.content.FileProvider;
import java.io.File;

public class AndroidBridge {
    private static final String TAG = "AndroidBridge";
    private final MainActivity context;
    private final WebView webView;
    private long downloadId = -1;
    private BroadcastReceiver downloadReceiver = null;

    public AndroidBridge(MainActivity context, WebView webView) {
        this.context = context;
        this.webView = webView;
    }

    @JavascriptInterface
    public void downloadAndInstallApk(String url, String version) {
        context.runOnUiThread(() -> {
            try {
                // 取消注册之前的 receiver（如果存在）
                unregisterDownloadReceiver();

                DownloadManager downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
                if (downloadManager == null) {
                    sendEventToWeb("downloadError", "{\"error\":\"DownloadManager不可用\"}");
                    return;
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                String filename = "拾光谣/app-" + version + ".apk";

                request.setTitle("拾光谣更新");
                request.setDescription("正在下载版本 " + version);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, filename);
                request.setAllowedOverMetered(true);
                request.setAllowedOverRoaming(true);

                downloadId = downloadManager.enqueue(request);
                sendEventToWeb("downloadStarted", "{}");

                // 注册新的下载完成监听器
                downloadReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context ctx, Intent intent) {
                        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        if (id == downloadId) {
                            installApk(downloadManager, id);
                            unregisterDownloadReceiver();
                        }
                    }
                };
                context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));

            } catch (Exception e) {
                Log.e(TAG, "下载APK失败", e);
                sendEventToWeb("downloadError", "{\"error\":\"" + e.getMessage() + "\"}");
                unregisterDownloadReceiver();
            }
        });
    }

    private void unregisterDownloadReceiver() {
        if (downloadReceiver != null) {
            try {
                context.unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException e) {
                // Receiver 已经被注销，忽略
            }
            downloadReceiver = null;
        }
    }

    private void installApk(DownloadManager downloadManager, long downloadId) {
        DownloadManager.Query query = new DownloadManager.Query();
        query.setFilterById(downloadId);
        Cursor cursor = null;

        try {
            cursor = downloadManager.query(query);
            if (cursor == null || !cursor.moveToFirst()) {
                sendEventToWeb("downloadError", "{\"error\":\"无法查询下载状态\"}");
                return;
            }

            int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
            if (statusIndex == -1) {
                sendEventToWeb("downloadError", "{\"error\":\"无法获取下载状态\"}");
                return;
            }

            int status = cursor.getInt(statusIndex);
            if (status == DownloadManager.STATUS_SUCCESSFUL) {
                // 使用 DownloadManager 的 getUriForDownloadedFile 方法（Android 7.0+）
                Uri downloadUri = downloadManager.getUriForDownloadedFile(downloadId);
                if (downloadUri != null) {
                    installApkFromUri(downloadUri);
                } else {
                    // 降级方案：从 COLUMN_LOCAL_URI 获取
                    int uriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                    if (uriIndex != -1) {
                        String uriString = cursor.getString(uriIndex);
                        if (uriString != null) {
                            installApkFromPath(uriString);
                        } else {
                            sendEventToWeb("downloadError", "{\"error\":\"无法获取下载文件路径\"}");
                        }
                    } else {
                        sendEventToWeb("downloadError", "{\"error\":\"无法获取下载文件URI\"}");
                    }
                }
            } else if (status == DownloadManager.STATUS_FAILED) {
                int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                int reason = reasonIndex != -1 ? cursor.getInt(reasonIndex) : -1;
                sendEventToWeb("downloadError", "{\"error\":\"下载失败，错误码: " + reason + "\"}");
            } else {
                sendEventToWeb("downloadError", "{\"error\":\"下载未完成，状态: " + status + "\"}");
            }
        } catch (Exception e) {
            Log.e(TAG, "安装APK失败", e);
            sendEventToWeb("installError", "{\"error\":\"" + e.getMessage() + "\"}");
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
    }

    private void installApkFromUri(Uri downloadUri) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(downloadUri, "application/vnd.android.package-archive");
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);

            sendEventToWeb("installStarted", "{}");
            context.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "从URI安装失败", e);
            sendEventToWeb("installError", "{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private void installApkFromPath(String uriString) {
        try {
            Uri uri = Uri.parse(uriString);
            File apkFile = new File(uri.getPath());

            if (!apkFile.exists()) {
                sendEventToWeb("installError", "{\"error\":\"APK文件不存在\"}");
                return;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW);
            Uri apkUri;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                apkUri = FileProvider.getUriForFile(context, context.getPackageName() + ".fileprovider", apkFile);
                intent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } else {
                apkUri = Uri.fromFile(apkFile);
            }

            intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

            sendEventToWeb("installStarted", "{}");
            context.startActivity(intent);
        } catch (Exception e) {
            Log.e(TAG, "从路径安装失败", e);
            sendEventToWeb("installError", "{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private void sendEventToWeb(String event, String data) {
        context.runOnUiThread(() -> {
            String js = String.format(
                "window.dispatchEvent(new CustomEvent('appUpdate', {detail: {event: '%s', data: %s}}));",
                event, data
            );
            webView.evaluateJavascript(js, null);
        });
    }

    public void cleanup() {
        unregisterDownloadReceiver();
    }
}
