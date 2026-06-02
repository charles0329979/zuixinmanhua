import type { Metadata } from 'next';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: '漫画聚合 — 多源搜索阅读',
  description: '个人漫画聚合阅读网站，支持多书源搜索、收藏、阅读进度追踪',
  viewport: 'width=device-width, initial-scale=1',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen pb-16">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100 dark:bg-gray-950/80 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <a href="/" className="text-xl font-bold text-primary-600 dark:text-primary-400">
              📚 漫画聚合
            </a>
            <nav className="flex items-center gap-2 text-sm">
              <a href="/favorites" className="btn-ghost">收藏</a>
              <a href="/history" className="btn-ghost">历史</a>
              <a href="/admin/sources" className="btn-ghost">书源</a>
            </nav>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>
        <BottomNav />
      </body>
    </html>
  );
}
