'use client';
import Link from 'next/link';
import { useHistory } from '@/hooks/useHistory';

export default function HistoryPage() {
  const { history, loading, remove, clear } = useHistory();

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🕐 浏览历史</h1>
        {history.length > 0 && (
          <button
            onClick={() => { if (confirm('确认清空全部历史？')) clear(); }}
            className="btn-ghost text-sm text-red-500"
          >
            清空全部
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">🕐</p>
          <p className="text-gray-500">还没有浏览记录</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* 按日期分组 */}
          {(() => {
            const groups: Record<string, typeof history> = {};
            history.forEach((h) => {
              const date = new Date(h.lastReadAt).toLocaleDateString('zh-CN');
              if (!groups[date]) groups[date] = [];
              groups[date].push(h);
            });
            return Object.entries(groups).map(([date, items]) => (
              <section key={date}>
                <h3 className="text-sm text-gray-500 mb-2">{date}</h3>
                <div className="space-y-2">
                  {items.map((h) => (
                    <div key={h.id} className="card p-3 flex items-center gap-3">
                      <div className="w-12 h-16 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800">
                        {h.cover ? (
                          <img src={h.cover} alt={h.title} className="w-full h-full object-cover" loading="lazy" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">📖</div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Link href={h.comicUrl} className="font-medium text-sm hover:text-primary-500 line-clamp-1">
                          {h.title}
                        </Link>
                        <p className="text-xs text-gray-500">{h.chapterTitle}</p>
                        <p className="text-xs text-primary-500 mt-0.5">
                          继续阅读 第{h.pageIndex + 1}页
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={h.chapterUrl}
                          className="btn-primary text-xs py-1 px-3"
                        >
                          继续
                        </Link>
                        <button
                          onClick={() => remove(h.id)}
                          className="btn-ghost text-xs text-red-500"
                        >
                          删除
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
