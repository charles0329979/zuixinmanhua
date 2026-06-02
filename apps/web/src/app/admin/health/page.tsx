'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAllHealth, triggerHealthCheck } from '@/lib/api';
import type { HealthReport } from '@/types';

const statusColors: Record<string, string> = {
  healthy: 'bg-green-500', degraded: 'bg-yellow-500',
  unhealthy: 'bg-red-500', disabled: 'bg-gray-400', unknown: 'bg-gray-300',
};
const statusLabels: Record<string, string> = {
  healthy: '健康', degraded: '降级', unhealthy: '异常', disabled: '已停用', unknown: '未知',
};

export default function HealthPage() {
  const [reports, setReports] = useState<HealthReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingAll, setCheckingAll] = useState(false);

  useEffect(() => { getAllHealth().then(setReports).finally(() => setLoading(false)); }, []);

  const handleCheckAll = async () => {
    setCheckingAll(true);
    const ids = reports.map((r) => r.sourceId);
    for (const id of ids) {
      try { const r = await triggerHealthCheck(id); setReports((prev) => prev.map((p) => p.sourceId === r.sourceId ? r : p)); } catch {}
    }
    setCheckingAll(false);
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🏥 健康仪表盘</h1>
        <div className="flex gap-2">
          <Link href="/admin/sources" className="btn-secondary text-sm">书源</Link>
          <Link href="/admin/health" className="btn-primary text-sm">健康</Link>
          <Link href="/admin/logs" className="btn-secondary text-sm">日志</Link>
          <button onClick={handleCheckAll} disabled={checkingAll} className="btn-primary text-sm">
            {checkingAll ? '检测中...' : '检测全部'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {reports.map((r) => (
          <div key={r.sourceId} className="card p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="font-semibold">{r.name}</h3>
                <p className="text-xs text-gray-500">{r.domain}</p>
              </div>
              <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full text-white ${statusColors[r.overallStatus] || 'bg-gray-300'}`}>
                ● {statusLabels[r.overallStatus] || r.overallStatus}
              </span>
            </div>
            <div className="space-y-1.5 text-xs">
              {r.checks.length === 0 ? (
                <p className="text-gray-400">尚未检测</p>
              ) : (
                r.checks.map((c) => (
                  <div key={c.checkType} className="flex items-center justify-between">
                    <span className="text-gray-500">
                      {{ homepage: '🏠 首页', search: '🔍 搜索', detail: '📖 详情', chapter: '📋 章节', image: '🖼️ 图片' }[c.checkType] || c.checkType}
                    </span>
                    <span className={c.isHealthy ? 'text-green-500' : 'text-red-500'}>
                      {c.isHealthy ? `✅ ${c.responseTimeMs}ms` : `❌ ${c.errorMessage?.slice(0, 30) || '失败'}`}
                    </span>
                  </div>
                ))
              )}
            </div>
            {r.lastCheckAt && <p className="text-xs text-gray-400 mt-2">检测: {new Date(r.lastCheckAt).toLocaleTimeString('zh-CN')}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
