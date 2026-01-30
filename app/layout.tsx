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
      <body className="antialiased bg-background text-foreground">
        <main className="min-h-screen pb-28">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
