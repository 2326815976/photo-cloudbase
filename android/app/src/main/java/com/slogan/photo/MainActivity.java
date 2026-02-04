package com.slogan.photo;

import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
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

        // 配置 WebView 以支持 Turnstile
        configureWebViewForTurnstile();

        Log.d(TAG, "MainActivity onCreate completed");
    }

    private void configureWebViewForTurnstile() {
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            WebSettings settings = webView.getSettings();

            // 启用第三方 Cookie（Turnstile 必需）
            CookieManager cookieManager = CookieManager.getInstance();
            cookieManager.setAcceptCookie(true);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                cookieManager.setAcceptThirdPartyCookies(webView, true);
                Log.d(TAG, "Third-party cookies enabled");
            }

            // 启用 DOM Storage（Turnstile 必需）
            settings.setDomStorageEnabled(true);
            settings.setDatabaseEnabled(true);
            Log.d(TAG, "DOM Storage enabled");

            // 设置缓存模式
            settings.setCacheMode(WebSettings.LOAD_DEFAULT);

            // 启用混合内容模式（允许 HTTPS 页面加载 Cloudflare 资源）
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
                Log.d(TAG, "Mixed content mode enabled");
            }

            // 确保 JavaScript 完全启用
            settings.setJavaScriptEnabled(true);
            settings.setJavaScriptCanOpenWindowsAutomatically(true);

            // 启用文件访问
            settings.setAllowFileAccess(true);
            settings.setAllowContentAccess(true);

            // 启用硬件加速（提升 Turnstile 性能）
            webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
            Log.d(TAG, "Hardware acceleration enabled");

            // 设置 User-Agent（避免被识别为受限 WebView）
            String userAgent = settings.getUserAgentString();
            if (!userAgent.contains("Chrome")) {
                settings.setUserAgentString(userAgent + " Chrome/120.0.0.0");
                Log.d(TAG, "User-Agent modified: " + settings.getUserAgentString());
            }

            // 视口和缩放设置
            settings.setUseWideViewPort(true);
            settings.setLoadWithOverviewMode(true);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);

            // 媒体播放设置（Turnstile 可能需要）
            settings.setMediaPlaybackRequiresUserGesture(false);

            // 关键：设置超时时间（增加网络请求超时）
            settings.setDefaultTextEncodingName("utf-8");

            // 打印所有关键配置状态
            Log.d(TAG, "=== WebView Configuration Summary ===");
            Log.d(TAG, "JavaScript enabled: " + settings.getJavaScriptEnabled());
            Log.d(TAG, "DOM Storage enabled: " + settings.getDomStorageEnabled());
            Log.d(TAG, "Database enabled: " + settings.getDatabaseEnabled());
            Log.d(TAG, "Third-party cookies: " + cookieManager.acceptThirdPartyCookies(webView));
            Log.d(TAG, "Cache mode: " + settings.getCacheMode());
            Log.d(TAG, "User-Agent: " + settings.getUserAgentString());
            Log.d(TAG, "=====================================");

            Log.d(TAG, "WebView configured for Turnstile support with hardware acceleration");
        } else {
            Log.w(TAG, "WebView is null, cannot configure");
        }
    }

    @Override
    public void onStart() {
        super.onStart();

        // 等待 Capacitor Bridge 完全初始化后再配置 WebView
        WebView webView = getBridge().getWebView();
        Log.d(TAG, "WebView instance: " + (webView != null ? "found" : "null"));

        if (webView != null) {
            // 强制重新配置 WebView（确保覆盖 Capacitor 的默认配置）
            configureWebViewForTurnstile();

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

            // 动态注入版本号到URL
            injectVersionToUrl();

            Log.d(TAG, "All bridges registered and WebView configured for Turnstile");
        } else {
            Log.e(TAG, "WebView is null, cannot register bridges");
        }
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

            // 强制重新配置 WebView（确保配置在所有生命周期中都生效）
            configureWebViewForTurnstile();

            Log.d(TAG, "DownloadListener re-set and WebView reconfigured in onResume");
        }
    }
}

