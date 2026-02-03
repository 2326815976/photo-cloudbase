import type { Metadata } from "next";
import "./globals.css";
import "./responsive.css";
import ClientLayout from "@/components/ClientLayout";

export const metadata: Metadata = {
  title: "拾光谣 · 记录此刻的不期而遇",
  description: "A photo management application",
  icons: {
    icon: "/Slogan_108x108.png",
    apple: "/Slogan_512x512.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FFC857" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* 预连接优化 - 减少网络延迟 */}
        <link rel="preconnect" href="https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com" />
        <link rel="dns-prefetch" href="https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet" />
        <style dangerouslySetInnerHTML={{__html: `
          @font-face {
            font-family: 'YouYuan-Fallback';
            src: local('YouYuan'), local('幼圆'), local('Microsoft YaHei'), local('微软雅黑');
            font-display: swap;
          }
        `}} />
      </head>
      <body className="antialiased" style={{ fontFamily: "'YouYuan', '幼圆', 'YouYuan-Fallback', 'Microsoft YaHei', sans-serif" }}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
