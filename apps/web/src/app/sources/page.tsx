'use client';
import { useEffect, useState } from 'react';
import type { MangaSource } from '@/types/source';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, opts);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export default function SourcesPage() {
  const [sources, setSources] = useState<MangaSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editSource, setEditSource] = useState<MangaSource | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState('');

  const refresh = async () => {
    try {
      const res = await apiFetch<{ success: boolean; data: MangaSource[] }>(`${API}/rule-sources`);
      setSources(res.data || []);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const filtered = sources.filter(s =>
    !filter || s.name.includes(filter) || s.host.includes(filter) || s.tags.some(t => t.includes(filter))
  );

  const handleToggle = async (id: string) => {
    await apiFetch(`${API}/rule-sources/${id}/toggle`, { method: 'PATCH' });
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除？')) return;
    await apiFetch(`${API}/rule-sources/${id}`, { method: 'DELETE' });
    refresh();
  };

  const handleTest = async (source: MangaSource) => {
    setTesting(source.id); setTestResult('');
    try {
      const res = await apiFetch<{ success: boolean; data?: { resultCount: number } }>(`${API}/rule-sources/test`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source }),
      });
      setTestResult(res.success ? `✓ ${res.data?.resultCount || 0} 条结果` : `✗ ${res.message}`);
    } catch (e: any) { setTestResult(`✗ ${e.message}`); }
    setTesting(null);
  };

  const handleSave = async () => {
    if (!editSource) return;
    const isNew = !sources.find(s => s.id === editSource.id);
    const method = isNew ? 'POST' : 'PUT';
    const url = isNew ? `${API}/rule-sources` : `${API}/rule-sources/${editSource.id}`;
    await apiFetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editSource) });
    setEditSource(null); refresh();
  };

  const handleImport = async () => {
    try {
      const list = JSON.parse(importText);
      const arr = Array.isArray(list) ? list : [list];
      await apiFetch(`${API}/rule-sources/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: arr }),
      });
      setShowImport(false); setImportText(''); refresh();
    } catch { alert('JSON 格式错误'); }
  };

  const handleExport = async () => {
    const res = await apiFetch<{ success: boolean; data: MangaSource[] }>(`${API}/rule-sources/export`);
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'sources.json'; a.click();
  };

  const handleBatchEnable = async () => {
    for (const s of sources.filter(s => !s.enabled)) {
      await apiFetch(`${API}/rule-sources/${s.id}/toggle`, { method: 'PATCH' });
    }
    refresh();
  };

  const handleBatchDisable = async () => {
    for (const s of sources.filter(s => s.enabled)) {
      await apiFetch(`${API}/rule-sources/${s.id}/toggle`, { method: 'PATCH' });
    }
    refresh();
  };

  if (loading) return <div className="text-center py-16 text-gray-400">加载中...</div>;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">📚 书源仓库</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setEditSource({ id: `src-${Date.now()}`, name: '', host: '', enabled: true, language: 'zh', weight: 50, tags: [], search: { url: '', method: 'GET', listSelector: '', titleSelector: '', coverSelector: '', detailUrlSelector: '' }, detail: { titleSelector: '' }, chapters: { listSelector: '', titleSelector: '', urlSelector: '' }, images: { listSelector: '', srcAttribute: 'src' }, createdAt: '', updatedAt: '' } as MangaSource)} className="btn-primary text-sm px-3 py-1.5">➕ 新增</button>
          <button onClick={() => setShowImport(true)} className="btn-secondary text-sm px-3 py-1.5">📥 导入</button>
          <button onClick={handleExport} className="btn-secondary text-sm px-3 py-1.5">📤 导出</button>
          <button onClick={handleBatchEnable} className="btn-secondary text-sm px-3 py-1.5">✅ 全部启用</button>
          <button onClick={handleBatchDisable} className="btn-secondary text-sm px-3 py-1.5">⛔ 全部禁用</button>
        </div>
      </div>

      <input type="text" value={filter} onChange={e => setFilter(e.target.value)} placeholder="搜索/筛选书源..." className="input w-full" />

      <div className="space-y-3">
        {filtered.map(source => (
          <div key={source.id} className={`card p-4 ${!source.enabled ? 'opacity-50' : ''}`}>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h3 className="font-semibold">{source.name} <span className="text-xs text-gray-400">{source.host}</span></h3>
                <div className="flex gap-1 mt-1 flex-wrap">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${source.enabled ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}>{source.enabled ? '✅ 启用' : '⛔ 禁用'}</span>
                  {source.tags.map(t => <span key={t} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{t}</span>)}
                  <span className="text-xs text-gray-400">权重: {source.weight}</span>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => handleTest(source)} disabled={testing === source.id} className="btn-ghost text-xs">{testing === source.id ? '...' : '🧪'}</button>
                <button onClick={() => setEditSource({ ...source })} className="btn-ghost text-xs">✏️</button>
                <button onClick={() => handleToggle(source.id)} className="btn-ghost text-xs">{source.enabled ? '⏸' : '▶'}</button>
                <button onClick={() => handleDelete(source.id)} className="btn-ghost text-xs text-red-500">🗑</button>
              </div>
            </div>
            {testing === source.id && <p className="text-xs text-gray-500 mt-1">测试中...</p>}
            {testResult && testing === null && <p className="text-xs mt-1">{testResult}</p>}
          </div>
        ))}
      </div>

      {/* 编辑弹窗 */}
      {editSource && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6 space-y-4">
            <h2 className="text-lg font-bold">{sources.find(s => s.id === editSource.id) ? '编辑书源' : '新增书源'}</h2>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-500">ID</label><input className="input w-full text-sm" value={editSource.id} onChange={e => setEditSource({ ...editSource, id: e.target.value })} /></div>
              <div><label className="text-xs text-gray-500">名称</label><input className="input w-full text-sm" value={editSource.name} onChange={e => setEditSource({ ...editSource, name: e.target.value })} /></div>
              <div className="col-span-2"><label className="text-xs text-gray-500">Host</label><input className="input w-full text-sm" value={editSource.host} onChange={e => setEditSource({ ...editSource, host: e.target.value })} /></div>
              <div><label className="text-xs text-gray-500">搜索URL</label><input className="input w-full text-sm" value={editSource.search.url} onChange={e => setEditSource({ ...editSource, search: { ...editSource.search, url: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">列表选择器</label><input className="input w-full text-sm" value={editSource.search.listSelector} onChange={e => setEditSource({ ...editSource, search: { ...editSource.search, listSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">标题选择器</label><input className="input w-full text-sm" value={editSource.search.titleSelector} onChange={e => setEditSource({ ...editSource, search: { ...editSource.search, titleSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">封面选择器</label><input className="input w-full text-sm" value={editSource.search.coverSelector} onChange={e => setEditSource({ ...editSource, search: { ...editSource.search, coverSelector: e.target.value } })} /></div>
              <div className="col-span-2"><label className="text-xs text-gray-500">详情URL选择器</label><input className="input w-full text-sm" value={editSource.search.detailUrlSelector} onChange={e => setEditSource({ ...editSource, search: { ...editSource.search, detailUrlSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">章节列表选择器</label><input className="input w-full text-sm" value={editSource.chapters.listSelector} onChange={e => setEditSource({ ...editSource, chapters: { ...editSource.chapters, listSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">章节标题选择器</label><input className="input w-full text-sm" value={editSource.chapters.titleSelector} onChange={e => setEditSource({ ...editSource, chapters: { ...editSource.chapters, titleSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">章节URL选择器</label><input className="input w-full text-sm" value={editSource.chapters.urlSelector} onChange={e => setEditSource({ ...editSource, chapters: { ...editSource.chapters, urlSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">图片列表选择器</label><input className="input w-full text-sm" value={editSource.images.listSelector} onChange={e => setEditSource({ ...editSource, images: { ...editSource.images, listSelector: e.target.value } })} /></div>
              <div><label className="text-xs text-gray-500">图片src属性</label><input className="input w-full text-sm" value={editSource.images.srcAttribute} onChange={e => setEditSource({ ...editSource, images: { ...editSource.images, srcAttribute: e.target.value } })} /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditSource(null)} className="btn-secondary text-sm px-4 py-2">取消</button>
              <button onClick={handleSave} className="btn-primary text-sm px-4 py-2">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入弹窗 */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg max-w-lg w-full p-6 space-y-4">
            <h2 className="text-lg font-bold">📥 导入书源</h2>
            <textarea className="input w-full h-48 text-xs font-mono" value={importText} onChange={e => setImportText(e.target.value)} placeholder='粘贴 JSON 数组...' />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowImport(false)} className="btn-secondary text-sm px-4 py-2">取消</button>
              <button onClick={handleImport} className="btn-primary text-sm px-4 py-2">导入</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
