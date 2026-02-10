import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slogan.photo',
  appName: '拾光谣',
  webDir: 'out',

  // Android优化：远程加载 + Service Worker 缓存策略
  // Service Worker 会缓存字体、图片、静态资源，提升二次加载速度
  server: {
    url: 'https://www.guangyao666.xyz',
    cleartext: true,
  },

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
