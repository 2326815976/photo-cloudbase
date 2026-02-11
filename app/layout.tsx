import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";
import ClientLayout from "@/components/ClientLayout";
import RegisterServiceWorker from "./register-sw";
import FontCacheBootstrap from "./FontCacheBootstrap";
import { env } from "@/lib/env";

export const metadata: Metadata = {
  title: "拾光谣 · 记录此刻的不期而遇",
  description: "A photo management application",
  icons: {
    icon: "/Slogan_108x108.png",
    apple: "/Slogan_512x512.png",
  },
};

// 运行时读取环境变量，避免被静态预渲染固化为构建期值。
export const dynamic = "force-dynamic";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 服务端注入运行时配置（优先读取无前缀变量，兼容 CloudBase）
  const runtimeConfig = {
    NEXT_PUBLIC_APP_URL: env.APP_URL(),
    NEXT_PUBLIC_SUPABASE_URL: env.SUPABASE_URL(),
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY(),
    NEXT_PUBLIC_AMAP_KEY: env.AMAP_KEY(),
    NEXT_PUBLIC_AMAP_SECURITY_CODE: env.AMAP_SECURITY_CODE(),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: env.TURNSTILE_SITE_KEY(),
  };

  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FFC857" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />

        {/* 运行时配置注入 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `window.__RUNTIME_CONFIG__ = ${JSON.stringify(runtimeConfig)};`,
          }}
        />

        {/* 预连接优化 - 减少网络延迟 */}
        <link rel="preconnect" href="https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com" />
        <link rel="dns-prefetch" href="https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com" />

        {/* 字体预加载 - 仅预加载首屏必需字体 */}
        <link rel="preload" href="/fonts/ZQKNNY-Medium-2.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />

        {/* 自托管字体配置 */}
        <style dangerouslySetInnerHTML={{__html: `
          @font-face{font-family:'ZQKNNY';src:local('ZQKNNY-Local'),url('/fonts/ZQKNNY-Medium-2.woff2') format('woff2'),url('/fonts/ZQKNNY-Medium-2.ttf') format('truetype');font-display:swap;font-weight:500;font-style:normal}
          @font-face{font-family:'YouYuan-Fallback';src:local('YouYuan'),local('幼圆'),local('Microsoft YaHei'),local('微软雅黑');font-display:swap}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2') format('woff2');unicode-range:U+0020-007F,U+00A0-00FF;font-display:swap;font-weight:normal}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2') format('woff2');unicode-range:U+4E00-62FF;font-display:swap;font-weight:normal}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2') format('woff2');unicode-range:U+6300-77FF;font-display:swap;font-weight:normal}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2') format('woff2');unicode-range:U+7800-9FFF;font-display:swap;font-weight:normal}
        `}} />
      </head>
      <body className="antialiased" style={{ fontFamily: "'ZQKNNY', 'YouYuan', '幼圆', 'YouYuan-Fallback', 'Microsoft YaHei', sans-serif" }}>
        <FontCacheBootstrap />
        <RegisterServiceWorker />
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
