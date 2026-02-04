import type { Metadata } from "next";
import { Ma_Shan_Zheng, ZCOOL_KuaiLe } from "next/font/google";
import "./globals.css";
import "./responsive.css";
import ClientLayout from "@/components/ClientLayout";

// 优化手写体字体加载 - 自托管，消除外部请求
const maShanZheng = Ma_Shan_Zheng({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-ma-shan-zheng",
});

const zcoolKuaiLe = ZCOOL_KuaiLe({
  weight: "400",
  subsets: ["latin"],
  display: "swap",
  variable: "--font-zcool-kuaile",
});

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
    <html lang="zh-CN" className={`${maShanZheng.variable} ${zcoolKuaiLe.variable}`}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no, viewport-fit=cover" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#FFC857" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        {/* 预连接优化 - 减少网络延迟 */}
        <link rel="preconnect" href="https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com" />
        <link rel="dns-prefetch" href="https://slogan-1386452208.cos.ap-guangzhou.myqcloud.com" />
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
