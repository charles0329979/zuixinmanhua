'use client';
// ============================================================
// apps/web/src/app/playground/page.tsx
// ★ Source Playground — 交互式书源调试工具
// ============================================================

import { useState, useCallback } from 'react';

interface SelectorTrace {
  field: string;
  selector: string;
  matchedCount: number;
  sampleValues: string[];
}

export default function PlaygroundPage() {
  const [sources, setSources] = useState<any[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [keyword, setKeyword] = useState('海贼王');
  const [rawHtml, setRawHtml] = useState('');
  const [parsedResults, setParsedResults] = useState<any[]>([]);
  const [traces, setTraces] = useState<SelectorTrace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load sources on mount
  const loadSources = useCallback(async () => {
    try {
      const resp = await fetch('/api/sources/remote?onlyOk=false');
      const data = await resp.json();
      setSources(data.sources || []);
    } catch {
      // fallback
    }
  }, []);

  // Run search test
  const handleTest = useCallback(async () => {
    if (!selectedSourceId || !keyword) return;
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(
        `/api/debug/search-source?sourceId=${selectedSourceId}&keyword=${encodeURIComponent(keyword)}`,
      );
      const data = await resp.json();
      if (data.ok) {
        setRawHtml(data.rawHtml || '');
        setParsedResults(data.parsedResults || []);
        setTraces(data.selectorTraces || []);
      } else {
        setError(data.error || 'Search failed');
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedSourceId, keyword]);

  const selectedSource = sources.find((s) => s.id === selectedSourceId);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <h1 className="text-2xl font-bold mb-6">🧪 Source Playground</h1>

      {/* Step 1: Source Selector */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <label className="text-xs text-slate-400 mb-1 block">
            选择书源
          </label>
          <select
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100"
            value={selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            onFocus={loadSources}
          >
            <option value="">-- 选择书源 --</option>
            {sources.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.riskLevel}) — {s.host}
              </option>
            ))}
          </select>
        </div>
        <div className="w-64">
          <label className="text-xs text-slate-400 mb-1 block">
            搜索关键词
          </label>
          <input
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-slate-100"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleTest()}
          />
        </div>
        <div className="flex items-end">
          <button
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50"
            onClick={handleTest}
            disabled={loading || !selectedSourceId}
          >
            {loading ? '⏳ 搜索中...' : '🔍 测试搜索'}
          </button>
        </div>
      </div>

      {/* Source Info */}
      {selectedSource && (
        <div className="flex gap-3 mb-6 flex-wrap">
          <span className="px-3 py-1 rounded-full text-xs bg-slate-800 text-slate-300">
            Host: {selectedSource.host}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs ${
            selectedSource.riskLevel === 'low' ? 'bg-green-900/50 text-green-400' :
            selectedSource.riskLevel === 'medium' ? 'bg-yellow-900/50 text-yellow-400' :
            'bg-red-900/50 text-red-400'
          }`}>
            {selectedSource.riskLevel}
          </span>
          <span className="px-3 py-1 rounded-full text-xs bg-slate-800 text-slate-300">
            {selectedSource.status}
          </span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-950/50 border border-red-800 rounded-lg text-red-400">
          {error}
        </div>
      )}

      {/* Step 2: Split View — HTML | Parsed Results */}
      <div className="grid grid-cols-2 gap-4 h-[60vh]">
        {/* Left: Raw HTML */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-auto">
          <div className="sticky top-0 bg-slate-800 px-4 py-2 text-xs text-slate-400 flex justify-between">
            <span>RAW HTML</span>
            <span>{rawHtml.length.toLocaleString()} chars</span>
          </div>
          <pre className="p-4 text-xs text-slate-300 whitespace-pre-wrap break-all font-mono">
            {rawHtml || (
              <span className="text-slate-600">
                点击「测试搜索」查看原始 HTML 响应...
              </span>
            )}
          </pre>
        </div>

        {/* Right: Parsed Results */}
        <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-auto">
          <div className="sticky top-0 bg-slate-800 px-4 py-2 text-xs text-slate-400 flex justify-between">
            <span>PARSED RESULTS</span>
            <span>{parsedResults.length} comics</span>
          </div>
          <div className="p-4 space-y-3">
            {parsedResults.length === 0 && !loading && (
              <p className="text-slate-600 text-sm">
                {rawHtml ? '解析无结果 — 检查选择器' : '等待测试...'}
              </p>
            )}
            {parsedResults.slice(0, 20).map((r, i) => (
              <div
                key={i}
                className="flex gap-3 p-2 rounded-lg bg-slate-800/50"
              >
                {r.cover && (
                  <img
                    src={r.cover}
                    className="w-14 h-20 object-cover rounded"
                    alt=""
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-100 font-medium truncate">
                    {r.title}
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    URL: {r.detailUrl}
                  </p>
                  {r.author && (
                    <p className="text-xs text-slate-500">
                      作者: {r.author}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Step 3: Selector Trace */}
      {traces.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-semibold mb-3">📊 Selector Trace</h3>
          <div className="grid grid-cols-4 gap-2">
            {traces.map((t, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg border ${
                  t.matchedCount > 0
                    ? 'border-green-800 bg-green-950/30'
                    : 'border-red-800 bg-red-950/30'
                }`}
              >
                <p className="text-xs text-slate-400 uppercase">
                  {t.field}
                </p>
                <p className="text-xs font-mono text-slate-200 mt-1 break-all">
                  {t.selector}
                </p>
                <p
                  className={`text-lg font-bold mt-2 ${
                    t.matchedCount > 0
                      ? 'text-green-400'
                      : 'text-red-400'
                  }`}
                >
                  {t.matchedCount}
                </p>
                {t.sampleValues.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1 truncate">
                    e.g. {t.sampleValues[0]}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
