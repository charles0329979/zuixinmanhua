import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import './globals.css';
import { BottomNav } from '@/components/BottomNav';

export const metadata: Metadata = {
  title: '漫画聚合 — 多源搜索阅读',
  description: '个人漫画聚合阅读网站，支持多书源搜索、收藏、阅读进度追踪',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen pb-16">
        <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100 dark:bg-gray-950/80 dark:border-gray-800">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="text-xl font-bold text-primary-600 dark:text-primary-400">
              📚 漫画聚合
            </Link>
            <nav className="flex items-center gap-2 text-sm">
              <Link href="/" className="btn-ghost">首页</Link>
              <Link href="/search" className="btn-ghost">搜索</Link>
              <Link href="/favorites" className="btn-ghost">书架</Link>
              <Link href="/history" className="btn-ghost">历史</Link>
              <Link href="/sources" className="btn-ghost">📚 书源仓库</Link>
              <Link href="/settings/sources" className="btn-ghost">🌐 远程书源</Link>
              <Link href="/admin/sources" className="btn-ghost">⚙️ 管理</Link>
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
