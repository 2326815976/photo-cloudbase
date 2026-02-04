package com.slogan.photo;

import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.text.TextUtils;
import android.util.Log;
import android.webkit.DownloadListener;
import android.webkit.MimeTypeMap;
import android.webkit.URLUtil;
import android.widget.Toast;

import com.slogan.photo.download.DownloadHelper;

public class FileDownloader implements DownloadListener {
    private static final String TAG = "FileDownloader";
    private final Context context;
    private final DownloadHelper downloadHelper;
    private String lastDownloadedUrl;

    public FileDownloader(Context context) {
        this.context = context;
        this.downloadHelper = new DownloadHelper(context);
        Log.d(TAG, "FileDownloader initialized");
    }

    @Override
    public void onDownloadStart(String url, String userAgent, String contentDisposition, String mimetype, long contentLength) {
        Log.d(TAG, "onDownloadStart called! URL: " + url);
        lastDownloadedUrl = url;

        // 从contentDisposition中提取文件名
        final String filename;
        if (!TextUtils.isEmpty(contentDisposition)) {
            filename = guessFileName(url, contentDisposition, mimetype);
        } else {
            filename = null;
        }

        Log.d(TAG, "Starting download with filename: " + filename);

        // 使用内部下载功能
        if (context instanceof MainActivity) {
            ((MainActivity) context).runOnUiThread(() -> {
                downloadHelper.downloadFile(url, filename);
                Toast.makeText(context, "开始下载: " + (filename != null ? filename : "文件"), Toast.LENGTH_SHORT).show();
            });
        }
    }

    public String getLastDownloadedUrl() {
        return lastDownloadedUrl;
    }

    private String guessFileName(String url, String contentDisposition, String mimeType) {
        String filename = URLUtil.guessFileName(url, contentDisposition, mimeType);
        return filename;
    }
}
