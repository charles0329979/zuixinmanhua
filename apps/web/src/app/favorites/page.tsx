'use client';
import Link from 'next/link';
import { useFavorites } from '@/hooks/useFavorites';
import { useReadingProgress } from '@/hooks/useReadingProgress';

export default function FavoritesPage() {
  const { favorites, loading, toggle } = useFavorites();
  const { allProgress } = useReadingProgress();

  const progressMap = Object.fromEntries(allProgress.map((p) => [`${p.source}:${p.comicId}`, p]));

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">❤️ 收藏书架</h1>

      {favorites.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">📚</p>
          <p className="text-gray-500">还没有收藏，去搜索页面找找漫画吧</p>
          <Link href="/search" className="btn-primary inline-block mt-4">去搜索</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {favorites.map((fav) => {
            const progress = progressMap[fav.id];
            return (
              <div key={fav.id} className="card p-3 space-y-3">
                <Link
                  href={`/comic/${fav.source}/${fav.comicId}`}
                  className="flex gap-3 hover:opacity-80 transition-opacity"
                >
                  <div className="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                    {fav.cover ? (
                      <img src={fav.cover} alt={fav.title} className="w-full h-full object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-2xl">📖</div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm line-clamp-2">{fav.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">{fav.author || ''}</p>
                    <p className="text-xs text-gray-500">{fav.lastChapter || ''}</p>
                  </div>
                </Link>
                <div className="flex gap-2">
                  {progress ? (
                    <Link
                      href={`/read/${fav.source}/${fav.comicId}/${progress.chapterId}`}
                      className="btn-primary text-xs flex-1 text-center"
                    >
                      继续阅读
                    </Link>
                  ) : (
                    <Link
                      href={`/comic/${fav.source}/${fav.comicId}`}
                      className="btn-secondary text-xs flex-1 text-center"
                    >
                      查看详情
                    </Link>
                  )}
                  <button
                    onClick={() => toggle({ comicId: fav.comicId, title: fav.title, source: fav.source, cover: fav.cover })}
                    className="btn-ghost text-xs text-red-500"
                  >
                    取消
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
