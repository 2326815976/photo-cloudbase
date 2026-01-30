import type { Metadata } from "next";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

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
        <div className="fixed inset-0 w-full h-[100dvh] bg-gray-100 flex justify-center items-center overflow-hidden">
          <main className="w-full max-w-[430px] h-full bg-[#FFFBF0] relative flex flex-col shadow-[0_0_40px_rgba(93,64,55,0.15)] overflow-hidden">
            {children}
            <BottomNav />
          </main>
        </div>
      </body>
    </html>
  );
}
