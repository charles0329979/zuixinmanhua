import Link from 'next/link';
import type { ComicInfo } from '@/types';

interface ComicCardProps {
  comic: ComicInfo & { sourceName?: string };
  showSource?: boolean;
}

const statusLabels: Record<string, string> = {
  ongoing: '连载中',
  completed: '已完结',
  hiatus: '停更中',
};

const sourceColors: Record<string, string> = {
  manwa: 'bg-blue-100 text-blue-700',
  yeman: 'bg-green-100 text-green-700',
  copy: 'bg-purple-100 text-purple-700',
  baozi: 'bg-orange-100 text-orange-700',
  dongmanzhijia: 'bg-pink-100 text-pink-700',
};

export function ComicCard({ comic, showSource = true }: ComicCardProps) {
  const sourceColor = sourceColors[comic.source] || 'bg-gray-100 text-gray-600';

  const handleClick = () => {
    // Cache search result data for detail page fallback (e.g. yeman KIMICMS blocked)
    try {
      const cacheKey = `comic-cache:${comic.source}:${comic.comicId}`;
      sessionStorage.setItem(cacheKey, JSON.stringify(comic));
    } catch {}
  };

  return (
    <Link
      href={`/comic/${comic.source}/${comic.comicId}`}
      onClick={handleClick}
      className="card flex gap-3 p-3 hover:shadow-md transition-shadow cursor-pointer"
    >
      {/* 封面 */}
      <div className="w-20 h-28 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
        {comic.cover ? (
          <img src={comic.cover} alt={comic.title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">📖</div>
        )}
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0 flex flex-col justify-between">
        <div>
          <h3 className="font-semibold text-sm line-clamp-2">{comic.title}</h3>
          <p className="text-xs text-gray-500 mt-1">{comic.author || '未知作者'}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap mt-2">
          {showSource && (
            <span className={`source-badge ${sourceColor}`}>
              {comic.sourceName || comic.source}
            </span>
          )}
          <span className="text-xs text-gray-400">{statusLabels[comic.status] || comic.status}</span>
          {comic.lastChapter && (
            <span className="text-xs text-gray-400 truncate">📄 {comic.lastChapter}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
