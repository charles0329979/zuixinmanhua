'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getCheckLogs, getSearchLogs } from '@/lib/api';
import type { CheckLogEntry, SearchLogEntry } from '@/types';

export default function LogsPage() {
  const [tab, setTab] = useState<'checks' | 'searches'>('checks');
  const [checkLogs, setCheckLogs] = useState<CheckLogEntry[]>([]);
  const [searchLogs, setSearchLogs] = useState<SearchLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [checks, searches] = await Promise.all([getCheckLogs(), getSearchLogs()]);
      setCheckLogs(checks);
      setSearchLogs(searches);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📋 日志</h1>
        <div className="flex gap-2">
          <Link href="/admin/sources" className="btn-secondary text-sm">书源</Link>
          <Link href="/admin/health" className="btn-secondary text-sm">健康</Link>
          <Link href="/admin/logs" className="btn-primary text-sm">日志</Link>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
        <button
          onClick={() => setTab('checks')}
          className={`text-sm px-4 py-1.5 rounded-t-lg ${tab === 'checks' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          健康日志 ({checkLogs.length})
        </button>
        <button
          onClick={() => setTab('searches')}
          className={`text-sm px-4 py-1.5 rounded-t-lg ${tab === 'searches' ? 'bg-primary-500 text-white' : 'text-gray-500 hover:text-gray-700'}`}
        >
          搜索日志 ({searchLogs.length})
        </button>
      </div>

      {/* Health logs table */}
      {tab === 'checks' && (
        <div className="overflow-x-auto">
          {checkLogs.length === 0 ? (
            <p className="text-center text-gray-400 py-8">暂无健康日志，点击健康页的"检测全部"</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">时间</th>
                  <th className="py-2 pr-3">书源</th>
                  <th className="py-2 pr-3">类型</th>
                  <th className="py-2 pr-3">域名</th>
                  <th className="py-2 pr-3">状态</th>
                  <th className="py-2 pr-3">耗时</th>
                  <th className="py-2">错误</th>
                </tr>
              </thead>
              <tbody>
                {checkLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3 text-gray-500">{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                    <td className="py-2 pr-3">{log.source_name}</td>
                    <td className="py-2 pr-3">{{ homepage: '🏠', search: '🔍', detail: '📖', chapter: '📋', image: '🖼️' }[log.check_type] || log.check_type}</td>
                    <td className="py-2 pr-3 text-gray-500 max-w-[120px] truncate">{log.domain}</td>
                    <td className="py-2 pr-3">{log.is_healthy ? <span className="text-green-500">✅</span> : <span className="text-red-500">❌</span>}</td>
                    <td className="py-2 pr-3 text-gray-500">{log.response_time_ms}ms</td>
                    <td className="py-2 text-red-500 max-w-[200px] truncate">{log.error_message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Search logs table */}
      {tab === 'searches' && (
        <div className="overflow-x-auto">
          {searchLogs.length === 0 ? (
            <p className="text-center text-gray-400 py-8">暂无搜索日志，搜索漫画后显示</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-3">时间</th>
                  <th className="py-2 pr-3">关键词</th>
                  <th className="py-2 pr-3">书源</th>
                  <th className="py-2 pr-3">结果</th>
                  <th className="py-2 pr-3">耗时</th>
                  <th className="py-2">错误</th>
                </tr>
              </thead>
              <tbody>
                {searchLogs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 dark:border-gray-800">
                    <td className="py-2 pr-3 text-gray-500">{new Date(log.created_at).toLocaleString('zh-CN')}</td>
                    <td className="py-2 pr-3 font-medium">{log.keyword}</td>
                    <td className="py-2 pr-3">{log.source_id}</td>
                    <td className="py-2 pr-3">{log.is_success ? <span className="text-green-500">{log.result_count} 条</span> : <span className="text-red-500">失败</span>}</td>
                    <td className="py-2 pr-3 text-gray-500">{log.response_time_ms}ms</td>
                    <td className="py-2 text-red-500 max-w-[200px] truncate">{log.error_message || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
