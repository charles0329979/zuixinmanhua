'use client';
// ============================================================
// 远程书源管理页 — comicfs 接入管理
// 路由: /settings/sources
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import type { RemoteSourceDisplay } from '@/lib/comicfs/types';
import { setLocalEnabled, getLocalOverride } from '@/lib/comicfs/source-loader';

// ---- 风险等级颜色 ----
const RISK_COLORS: Record<string, string> = {
  low: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  blocked: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  degraded: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  disabled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  archived: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-500',
};

// ---- 常量 ----
const ALL_RISK_LEVELS = ['low', 'medium', 'high', 'blocked'];
const ALL_STATUSES = ['active', 'degraded', 'failed', 'disabled', 'archived'];

export default function RemoteSourcesPage() {
  // ---- 数据状态 ----
  const [sources, setSources] = useState<RemoteSourceDisplay[]>([]);
  const [manifestVersion, setManifestVersion] = useState<string | null>(null);
  const [manifestUpdatedAt, setManifestUpdatedAt] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- 过滤状态 ----
  const [search, setSearch] = useState('');
  const [selectedRiskLevels, setSelectedRiskLevels] = useState<Set<string>>(
    new Set(['low', 'medium']),
  );
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(
    new Set(['active']),
  );
  const [onlyOk, setOnlyOk] = useState(false);

  // ---- 本地覆盖 ----
  const [localOverrides, setLocalOverrides] = useState<Record<string, boolean>>({});

  // ---- 展开详情 ----
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // ==================== 加载数据 ====================
  const loadSources = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set('riskLevel', Array.from(selectedRiskLevels).join(','));
      params.set('status', Array.from(selectedStatuses).join(','));
      if (search) params.set('search', search);
      if (onlyOk) params.set('onlyOk', 'true');

      const resp = await fetch(`/api/sources/remote?${params.toString()}`);
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
      }

      const data = await resp.json();
      setSources(data.sources || []);
      setManifestVersion(data.manifestVersion);
      setManifestUpdatedAt(data.manifestUpdatedAt);
      setFromCache(data.fromCache);
      if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // 不清空 sources，保留旧数据
    } finally {
      setLoading(false);
    }
  }, [search, selectedRiskLevels, selectedStatuses, onlyOk]);

  useEffect(() => {
    loadSources();
  }, [loadSources]);

  // ==================== 刷新 ====================
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      const resp = await fetch('/api/sources/refresh', { method: 'POST' });
      const data = await resp.json();

      if (!data.success) {
        throw new Error(data.error || 'Refresh failed');
      }

      // 刷新成功后重新加载
      await loadSources();
    } catch (err) {
      setError(`Refresh failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRefreshing(false);
    }
  }, [loadSources]);

  // ==================== 本地开关 ====================
  const handleToggleLocal = useCallback(
    (sourceId: string, enabled: boolean) => {
      setLocalEnabled(sourceId, enabled);
      setLocalOverrides((prev) => ({ ...prev, [sourceId]: enabled }));

      // 更新内存中的 source 对象
      setSources((prev) =>
        prev.map((s) =>
          s.id === sourceId
            ? { ...s, locallyEnabled: enabled, locallyDisabled: !enabled }
            : s,
        ),
      );
    },
    [],
  );

  // ==================== 风险等级切换 ====================
  const toggleRiskLevel = useCallback((level: string) => {
    setSelectedRiskLevels((prev) => {
      const next = new Set(prev);
      if (next.has(level)) {
        if (next.size > 1) next.delete(level); // 至少保留一个
      } else {
        next.add(level);
      }
      return next;
    });
  }, []);

  // ==================== 状态切换 ====================
  const toggleStatus = useCallback((status: string) => {
    setSelectedStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(status)) {
        if (next.size > 1) next.delete(status);
      } else {
        next.add(status);
      }
      return next;
    });
  }, []);

  // ==================== 计算统计 ====================
  const stats = useMemo(() => {
    const total = sources.length;
    const okCount = sources.filter((s) => s.ok).length;
    const lowCount = sources.filter((s) => s.riskLevel === 'low').length;
    const mediumCount = sources.filter((s) => s.riskLevel === 'medium').length;
    const highCount = sources.filter((s) => s.riskLevel === 'high').length;
    const blockedCount = sources.filter((s) => s.riskLevel === 'blocked').length;
    return { total, okCount, lowCount, mediumCount, highCount, blockedCount };
  }, [sources]);

  // ==================== 格式化时间 ====================
  const formatTime = (iso: string | null): string => {
    if (!iso) return '未知';
    try {
      const d = new Date(iso);
      return d.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  // ==================== 渲染 ====================
  return (
    <div className="max-w-6xl mx-auto">
      {/* 页头 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            🌐 远程书源
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            来自 comicfs 注册中心 ·{' '}
            {manifestVersion ? `v${manifestVersion}` : '加载中...'} ·{' '}
            更新于 {formatTime(manifestUpdatedAt)}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn-primary flex items-center gap-2 px-4 py-2"
        >
          <span className={refreshing ? 'animate-spin' : ''}>
            {refreshing ? '⏳' : '🔄'}
          </span>
          {refreshing ? '刷新中...' : '刷新远程源'}
        </button>
      </div>

      {/* 数据来源标记 */}
      {fromCache && !loading && (
        <div className="mb-4 text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
          💾 使用缓存数据 · 上次刷新: {formatTime(manifestUpdatedAt)}
        </div>
      )}

      {/* 错误横幅 */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-800 flex items-start gap-2">
          <span className="text-red-500 shrink-0">⚠️</span>
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
          </div>
          <button
            onClick={handleRefresh}
            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 underline shrink-0"
          >
            重试
          </button>
        </div>
      )}

      {/* 统计栏 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <span className="text-sm px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
          📊 共 {stats.total} 个源
        </span>
        <span className="text-sm px-3 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          ✅ 可用 {stats.okCount}
        </span>
        <span className="text-sm px-3 py-1 rounded-full bg-green-50 dark:bg-green-900/20 text-green-600">低风险 {stats.lowCount}</span>
        <span className="text-sm px-3 py-1 rounded-full bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600">中风险 {stats.mediumCount}</span>
        {stats.highCount > 0 && (
          <span className="text-sm px-3 py-1 rounded-full bg-orange-50 dark:bg-orange-900/20 text-orange-600">高风险 {stats.highCount}</span>
        )}
        {stats.blockedCount > 0 && (
          <span className="text-sm px-3 py-1 rounded-full bg-red-50 dark:bg-red-900/20 text-red-600">已拦截 {stats.blockedCount}</span>
        )}
      </div>

      {/* 搜索 + 过滤器 */}
      <div className="flex flex-wrap gap-3 mb-6">
        {/* 搜索框 */}
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索源名称或域名..."
            className="input w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm"
          />
        </div>

        {/* 风险等级过滤 */}
        <div className="flex gap-1">
          {ALL_RISK_LEVELS.map((level) => (
            <button
              key={level}
              onClick={() => toggleRiskLevel(level)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                selectedRiskLevels.has(level)
                  ? RISK_COLORS[level] + ' border-current'
                  : 'border-gray-200 dark:border-gray-700 text-gray-400'
              }`}
            >
              {level === 'low' ? '低' : level === 'medium' ? '中' : level === 'high' ? '高' : '拦截'}
            </button>
          ))}
        </div>

        {/* 状态过滤 */}
        <div className="flex gap-1">
          {ALL_STATUSES.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`text-xs px-2 py-1 rounded-full border transition-colors ${
                selectedStatuses.has(status)
                  ? STATUS_COLORS[status] + ' border-current'
                  : 'border-gray-200 dark:border-gray-700 text-gray-400'
              }`}
            >
              {status === 'active' ? '活跃' : status === 'degraded' ? '降级' : status === 'failed' ? '失败' : status === 'disabled' ? '停用' : '归档'}
            </button>
          ))}
        </div>

        {/* 仅可用 */}
        <button
          onClick={() => setOnlyOk(!onlyOk)}
          className={`text-xs px-2 py-1 rounded-full border transition-colors ${
            onlyOk
              ? 'bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400'
              : 'border-gray-200 dark:border-gray-700 text-gray-400'
          }`}
        >
          ✅ 仅可用
        </button>
      </div>

      {/* 加载状态 */}
      {loading && sources.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-4xl mb-4 animate-pulse">📡</div>
            <p className="text-gray-500 dark:text-gray-400">正在从 comicfs 加载远程书源...</p>
          </div>
        </div>
      )}

      {/* 空状态 */}
      {!loading && sources.length === 0 && !error && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="text-4xl mb-4">📭</div>
            <p className="text-gray-500 dark:text-gray-400">没有匹配的远程书源</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              尝试调整过滤条件或点击「刷新远程源」
            </p>
          </div>
        </div>
      )}

      {/* 源列表 */}
      {sources.length > 0 && (
        <div className="grid gap-3">
          {sources.map((src) => (
            <div
              key={src.id}
              className={`card rounded-lg border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden transition-opacity ${
                src.locallyDisabled ? 'opacity-60' : ''
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  {/* 左侧信息 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-medium text-gray-900 dark:text-white truncate">
                        {src.name}
                      </h3>
                      {/* 风险等级 */}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${RISK_COLORS[src.riskLevel] || 'bg-gray-100'}`}>
                        {src.riskLevel === 'low' ? '🟢 低风险' : src.riskLevel === 'medium' ? '🟡 中风险' : src.riskLevel === 'high' ? '🟠 高风险' : '🔴 已拦截'}
                      </span>
                      {/* 状态 */}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${STATUS_COLORS[src.status] || 'bg-gray-100'}`}>
                        {src.status}
                      </span>
                      {/* 语言 */}
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                        {src.language}
                      </span>
                      {/* 健康 */}
                      {src.checkedAt && (
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-full ${
                            src.ok
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          }`}
                          title={src.healthReason}
                        >
                          {src.ok ? '✅' : '❌'} {src.healthReason}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate font-mono">
                      {src.host}
                    </p>
                  </div>

                  {/* 右侧操作 */}
                  <div className="flex items-center gap-2 shrink-0">
                    {/* 详情按钮 */}
                    <button
                      onClick={() => setExpandedId(expandedId === src.id ? null : src.id)}
                      className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 underline"
                    >
                      {expandedId === src.id ? '收起' : '详情'}
                    </button>

                    {/* 本地开关 */}
                    <button
                      onClick={() => handleToggleLocal(src.id, !src.locallyEnabled)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                        src.locallyEnabled
                          ? 'bg-primary-500'
                          : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                      title={src.locallyEnabled ? '已启用（点击禁用）' : '已禁用（点击启用）'}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                          src.locallyEnabled ? 'translate-x-[18px]' : 'translate-x-[2px]'
                        }`}
                      />
                    </button>
                  </div>
                </div>

                {/* 展开详情 */}
                {expandedId === src.id && (
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                    <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div>
                        <dt className="text-gray-400">ID</dt>
                        <dd className="text-gray-700 dark:text-gray-300 font-mono truncate" title={src.id}>
                          {src.id}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">版本</dt>
                        <dd className="text-gray-700 dark:text-gray-300">{src.version}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">权重</dt>
                        <dd className="text-gray-700 dark:text-gray-300">{src.weight}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">失败次数</dt>
                        <dd className="text-gray-700 dark:text-gray-300">{src.failureCount}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">默认启用</dt>
                        <dd className="text-gray-700 dark:text-gray-300">{src.enabledByDefault ? '是' : '否'}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">健康检查</dt>
                        <dd className="text-gray-700 dark:text-gray-300">{formatTime(src.checkedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">健康原因</dt>
                        <dd className="text-gray-700 dark:text-gray-300 truncate" title={src.healthReason}>
                          {src.healthReason || '-'}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-gray-400">本地状态</dt>
                        <dd className={src.locallyEnabled ? 'text-green-600' : 'text-red-500'}>
                          {src.locallyEnabled ? '已启用' : '已禁用'}
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 底部加载指示器 */}
      {loading && sources.length > 0 && (
        <div className="flex items-center justify-center py-8">
          <span className="text-sm text-gray-400 animate-pulse">更新中...</span>
        </div>
      )}
    </div>
  );
}
