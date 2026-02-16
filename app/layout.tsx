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
  const storageDomain = env.CLOUDBASE_STORAGE_DOMAIN();
  const zqknnyWoff2Url = "/fonts/ZQKNNY-Medium-2.woff2";
  const zqknnyTtfUrl = "/fonts/ZQKNNY-Medium-2.ttf";
  const letterWoff2Url = "/fonts/AaZhuNiWoMingMeiXiangChunTian-2.woff2";

  // 服务端注入运行时配置（优先读取无前缀变量，兼容 CloudBase）
  const runtimeConfig = {
    NEXT_PUBLIC_APP_URL: env.APP_URL(),
    NEXT_PUBLIC_CLOUDBASE_STORAGE_DOMAIN: storageDomain,
    NEXT_PUBLIC_TMAP_KEY: env.TMAP_KEY(),
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

        {/* 字体预加载 - 使用同源字体，避免跨域 CORS 问题 */}
        <link rel="preload" href={zqknnyWoff2Url} as="font" type="font/woff2" crossOrigin="anonymous" />

        {/* 腾讯地图 JS API */}
        <script
          src={`https://map.qq.com/api/gljs?v=1.exp&libraries=service&key=${encodeURIComponent(env.TMAP_KEY())}`}
          async
        />

        {/* 自托管字体配置 */}
        <style dangerouslySetInnerHTML={{__html: `
          @font-face{font-family:'ZQKNNY';src:local('ZQKNNY-Local'),url('${zqknnyWoff2Url}') format('woff2'),url('/api/assets/font-file?name=zqknny') format('woff2'),url('${zqknnyTtfUrl}') format('truetype');font-display:swap;font-weight:500;font-style:normal}
          @font-face{font-family:'YouYuan-Fallback';src:local('YouYuan'),local('幼圆'),local('Microsoft YaHei'),local('微软雅黑');font-display:swap}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('${letterWoff2Url}') format('woff2'),url('/api/assets/font-file?name=letter') format('woff2');unicode-range:U+0020-007F,U+00A0-00FF;font-display:swap;font-weight:normal}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('${letterWoff2Url}') format('woff2'),url('/api/assets/font-file?name=letter') format('woff2');unicode-range:U+4E00-62FF;font-display:swap;font-weight:normal}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('${letterWoff2Url}') format('woff2'),url('/api/assets/font-file?name=letter') format('woff2');unicode-range:U+6300-77FF;font-display:swap;font-weight:normal}
          @font-face{font-family:'Letter Font';src:local('Letter Font Local'),url('${letterWoff2Url}') format('woff2'),url('/api/assets/font-file?name=letter') format('woff2');unicode-range:U+7800-9FFF;font-display:swap;font-weight:normal}
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
