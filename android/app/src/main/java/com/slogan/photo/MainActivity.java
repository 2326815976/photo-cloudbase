package com.slogan.photo;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import androidx.activity.EdgeToEdge;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.graphics.Insets;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Bridge;
import com.slogan.photo.download.DownloadPlugin;

public class MainActivity extends BridgeActivity {
    private static final String TAG = "MainActivity";
    private ClipboardBridge clipboardBridge;
    private DownloadBridge downloadBridge;
    private FileDownloader fileDownloader;
    private AndroidBridge androidBridge;
    private boolean versionInjected = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 启用edge-to-edge模式（必须在setContentView之前）
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            EdgeToEdge.enable(this);
        }

        registerPlugin(DownloadPlugin.class);

        // 初始化所有桥接
        clipboardBridge = new ClipboardBridge(this);
        downloadBridge = new DownloadBridge(this);
        fileDownloader = new FileDownloader(this);

        // 设置WindowInsets监听器（在onCreate中设置）
        ViewGroup content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
                Insets systemBars = insets.getInsets(WindowInsetsCompat.Type.systemBars());
                // 设置topPadding为systemBars.top，保留状态栏空间
                v.setPadding(systemBars.left, systemBars.top, systemBars.right, systemBars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
        }

        Log.d(TAG, "MainActivity onCreate completed");
    }

    @Override
    public void onStart() {
        super.onStart();

        // 注册所有桥接到WebView
        WebView webView = getBridge().getWebView();
        Log.d(TAG, "WebView instance: " + (webView != null ? "found" : "null"));

        if (webView != null) {
            // 配置WebView性能优化
            configureWebView(webView);

            // 初始化AndroidBridge
            androidBridge = new AndroidBridge(this, webView);

            // 剪切板桥接
            webView.addJavascriptInterface(clipboardBridge, "AndroidClipboard");

            // 下载桥接（主要方案）- 接口名称必须与Web端匹配
            webView.addJavascriptInterface(downloadBridge, "AndroidPhotoDownload");

            // 版本更新桥接
            webView.addJavascriptInterface(androidBridge, "AndroidBridge");

            // DownloadListener（备用方案）
            webView.setDownloadListener(fileDownloader);

            // 只在首次启动时注入版本号，避免重复加载
            if (!versionInjected) {
                injectVersionToUrl();
                versionInjected = true;
            }

            Log.d(TAG, "All bridges registered successfully");
        } else {
            Log.e(TAG, "WebView is null, cannot register bridges");
        }
    }

    private void configureWebView(WebView webView) {
        android.webkit.WebSettings settings = webView.getSettings();

        // 启用缓存
        settings.setCacheMode(android.webkit.WebSettings.LOAD_DEFAULT);
        settings.setAppCacheEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // 启用硬件加速
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
        }

        Log.d(TAG, "WebView performance optimization applied");
    }

    private void injectVersionToUrl() {
        try {
            PackageInfo packageInfo = getPackageManager().getPackageInfo(getPackageName(), 0);
            String versionName = packageInfo.versionName;

            WebView webView = getBridge().getWebView();
            if (webView != null) {
                String currentUrl = webView.getUrl();
                if (currentUrl != null && !currentUrl.contains("app_version=")) {
                    String separator = currentUrl.contains("?") ? "&" : "?";
                    String newUrl = currentUrl + separator + "app_version=" + versionName + "&platform=Android";
                    webView.loadUrl(newUrl);
                    Log.d(TAG, "Injected version to URL: " + newUrl);
                }
            }
        } catch (PackageManager.NameNotFoundException e) {
            Log.e(TAG, "Failed to get version name", e);
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

