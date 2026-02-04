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
import android.os.Handler;
import android.os.Looper;
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
    private DownloadManager downloadManager;
    private BroadcastReceiver downloadReceiver = null;
    private Handler progressHandler = new Handler(Looper.getMainLooper());

    private Runnable progressRunnable = new Runnable() {
        @Override
        public void run() {
            if (downloadId != -1 && downloadManager != null) {
                DownloadManager.Query query = new DownloadManager.Query();
                query.setFilterById(downloadId);
                Cursor cursor = downloadManager.query(query);

                if (cursor != null && cursor.moveToFirst()) {
                    int bytesDownloadedIndex = cursor.getColumnIndex(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR);
                    int bytesTotalIndex = cursor.getColumnIndex(DownloadManager.COLUMN_TOTAL_SIZE_BYTES);

                    if (bytesDownloadedIndex != -1 && bytesTotalIndex != -1) {
                        int bytesDownloaded = cursor.getInt(bytesDownloadedIndex);
                        int bytesTotal = cursor.getInt(bytesTotalIndex);

                        if (bytesTotal > 0) {
                            int progress = (int) ((bytesDownloaded * 100L) / bytesTotal);
                            sendEventToWeb("downloadProgress", "{\"progress\": " + progress + "}");
                        }
                    }
                    cursor.close();
                }

                progressHandler.postDelayed(this, 500);
            }
        }
    };

    public AndroidBridge(MainActivity context, WebView webView) {
        this.context = context;
        this.webView = webView;
        this.downloadManager = (DownloadManager) context.getSystemService(Context.DOWNLOAD_SERVICE);
    }

    @JavascriptInterface
    public void downloadAndInstallApk(String url, String version) {
        context.runOnUiThread(() -> {
            try {
                unregisterDownloadReceiver();

                if (downloadManager == null) {
                    sendEventToWeb("downloadError", "{\"error\":\"DownloadManager不可用\"}");
                    return;
                }

                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
                request.setTitle("拾光谣");
                request.setDescription("正在下载更新 v" + version);
                request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);

                // 直接下载到Downloads目录，避免子目录权限问题
                request.setDestinationInExternalPublicDir(
                    Environment.DIRECTORY_DOWNLOADS,
                    "Slogan_" + version + ".apk"
                );

                // 设置允许的网络类型
                request.setAllowedNetworkTypes(
                    DownloadManager.Request.NETWORK_WIFI |
                    DownloadManager.Request.NETWORK_MOBILE
                );

                request.setAllowedOverRoaming(true);
                request.setMimeType("application/vnd.android.package-archive");

                downloadId = downloadManager.enqueue(request);
                sendEventToWeb("downloadStarted", "{}");

                // 注册下载完成监听器
                downloadReceiver = new BroadcastReceiver() {
                    @Override
                    public void onReceive(Context ctx, Intent intent) {
                        long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                        Log.d(TAG, "下载完成广播接收 - downloadId: " + id + ", 期望: " + downloadId);
                        if (id == downloadId) {
                            Log.d(TAG, "ID匹配，开始安装APK");
                            progressHandler.removeCallbacks(progressRunnable);
                            installApk();
                            unregisterDownloadReceiver();
                        } else {
                            Log.w(TAG, "下载ID不匹配，忽略此广播");
                        }
                    }
                };
                // Android 13+ 需要明确指定 RECEIVER_EXPORTED 或 RECEIVER_NOT_EXPORTED
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(
                        downloadReceiver,
                        new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                        Context.RECEIVER_NOT_EXPORTED
                    );
                } else {
                    context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
                }

                // 启动进度监控
                progressHandler.post(progressRunnable);

            } catch (Exception e) {
                Log.e(TAG, "下载APK失败", e);
                sendEventToWeb("downloadError", "{\"error\":\"" + e.getMessage() + "\"}");
                unregisterDownloadReceiver();
            }
        });
    }

    private void unregisterDownloadReceiver() {
        progressHandler.removeCallbacks(progressRunnable);
        if (downloadReceiver != null) {
            try {
                context.unregisterReceiver(downloadReceiver);
            } catch (IllegalArgumentException e) {
                // Receiver 已经被注销，忽略
            }
            downloadReceiver = null;
        }
    }

    private void installApk() {
        try {
            Log.d(TAG, "开始执行 installApk()");
            DownloadManager.Query query = new DownloadManager.Query();
            query.setFilterById(downloadId);
            Cursor cursor = downloadManager.query(query);

            if (cursor != null && cursor.moveToFirst()) {
                Log.d(TAG, "成功查询到下载记录");
                int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                if (statusIndex == -1) {
                    sendEventToWeb("downloadError", "{\"error\":\"无法获取下载状态\"}");
                    cursor.close();
                    return;
                }

                int status = cursor.getInt(statusIndex);
                Log.d(TAG, "下载状态: " + status + " (成功=" + DownloadManager.STATUS_SUCCESSFUL + ")");

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    cursor.close();

                    // 使用 DownloadManager 的 API 获取 content URI
                    Uri downloadUri = downloadManager.getUriForDownloadedFile(downloadId);
                    Log.d(TAG, "下载文件URI: " + downloadUri);

                    if (downloadUri != null) {
                        // 使用 ACTION_INSTALL_PACKAGE Intent（Android 7.0+）
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                            Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                            intent.setData(downloadUri);
                            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                            Log.d(TAG, "启动安装Intent (ACTION_INSTALL_PACKAGE)");
                            context.startActivity(intent);
                            sendEventToWeb("installStarted", "{}");
                        } else {
                            // Android 6.0 及以下使用 ACTION_VIEW
                            Intent intent = new Intent(Intent.ACTION_VIEW);
                            intent.setDataAndType(downloadUri, "application/vnd.android.package-archive");
                            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                            Log.d(TAG, "启动安装Intent (ACTION_VIEW)");
                            context.startActivity(intent);
                            sendEventToWeb("installStarted", "{}");
                        }
                    } else {
                        Log.e(TAG, "无法获取下载文件URI");
                        sendEventToWeb("installError", "{\"error\":\"无法获取下载文件URI\"}");
                    }
                } else if (status == DownloadManager.STATUS_FAILED) {
                    int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                    int reason = reasonIndex != -1 ? cursor.getInt(reasonIndex) : -1;
                    cursor.close();
                    sendEventToWeb("downloadError", "{\"error\":\"下载失败，错误码: " + reason + "\"}");
                } else {
                    cursor.close();
                    sendEventToWeb("downloadError", "{\"error\":\"下载未完成，状态: " + status + "\"}");
                }
            } else {
                if (cursor != null) cursor.close();
                sendEventToWeb("downloadError", "{\"error\":\"无法查询下载记录\"}");
            }
        } catch (Exception e) {
            Log.e(TAG, "安装APK失败", e);
            sendEventToWeb("installError", "{\"error\":\"" + e.getMessage() + "\"}");
        }
    }

    private void sendEventToWeb(String event, String data) {
        if (webView != null) {
            webView.post(() -> {
                webView.evaluateJavascript(
                    "window.dispatchEvent(new CustomEvent('appUpdate', {detail: {event: '" + event + "', data: " + data + "}}));",
                    null
                );
            });
        }
    }

    public void cleanup() {
        unregisterDownloadReceiver();
    }
}
