import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slogan.photo',
  appName: '拾光谣',
  webDir: 'out',

  // 本地打包架构：使用本地资源，避免页面重载问题
  // 注意：移除 server.url 配置后，Android WebView 将加载本地打包的资源
  // 这样可以避免页面切换时的完整重载，提升性能和用户体验

  // 插件配置
  plugins: {
    // 状态栏配置：保持可见，不全屏
    SplashScreen: {
      launchShowDuration: 0,  // 改为0，由前端控制隐藏时机
      launchAutoHide: false,  // 手动控制隐藏
      backgroundColor: "#FFFBF0",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,  // 启用加载指示器
      spinnerColor: "#FFC857",  // 匹配主题色
    },
    StatusBar: {
      style: 'LIGHT',  // 状态栏样式
      overlaysWebView: false,  // 不覆盖WebView，保留状态栏空间
    },
  },
};

export default config;
