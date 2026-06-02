'use client';
import { useEffect, useState } from 'react';
import { getSources, toggleSource, testSourceSearch } from '@/lib/api';
import type { SourceStatus } from '@/types';

export default function AdminSourcesPage() {
  const [sources, setSources] = useState<SourceStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, any>>({});

  useEffect(() => {
    getSources().then(setSources).finally(() => setLoading(false));
  }, []);

  const handleToggle = async (id: string, enabled: boolean) => {
    await toggleSource(id, enabled);
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, enabled } : s)));
  };

  const handleTestSearch = async (id: string) => {
    setTestingId(id);
    try {
      const result = await testSourceSearch(id);
      setTestResults((prev) => ({ ...prev, [id]: { ...prev[id], search: result } }));
    } catch {}
    setTestingId(null);
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">⚙️ 书源管理</h1>
      <p className="text-sm text-gray-500">管理内置书源，启用/停用/测试各书源的搜索与解析功能</p>

      <div className="space-y-3">
        {sources.map((source) => (
          <div key={source.id} className={`card p-4 ${!source.enabled ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">{source.name}</h3>
                <p className="text-xs text-gray-500">{source.domain}</p>
                {testResults[source.id]?.search && (
                  <p className="text-xs mt-1">
                    {testResults[source.id].search.success ? (
                      <span className="text-green-500">
                        ✅ 搜索测试通过 ({testResults[source.id].search.responseTime}ms, {testResults[source.id].search.resultCount} 条)
                      </span>
                    ) : (
                      <span className="text-red-500">❌ {testResults[source.id].search.error}</span>
                    )}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleTestSearch(source.id)}
                  disabled={testingId === source.id || !source.enabled}
                  className="btn-ghost text-xs"
                >
                  {testingId === source.id ? '测试中...' : '🧪 测试'}
                </button>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={source.enabled}
                    onChange={(e) => handleToggle(source.id, e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-10 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:bg-primary-500 peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all"></div>
                </label>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card p-4 bg-gray-50 dark:bg-gray-800/50">
        <h3 className="font-semibold mb-2">📝 添加自定义书源（后续版本）</h3>
        <p className="text-sm text-gray-500">
          后续将支持用户自定义书源，通过配置 URL 选择器和 JSON API 参数来添加新的漫画网站。
          当前版本内置 5 个书源，覆盖主流中文漫画网站。
        </p>
      </div>
    </div>
  );
}
