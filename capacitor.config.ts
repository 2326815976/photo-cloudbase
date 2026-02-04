import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.slogan.photo',
  appName: '拾光谣',
  webDir: 'out',

  // 混合架构：加载远程 Web 应用
  server: {
    // 生产环境：加载 Vercel 部署的应用
    url: 'https://www.guangyao666.xyz',
  },

  // 插件配置
  plugins: {
    // 状态栏配置：保持可见，不全屏
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#ffffff",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',  // 状态栏样式
      backgroundColor: '#000000',  // 状态栏背景色
    },
  },
};

export default config;
