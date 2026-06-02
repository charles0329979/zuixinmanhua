'use client';
import { useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SearchBar } from '@/components/SearchBar';
import { ComicCard } from '@/components/ComicCard';
import { useSearch } from '@/hooks/useSearch';

function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';
  const { query, results, loading, error, search } = useSearch();

  useEffect(() => {
    if (q) search(q);
  }, [q, search]);

  return (
    <div className="space-y-6">
      <SearchBar onSearch={search} loading={loading} initialValue={q} />
      {error && <p className="text-red-500 text-sm">❌ {error}</p>}

      {results.map((source) => (
        <section key={source.source}>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold">{source.sourceName}</h2>
            {source.error ? (
              <span className="text-xs text-red-500">({source.error})</span>
            ) : (
              <span className="text-xs text-gray-400">({source.results.length} 条)</span>
            )}
          </div>
          {source.results.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {source.results.map((comic, i) => (
                <ComicCard key={`${comic.comicId}-${i}`} comic={comic} showSource={false} />
              ))}
            </div>
          ) : (
            !source.error && <p className="text-sm text-gray-400">未找到结果</p>
          )}
        </section>
      ))}

      {!loading && results.length === 0 && query && !error && (
        <div className="text-center py-16">
          <p className="text-4xl mb-4">😞</p>
          <p className="text-gray-500">未找到相关漫画 "{query}"</p>
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="text-center py-16 text-gray-400">加载中...</div>}>
      <SearchContent />
    </Suspense>
  );
}
