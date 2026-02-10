import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slogan.photo',
  appName: '拾光谣',
  webDir: 'out',

  // Android优化：使用本地打包架构，避免远程加载导致的页面完整重载
  // 本地资源加载可以实现真正的SPA客户端路由，页面切换秒进
  // server: {
  //   url: 'https://www.guangyao666.xyz',
  //   cleartext: true,
  // },

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
