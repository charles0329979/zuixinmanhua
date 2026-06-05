'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getComicDetail, getChapters } from '@/lib/api';
import { useFavorites } from '@/hooks/useFavorites';
import { useReadingProgress } from '@/hooks/useReadingProgress';
import type { ComicInfo, ChapterInfo } from '@/types';

export default function ComicDetailPage() {
  const params = useParams<{ source: string; comicId: string }>();
  const router = useRouter();
  const { toggle, checkFavorite } = useFavorites();
  const { progress } = useReadingProgress(params.source, params.comicId);

  const [comic, setComic] = useState<ComicInfo | null>(null);
  const [chapters, setChapters] = useState<ChapterInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFav, setIsFav] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [detail, chs, fav] = await Promise.all([
          getComicDetail(params.source, params.comicId),
          getChapters(params.source, params.comicId),
          checkFavorite(params.source, params.comicId),
        ]);
        setComic(detail);
        setChapters(chs || []);
        setIsFav(fav);
      } catch (e: any) {
        setError(e.message || '加载失败');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [params.source, params.comicId, checkFavorite]);

  const handleFavorite = async () => {
    if (!comic) return;
    const result = await toggle({
      comicId: comic.comicId,
      title: comic.title,
      author: comic.author,
      cover: comic.cover,
      source: comic.source,
      lastChapter: comic.lastChapter,
    });
    setIsFav(result);
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;
  if (error) {
    const showYemanLink = params.source === 'yeman';
    return (
      <div className="text-center py-16 space-y-4">
        <p className="text-red-500">❌ {error}</p>
        {showYemanLink && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">野蛮漫画使用 KIMICMS 反爬保护，服务端无法直接访问。搜索功能正常，但详情/章节/图片需要在浏览器中直连访问。</p>
            <a
              href={`https://www.yemancomic.com/book/${params.comicId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block btn-primary text-sm px-4 py-2"
            >
              🔗 在野蛮漫画网站阅读
            </a>
          </div>
        )}
      </div>
    );
  }
  if (!comic) return <div className="text-center py-16 text-gray-400">未找到漫画</div>;

  return (
    <div className="space-y-6">
      {/* 详情头部 */}
      <div className="card p-4">
        <div className="flex gap-4">
          <div className="w-28 h-40 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
            {comic.cover ? (
              <img src={comic.cover} alt={comic.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-3xl">📖</div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold">{comic.title}</h1>
            <p className="text-sm text-gray-500 mt-1">作者: {comic.author || '未知'}</p>
            <p className="text-sm text-gray-500">来源: {comic.source}</p>
            {comic.status && (
              <p className="text-sm text-gray-500">
                状态: {{ ongoing: '连载中', completed: '已完结', hiatus: '停更中' }[comic.status]}
              </p>
            )}
            {comic.updatedAt && <p className="text-sm text-gray-500">更新: {comic.updatedAt}</p>}
            <div className="flex gap-2 mt-3">
              {progress && (
                <button
                  onClick={() =>
                    router.push(`/read/${params.source}/${params.comicId}/${progress.chapterId}`)
                  }
                  className="btn-primary text-sm"
                >
                  继续阅读 第{progress.pageIndex + 1}页
                </button>
              )}
              <button onClick={handleFavorite} className="btn-secondary text-sm">
                {isFav ? '❤️ 已收藏' : '🤍 收藏'}
              </button>
            </div>
          </div>
        </div>
        {comic.description && (
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-4 line-clamp-3">{comic.description}</p>
        )}
      </div>

      {/* 章节列表 */}
      <section>
        <h2 className="text-lg font-bold mb-3">📋 章节列表 ({chapters.length} 章)</h2>
        <div className="card divide-y divide-gray-100 dark:divide-gray-800 max-h-[600px] overflow-y-auto">
          {chapters.map((ch) => (
            <button
              key={ch.chapterId}
              onClick={() => router.push(`/read/${params.source}/${params.comicId}/${ch.chapterId}`)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <span className="text-sm">{ch.title}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
