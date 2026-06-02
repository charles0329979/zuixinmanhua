'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSources, toggleSource, testSourceSearch, setSourceTier, getSourceConfig, addSourceDomain, removeSourceDomain, triggerHealthCheck } from '@/lib/api';
import type { SourceStatus, SourceConfigFull } from '@/types';

const tierLabels: Record<string, string> = { core: '⭐ 核心', supplement: '🟡 补充', disabled: '⛔ 失效' };
const tierColors: Record<string, string> = { core: 'bg-green-100 text-green-700', supplement: 'bg-yellow-100 text-yellow-700', disabled: 'bg-gray-200 text-gray-500' };

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedConfig, setExpandedConfig] = useState<SourceConfigFull | null>(null);
  const [newDomainUrl, setNewDomainUrl] = useState('');
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const refresh = async () => {
    const data = await getSources();
    setSources(data);
    setLoading(false);
  };

  useEffect(() => { refresh(); }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleSource(id, enabled);
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  };

  const handleTier = async (id: string, tier: string) => {
    await setSourceTier(id, tier);
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, tier } : s)));
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try { const r = await testSourceSearch(id); setTestResults((p) => ({ ...p, [id]: { ...p[id], search: r } })); } catch {}
    setTestingId(null);
  };

  const handleExpand = async (id: string) => {
    if (expandedId === id) { setExpandedId(null); setExpandedConfig(null); return; }
    setExpandedId(id);
    try { const cfg = await getSourceConfig(id); setExpandedConfig(cfg); } catch { setExpandedConfig(null); }
  };

  const handleAddDomain = async (id: string) => {
    if (!newDomainUrl.trim()) return;
    await addSourceDomain(id, newDomainUrl.trim());
    setNewDomainUrl('');
    // Refresh config
    try { const cfg = await getSourceConfig(id); setExpandedConfig(cfg); } catch {}
    refresh();
  };

  const handleRemoveDomain = async (sourceId: string, domainId: number) => {
    await removeSourceDomain(sourceId, domainId);
    try { const cfg = await getSourceConfig(sourceId); setExpandedConfig(cfg); } catch {}
    refresh();
  };

  const handleCheck = async (id: string) => {
    setCheckingId(id);
    try { await triggerHealthCheck(id); } catch {}
    setCheckingId(null);
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">⚙️ 书源管理 (Phase 2)</h1>
        <div className="flex gap-2 text-sm">
          <Link href="/admin/sources" className="btn-primary">书源</Link>
          <Link href="/admin/health" className="btn-secondary">健康</Link>
          <Link href="/admin/logs" className="btn-secondary">日志</Link>
        </div>
      </div>

      <div className="space-y-3">
        {sources.map((source) => (
          <div key={source.id} className={`card ${!source.enabled ? 'opacity-60' : ''}`}>
            {/* 主行 */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold">{source.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tierColors[source.tier || 'core']}`}>
                    {tierLabels[source.tier || 'core'] || source.tier}
                  </span>
                  {source.domainCount !== undefined && (
                    <span className="text-xs text-gray-400">🌐 {source.domainCount} 个域名</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{source.domain}</p>
                {testResults[source.id]?.search && (
                  <p className="text-xs mt-1">
                    {testResults[source.id].search.success ? (
                      <span className="text-green-500">✅ {testResults[source.id].search.responseTime}ms, {testResults[source.id].search.resultCount} 条</span>
                    ) : (
                      <span className="text-red-500">❌ {testResults[source.id].search.error}</span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {/* Tier 切换 */}
                <select
                  value={source.tier || 'core'}
                  onChange={(e) => handleTier(source.id, e.target.value)}
                  className="text-xs border rounded px-2 py-1 bg-white dark:bg-gray-800"
                >
                  <option value="core">核心</option>
                  <option value="supplement">补充</option>
                  <option value="disabled">失效</option>
                </select>

                <button onClick={() => handleExpand(source.id)} className="btn-ghost text-xs">
                  {expandedId === source.id ? '收起' : '域名'}
                </button>
                <button
                  onClick={() => handleTest(source.id)}
                  disabled={testingId === source.id || !source.enabled}
                  className="btn-ghost text-xs"
                >
                  {testingId === source.id ? '...' : '🧪'}
                </button>
                <button
                  onClick={() => handleCheck(source.id)}
                  disabled={checkingId === source.id}
                  className="btn-ghost text-xs"
                >
                  {checkingId === source.id ? '...' : '🏥'}
                </button>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox" checked={source.enabled}
                    onChange={(e) => handleToggle(source.id, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
            </div>

            {/* 展开：域名池 */}
            {expandedId === source.id && (
              <div className="border-t border-gray-100 dark:border-gray-800 p-4 bg-gray-50 dark:bg-gray-800/30 space-y-2">
                <h4 className="text-sm font-semibold">域名池</h4>
                {expandedConfig?.domains?.map((d) => (
                  <div key={d.id} className="flex items-center justify-between text-sm bg-white dark:bg-gray-900 rounded px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs mr-2 ${d.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                        {d.isActive ? '✅' : '⛔'}
                      </span>
                      <span className="text-xs">{d.url}</span>
                      <span className="text-xs text-gray-400 ml-2">
                        (P{d.priority}, {d.successCount}✓/{d.failCount}✗)
                      </span>
                    </div>
                    <button onClick={() => handleRemoveDomain(source.id, d.id)} className="btn-ghost text-xs text-red-500">
                      删除
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text" value={newDomainUrl} onChange={(e) => setNewDomainUrl(e.target.value)}
                    placeholder="新域名 https://..."
                    className="input text-xs flex-1 py-1.5"
                  />
                  <button onClick={() => handleAddDomain(source.id)} className="btn-primary text-xs py-1 px-3">
                    添加
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
