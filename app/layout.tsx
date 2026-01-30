import type { Metadata } from "next";
import "./globals.css";
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Ma+Shan+Zheng&family=ZCOOL+KuaiLe&display=swap" rel="stylesheet" />
      </head>
      <body className="antialiased" style={{ fontFamily: "'YouYuan', '幼圆', 'Microsoft YaHei', sans-serif" }}>
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
