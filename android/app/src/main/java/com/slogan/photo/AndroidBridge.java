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
                        if (id == downloadId) {
                            progressHandler.removeCallbacks(progressRunnable);
                            installApk();
                            unregisterDownloadReceiver();
                        }
                    }
                };
                context.registerReceiver(downloadReceiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));

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
            DownloadManager.Query query = new DownloadManager.Query();
            query.setFilterById(downloadId);
            Cursor cursor = downloadManager.query(query);

            if (cursor != null && cursor.moveToFirst()) {
                int statusIndex = cursor.getColumnIndex(DownloadManager.COLUMN_STATUS);
                if (statusIndex == -1) {
                    sendEventToWeb("downloadError", "{\"error\":\"无法获取下载状态\"}");
                    cursor.close();
                    return;
                }

                int status = cursor.getInt(statusIndex);

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    int fileUriIndex = cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI);
                    if (fileUriIndex != -1) {
                        String fileUriString = cursor.getString(fileUriIndex);

                        if (fileUriString != null) {
                            Uri fileUri = Uri.parse(fileUriString);
                            File apkFile = new File(Uri.decode(fileUri.getPath()));

                            if (apkFile.exists()) {
                                Intent intent = new Intent(Intent.ACTION_VIEW);
                                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                                    Uri apkUri = FileProvider.getUriForFile(
                                        context,
                                        context.getPackageName() + ".fileprovider",
                                        apkFile
                                    );
                                    intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                } else {
                                    intent.setDataAndType(Uri.fromFile(apkFile), "application/vnd.android.package-archive");
                                }

                                context.startActivity(intent);
                                sendEventToWeb("installStarted", "{}");
                            } else {
                                sendEventToWeb("installError", "{\"error\":\"APK文件不存在\"}");
                            }
                        } else {
                            sendEventToWeb("installError", "{\"error\":\"无法获取文件路径\"}");
                        }
                    } else {
                        sendEventToWeb("installError", "{\"error\":\"无法获取文件URI索引\"}");
                    }
                } else if (status == DownloadManager.STATUS_FAILED) {
                    int reasonIndex = cursor.getColumnIndex(DownloadManager.COLUMN_REASON);
                    int reason = reasonIndex != -1 ? cursor.getInt(reasonIndex) : -1;
                    sendEventToWeb("downloadError", "{\"error\":\"下载失败，错误码: " + reason + "\"}");
                } else {
                    sendEventToWeb("downloadError", "{\"error\":\"下载未完成，状态: " + status + "\"}");
                }
                cursor.close();
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
