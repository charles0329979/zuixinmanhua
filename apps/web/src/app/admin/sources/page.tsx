'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getSources, toggleSource, testSourceSearch, setSourceTier, getSourceConfig, addSourceDomain, removeSourceDomain, triggerHealthCheck, setSourceMode, recoverSource } from '@/lib/api';
import type { SourceStatus, SourceConfigFull } from '@/types';

const tierLabels: Record<string, string> = { core: '⭐ 核心', supplement: '🟡 补充', disabled: '⛔ 失效' };
const tierColors: Record<string, string> = { core: 'bg-green-100 text-green-700', supplement: 'bg-yellow-100 text-yellow-700', disabled: 'bg-gray-200 text-gray-500' };
const modeLabels: Record<string, string> = { 'server-parser': '🔧 服务端', 'client-parser': '🌐 客户端', 'external-only': '📋 仅展示' };
const healthColors: Record<string, string> = {
  healthy: 'bg-green-100 text-green-700',
  degraded: 'bg-yellow-100 text-yellow-700',
  blocked: 'bg-red-100 text-red-700',
  disabled: 'bg-gray-200 text-gray-500',
  unknown: 'bg-gray-100 text-gray-500',
};
const healthLabels: Record<string, string> = {
  healthy: '🟢 正常',
  degraded: '🟡 降级',
  blocked: '🔴 熔断',
  disabled: '⚫ 停用',
  unknown: '❓ 未知',
};

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

  const handleMode = async (id: string, mode: string) => {
    await setSourceMode(id, mode);
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, mode } : s)));
  };

  const handleRecover = async (id: string) => {
    await recoverSource(id);
    refresh();
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
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold">{source.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${tierColors[source.tier || 'core']}`}>
                    {tierLabels[source.tier || 'core'] || source.tier}
                  </span>
                  {/* 运行模式 */}
                  <span className="text-xs text-gray-400">
                    {modeLabels[(source as any).mode] || modeLabels['server-parser']}
                  </span>
                  {/* 健康状态 */}
                  {(source as any).healthStatus && (
                    <span className={`text-xs px-2 py-0.5 rounded-full ${healthColors[(source as any).healthStatus] || healthColors.unknown}`}>
                      {healthLabels[(source as any).healthStatus] || '❓ 未知'}
                    </span>
                  )}
                  {source.domainCount !== undefined && (
                    <span className="text-xs text-gray-400">🌐 {source.domainCount} 个域名</span>
                  )}
                </div>
                <p className="text-xs text-gray-500 mt-1">{source.domain}</p>
                {/* 熔断信息 */}
                {(source as any).healthStatus === 'blocked' && (
                  <div className="mt-1 text-xs">
                    <span className="text-red-500">
                      🚫 熔断中
                      {(source as any).blockedUntil && ` · 恢复: ${new Date((source as any).blockedUntil).toLocaleString()}`}
                    </span>
                    {(source as any).lastError && (
                      <span className="text-gray-400 ml-2">原因: {(source as any).lastError?.slice(0, 60)}</span>
                    )}
                  </div>
                )}
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

              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {/* 运行模式 */}
                <select
                  value={(source as any).mode || 'server-parser'}
                  onChange={(e) => handleMode(source.id, e.target.value)}
                  className="text-xs border rounded px-2 py-1 bg-white dark:bg-gray-800"
                  title="运行模式"
                >
                  <option value="server-parser">🔧 服务端</option>
                  <option value="client-parser">🌐 客户端</option>
                  <option value="external-only">📋 仅展示</option>
                </select>

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

                {/* 手动恢复 (blocked 状态显示) */}
                {(source as any).healthStatus === 'blocked' && (
                  <button onClick={() => handleRecover(source.id)} className="btn-ghost text-xs text-orange-500" title="手动恢复熔断">
                    🔄 恢复
                  </button>
                )}

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
