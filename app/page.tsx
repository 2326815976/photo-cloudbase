"use client";

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="max-w-2xl text-center">
        <h1 className="text-4xl font-bold mb-4">欢迎使用 Photo App</h1>
        <p className="text-lg text-foreground/80 mb-8">
          这是一个基于 Next.js 15 和 Supabase 的照片管理应用
        </p>
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-xl font-semibold mb-2">技术栈</h2>
          <ul className="text-left space-y-2">
            <li>✓ Next.js 15.4.10</li>
            <li>✓ React 19</li>
            <li>✓ TypeScript</li>
            <li>✓ Tailwind CSS 4.1.9</li>
            <li>✓ Supabase</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
