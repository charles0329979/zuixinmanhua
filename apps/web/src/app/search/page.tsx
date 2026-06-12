'use client';
import { useEffect, useState, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { SearchBar } from '@/components/SearchBar';
import { ComicCard } from '@/components/ComicCard';

// ---- 类型 ----
interface SearchDiagnostics {
  reason: string;
  hint: string;
  suggestedAction: string;
  debugUrl: string;
  mode: string;
  verifiedCount: number;
  attemptedSources: Array<{ id: string; name: string; host: string }>;
  errors: Array<{ sourceId: string; sourceName: string; reason: string; scope: string }>;
}

interface SearchApiResponse {
  ok: boolean;
  keyword: string;
  dryRun: boolean;
  sourceCount: number;
  successSourceCount: number;
  failedSourceCount: number;
  durationMs: number;
  results: SearchResultItem[];
  errors: SearchErrorItem[];
  sources?: Array<Record<string, unknown>>;
  diagnostics?: SearchDiagnostics;
}

interface SearchResultItem {
  id: string;
  sourceId: string;
  sourceName: string;
  title: string;
  cover?: string;
  author?: string;
  latestChapter?: string;
  status?: string;
  detailUrl: string;
  updateTime?: string;
}

interface SearchErrorItem {
  sourceId: string;
  sourceName: string;
  reason: string;
  scope?: string;
}

// ---- 主组件 ----
function SearchContent() {
  const searchParams = useSearchParams();
  const q = searchParams.get('q') || '';

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [errors, setErrors] = useState<SearchErrorItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<SearchDiagnostics | null>(null);
  const [stats, setStats] = useState<{
    sourceCount: number;
    successSourceCount: number;
    failedSourceCount: number;
    durationMs: number;
  } | null>(null);

  // 本地源开关
  const [localEnabled, setLocalEnabled] = useState(false);
  const [localResults, setLocalResults] = useState<
    Array<{ source: string; sourceName: string; results: Array<Record<string, unknown>>; error?: string }>
  >([]);
  const [localLoading, setLocalLoading] = useState(false);
  const [localError, setLocalError] = useState('');

  const [tab, setTab] = useState<'unified' | 'local'>('unified');

  // ---- 统一搜索 ----
  const doSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setResults([]);
      setStats(null);
      setErrors([]);
      setDiagnostics(null);
      return;
    }
    setLoading(true);
    setError('');
    setErrors([]);
    setDiagnostics(null);
    try {
      const resp = await fetch(`/api/search?keyword=${encodeURIComponent(keyword)}`);
      const data: SearchApiResponse = await resp.json();
      setResults(data.results || []);
      setErrors(data.errors || []);
      setDiagnostics(data.diagnostics || null);
      setStats({
        sourceCount: data.sourceCount,
        successSourceCount: data.successSourceCount,
        failedSourceCount: data.failedSourceCount,
        durationMs: data.durationMs,
      });
      if (!data.ok && data.errors.length > 0 && data.results.length === 0) {
        setError(data.errors[0].reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜索失败');
      setResults([]);
      setStats(null);
      setErrors([]);
      setDiagnostics(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- 本地搜索 ----
  const doLocalSearch = useCallback(async (keyword: string) => {
    if (!keyword.trim()) {
      setLocalResults([]);
      return;
    }
    setLocalLoading(true);
    setLocalError('');
    try {
      const resp = await fetch(
        `http://localhost:3001/api/search?q=${encodeURIComponent(keyword)}`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setLocalResults(data.sources || []);
    } catch (err) {
      if (err instanceof TypeError && err.message === 'Failed to fetch') {
        setLocalError('本地搜索服务未启动 (localhost:3001)');
      } else {
        setLocalError(err instanceof Error ? err.message : '本地搜索失败');
      }
      setLocalResults([]);
    } finally {
      setLocalLoading(false);
    }
  }, []);

  useEffect(() => {
    if (q) {
      setQuery(q);
      doSearch(q);
      if (localEnabled) doLocalSearch(q);
    }
  }, [q, doSearch, localEnabled, doLocalSearch]);

  const handleSearch = (keyword: string) => {
    setQuery(keyword);
    doSearch(keyword);
    if (localEnabled) doLocalSearch(keyword);
  };

  // ---- 渲染辅助 ----
  const comicFromResult = (r: SearchResultItem) => ({
    comicId: r.id,
    title: r.title,
    author: r.author || '',
    cover: r.cover || '',
    source: r.sourceId,
    sourceName: r.sourceName,
    status: (r.status as 'ongoing' | 'completed' | 'hiatus') || 'ongoing',
    description: '',
    lastChapter: r.latestChapter || '',
    updatedAt: r.updateTime || '',
  });

  const hasResults = results.length > 0;
  const hasLocalResults =
    localResults.length > 0 && localResults.some((s) => s.results.length > 0);

  return (
    <div className="space-y-6">
      <SearchBar
        onSearch={handleSearch}
        loading={loading || localLoading}
        initialValue={q}
      />

      {/* 标签 */}
      <div className="flex items-center gap-2 text-sm border-b border-gray-200 dark:border-gray-800 pb-2 flex-wrap">
        <button
          onClick={() => setTab('unified')}
          className={`px-3 py-1 rounded-t-lg transition-colors ${
            tab === 'unified'
              ? 'bg-primary-50 text-primary-600 dark:bg-primary-950 dark:text-primary-400 font-medium'
              : 'text-gray-500'
          }`}
        >
          🌐 统一搜索 {stats && `(${results.length})`}
        </button>
        <button
          onClick={() => {
            setLocalEnabled(!localEnabled);
            setTab('local');
          }}
          className={`px-3 py-1 rounded-t-lg transition-colors text-xs ${
            localEnabled
              ? 'bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400'
              : 'text-gray-400'
          }`}
        >
          📡 本地源 {localEnabled ? '(开)' : '(关)'}
        </button>
        {stats && (
          <span className="ml-auto text-xs text-gray-400">
            {stats.successSourceCount}/{stats.sourceCount} 源 ·{' '}
            {stats.durationMs}ms
            {stats.failedSourceCount > 0 &&
              ` · ${stats.failedSourceCount} 失败`}
          </span>
        )}
      </div>

      {/* 本地源开关提示 */}
      {localEnabled && !localError && !localLoading && localResults.length === 0 && (
        <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-xs text-blue-600 dark:text-blue-400">
          本地搜索已开启，输入关键词后将同时搜索本地和远程源
        </div>
      )}

      {/* ======== 无结果 + 有源连接 ======== */}
      {!loading && results.length === 0 && stats && stats.sourceCount > 0 && !error && query && (
        <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800 space-y-3">
          <div>
            <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              ⚠️ 远程源已连接 ({stats.successSourceCount}/{stats.sourceCount})，但没有验证通过的可搜索源
            </p>
            <p className="text-xs text-yellow-600 dark:text-yellow-500 mt-1">
              这通常是因为还没有运行源验证，或者是所有源的搜索规则/网络连接有问题。
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium text-yellow-700 dark:text-yellow-400">
              请先运行以下步骤：
            </p>
            <ol className="text-xs text-yellow-600 dark:text-yellow-500 list-decimal pl-4 space-y-1">
              <li>
                运行验证脚本：{' '}
                <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded text-yellow-800 dark:text-yellow-300">
                  pnpm verify:search-sources
                </code>
              </li>
              <li>
                或访问批量诊断：{' '}
                <Link
                  href={`/api/debug/search-sources?keyword=${encodeURIComponent(query)}&limit=20`}
                  className="underline"
                  target="_blank"
                >
                  /api/debug/search-sources?keyword={query}&limit=20
                </Link>
              </li>
              <li>
                将生成的{' '}
                <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded text-yellow-800 dark:text-yellow-300">
                  verified-search-sources.generated.json
                </code>{' '}
                覆盖到{' '}
                <code className="bg-yellow-100 dark:bg-yellow-900 px-1 rounded text-yellow-800 dark:text-yellow-300">
                  verified-search-sources.json
                </code>
              </li>
              <li>重新搜索</li>
            </ol>
          </div>

          {/* 诊断详情 */}
          {diagnostics && (
            <details className="text-xs">
              <summary className="cursor-pointer text-yellow-600 dark:text-yellow-500">
                查看诊断详情
              </summary>
              <div className="mt-2 space-y-1 text-yellow-600 dark:text-yellow-500">
                <p>模式: {diagnostics.mode}</p>
                <p>已验证源数: {diagnostics.verifiedCount}</p>
                <p>尝试搜索源数: {diagnostics.attemptedSources.length}</p>
                {diagnostics.debugUrl && (
                  <p>
                    诊断链接:{' '}
                    <Link href={diagnostics.debugUrl} className="underline" target="_blank">
                      {diagnostics.debugUrl}
                    </Link>
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      )}

      {/* ======== 无结果 + 无源 ======== */}
      {!loading && results.length === 0 && stats && stats.sourceCount === 0 && query && (
        <div className="p-4 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800">
          <p className="text-sm font-medium text-red-700 dark:text-red-400">
            ❌ 无法连接到远程书源中心
          </p>
          <p className="text-xs text-red-500 dark:text-red-500 mt-1">
            请检查网络连接，或确保 comicfs 数据已加载到本地。
          </p>
        </div>
      )}

      {/* 错误信息 */}
      {error && (
        <div className="p-3 rounded-lg bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/30 dark:border-yellow-800 text-sm text-yellow-700 dark:text-yellow-400">
          {error}
          {stats && stats.sourceCount > 0 && (
            <span className="ml-2">
              · {stats.successSourceCount}/{stats.sourceCount} 源已连接
            </span>
          )}
        </div>
      )}

      {/* errors 详情 */}
      {errors.length > 0 && (
        <details className="text-xs text-gray-500 dark:text-gray-400">
          <summary className="cursor-pointer">
            查看 {errors.length} 个源错误
          </summary>
          <ul className="mt-1 space-y-0.5 max-h-40 overflow-auto">
            {errors.slice(0, 30).map((e, i) => (
              <li key={i}>
                [{e.scope || 'source'}] {e.sourceName}: {e.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* 本地错误 */}
      {localError && (
        <div className="p-2 rounded-lg bg-gray-50 border border-gray-200 dark:bg-gray-900 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
          {localError}
        </div>
      )}

      {/* 结果列表 */}
      {tab === 'unified' && hasResults && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">
              🌐 远程源 ({results.length} 条)
            </h2>
            {stats && (
              <span className="text-xs text-gray-400">{stats.durationMs}ms</span>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {results.map((r, i) => (
              <ComicCard key={i} comic={comicFromResult(r)} showSource={true} />
            ))}
          </div>
        </section>
      )}

      {/* 本地结果 */}
      {localEnabled &&
        tab === 'local' &&
        localResults.map((source) => (
          <section key={source.source}>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                📡 {source.sourceName}
              </h2>
              {source.error ? (
                <span className="text-xs text-red-500">({source.error})</span>
              ) : (
                <span className="text-xs text-gray-400">
                  ({source.results.length} 条)
                </span>
              )}
            </div>
            {source.results.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {source.results.map((comic, i) => (
                  <ComicCard
                    key={`${(comic as Record<string, unknown>).comicId || i}`}
                    comic={comic as never}
                    showSource={false}
                  />
                ))}
              </div>
            )}
          </section>
        ))}

      {/* 加载中 */}
      {loading && results.length === 0 && (
        <div className="text-center py-8 animate-pulse text-gray-400 text-sm">
          正在从远程源搜索...
        </div>
      )}

      {/* 全局空状态 */}
      {!loading &&
        !hasResults &&
        !hasLocalResults &&
        query &&
        !error &&
        !stats && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">😞</p>
            <p className="text-gray-500 dark:text-gray-400">
              未找到相关漫画 "{query}"
            </p>
          </div>
        )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <div className="text-center py-16 text-gray-400">加载中...</div>
      }
    >
      <SearchContent />
    </Suspense>
  );
}
