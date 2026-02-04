package com.slogan.photo;

import android.os.Bundle;
import android.util.Log;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.slogan.photo.download.DownloadPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private ClipboardBridge clipboardBridge;
    private DownloadBridge downloadBridge;
    private FileDownloader fileDownloader;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        registerPlugin(DownloadPlugin.class);

        // 初始化所有桥接
        clipboardBridge = new ClipboardBridge(this);
        downloadBridge = new DownloadBridge(this);
        fileDownloader = new FileDownloader(this);
        Log.d(TAG, "MainActivity onCreate completed");
    }

    @Override
    public void onStart() {
        super.onStart();

        // 注册所有桥接到WebView
        WebView webView = getBridge().getWebView();
        Log.d(TAG, "WebView instance: " + (webView != null ? "found" : "null"));

        if (webView != null) {
            // 剪切板桥接
            webView.addJavascriptInterface(clipboardBridge, "AndroidClipboard");

            // 下载桥接（主要方案）- 接口名称必须与Web端匹配
            webView.addJavascriptInterface(downloadBridge, "AndroidPhotoDownload");

            // DownloadListener（备用方案）
            webView.setDownloadListener(fileDownloader);

            Log.d(TAG, "All bridges registered successfully");
        } else {
            Log.e(TAG, "WebView is null, cannot register bridges");
        }
    }

    @Override
    public void onResume() {
        super.onResume();

        // 再次设置DownloadListener
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.setDownloadListener(fileDownloader);
            Log.d(TAG, "DownloadListener re-set in onResume");
        }
    }
}

