package com.slogan.photo;

import android.webkit.JavascriptInterface;
import android.widget.Toast;
import com.slogan.photo.download.DownloadHelper;

public class DownloadBridge {
    private final MainActivity context;
    private final DownloadHelper downloadHelper;

    public DownloadBridge(MainActivity context) {
        this.context = context;
        this.downloadHelper = new DownloadHelper(context);
    }

    @JavascriptInterface
    public void downloadPhoto(String url, String filename) {
        context.runOnUiThread(() -> {
            downloadHelper.downloadFile(url, filename);
            Toast.makeText(context, "开始下载: " + (filename != null ? filename : "文件"), Toast.LENGTH_SHORT).show();
        });
    }

    @JavascriptInterface
    public void downloadPhoto(String url) {
        downloadPhoto(url, null);
    }
}
