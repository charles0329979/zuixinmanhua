'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { ComicCard } from '@/components/ComicCard';
import { useFavorites } from '@/hooks/useFavorites';
import { useHistory } from '@/hooks/useHistory';
import type { ReadingProgress } from '@/types';
import { getAllReadingProgress } from '@/lib/db';

export default function HomePage() {
  const router = useRouter();
  const { favorites } = useFavorites();
  const { history } = useHistory();
  const [recentlyRead, setRecentlyRead] = useState<ReadingProgress[]>([]);

  useEffect(() => {
    getAllReadingProgress().then((data) =>
      setRecentlyRead(data.sort((a, b) => b.lastReadAt - a.lastReadAt).slice(0, 6))
    );
  }, []);

  const handleSearch = (query: string) => {
    router.push(`/search?q=${encodeURIComponent(query)}`);
  };

  return (
    <div className="space-y-8">
      {/* 搜索区 */}
      <section>
        <h1 className="text-2xl font-bold mb-4">📚 漫画聚合</h1>
        <SearchBar onSearch={handleSearch} placeholder="输入漫画名称，搜索所有书源..." />
      </section>

      {/* 收藏书架 */}
      {favorites.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">❤️ 收藏书架</h2>
            <a href="/favorites" className="text-sm text-primary-500 hover:underline">查看全部</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {favorites.slice(0, 3).map((fav) => (
              <ComicCard
                key={fav.id}
                comic={{
                  comicId: fav.comicId,
                  title: fav.title,
                  author: fav.author || '',
                  cover: fav.cover || '',
                  status: 'ongoing',
                  description: '',
                  lastChapter: fav.lastChapter || '',
                  updatedAt: '',
                  source: fav.source,
                }}
              />
            ))}
          </div>
        </section>
      )}

      {/* 最近阅读 */}
      {recentlyRead.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-bold">📖 最近阅读</h2>
            <a href="/history" className="text-sm text-primary-500 hover:underline">查看全部</a>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {recentlyRead.map((rp) => (
              <a
                key={rp.id}
                href={`/read/${rp.source}/${rp.comicId}/${rp.chapterId}`}
                className="card p-3 flex gap-3 hover:shadow-md transition-shadow"
              >
                <div className="w-16 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                  {rp.cover ? (
                    <img src={rp.cover} alt={rp.comicTitle} className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl">📖</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-sm line-clamp-1">{rp.comicTitle}</h3>
                  <p className="text-xs text-gray-500 mt-1">{rp.chapterTitle}</p>
                  {rp.pageIndex > 0 && (
                    <p className="text-xs text-primary-500 mt-1">继续阅读 第{rp.pageIndex + 1}页</p>
                  )}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 最近浏览 */}
      {history.length > 0 && favorites.length === 0 && recentlyRead.length === 0 && (
        <section>
          <h2 className="text-lg font-bold mb-3">🕐 最近浏览</h2>
          <div className="space-y-2">
            {history.slice(0, 5).map((h) => (
              <a
                key={h.id}
                href={h.comicUrl}
                className="card p-3 flex items-center gap-3 hover:shadow-md transition-shadow"
              >
                <span className="text-xl">📖</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium line-clamp-1">{h.title}</p>
                  <p className="text-xs text-gray-500">{h.chapterTitle}</p>
                </div>
                <span className="text-xs text-gray-400">{new Date(h.lastReadAt).toLocaleDateString('zh-CN')}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* 空状态 */}
      {favorites.length === 0 && recentlyRead.length === 0 && history.length === 0 && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">🔍</p>
          <p className="text-gray-500">还没有任何记录，搜索漫画开始阅读吧</p>
        </div>
      )}
    </div>
  );
}
