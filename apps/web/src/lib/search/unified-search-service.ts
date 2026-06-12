// ============================================================
// 统一搜索服务 — 编排层
// comicfs 活跃源 → 过滤 → 并发搜索 → 解析 → 聚合
// ============================================================
import { getActiveSources, refreshRemoteSources } from '@/lib/comicfs/source-loader';
import { fetchSourceById } from '@/lib/comicfs/client';
import { extractSearchUrlTemplate, buildSearchUrl } from './build-search-url';
import { fetchHtml } from './fetch-html';
import { parseHtmlResults } from './parse-html-results';
import type {
  UnifiedSearchResult, UnifiedSearchError,
  UnifiedSearchResponse, UnifiedSearchOptions,
  DryRunSource,
} from './types';
import {
  DEFAULT_MAX_SOURCES, DEFAULT_CONCURRENCY, DEFAULT_SOURCE_TIMEOUT_MS,
} from './types';

// ---- 可搜索源白名单 ----
let WHITELIST_CACHE: { enabled: boolean; sourceIds: string[]; verified: Array<{ id: string }> } | null = null;

async function getWhitelist(): Promise<{ enabled: boolean; sourceIds: string[]; verified: Array<{ id: string }> }> {
  if (WHITELIST_CACHE) return WHITELIST_CACHE;
  try {
    const mod = await import('@/config/searchable-sources.json');
    WHITELIST_CACHE = mod.default || mod;
  } catch {
    WHITELIST_CACHE = { enabled: false, sourceIds: [], verified: [] };
  }
  return WHITELIST_CACHE!;
}

// ---- 主入口 ----

export async function unifiedSearch(
  options: UnifiedSearchOptions,
): Promise<UnifiedSearchResponse> {
  const {
    keyword,
    maxSources = DEFAULT_MAX_SOURCES,
    concurrency = DEFAULT_CONCURRENCY,
    sourceTimeoutMs = DEFAULT_SOURCE_TIMEOUT_MS,
    dryRun = false,
  } = options;

  const startTime = Date.now();
  const errors: UnifiedSearchError[] = [];

  // 1. 获取活跃源
  let sources: Awaited<ReturnType<typeof getActiveSources>>['sources'] = [];
  try {
    const result = await getActiveSources({ onlyOk: false });
    sources = result.sources;
  } catch { /* fall through */ }

  if (sources.length === 0) {
    try {
      await refreshRemoteSources();
      const retry = await getActiveSources({ onlyOk: false });
      sources = retry.sources;
    } catch { /* fall through */ }
  }

  if (sources.length === 0) {
    return makeResponse(keyword, dryRun, 0, 0, 0, startTime, [], [],
      [{ sourceId: '*', sourceName: 'comicfs', reason: 'No active sources loaded', scope: 'source-loader' }]);
  }

  // 2. 过滤 + 白名单
  const whitelist = await getWhitelist();
  let selected = sources.filter((s) => {
    if (s.riskLevel !== 'low' && s.riskLevel !== 'medium') return false;
    if (s.status !== 'active') return false;
    if (s.healthReason === 'network-unreachable') return false;
    if (s.checkedAt && !s.ok) return false;
    return true;
  });

  if (whitelist.enabled && whitelist.verified.length > 0) {
    const idSet = new Set(whitelist.verified.map((v) => v.id));
    selected = selected.filter((s) => idSet.has(s.id));
  } else if (whitelist.enabled && whitelist.sourceIds.length > 0) {
    const idSet = new Set(whitelist.sourceIds);
    selected = selected.filter((s) => idSet.has(s.id));
  }

  const riskOrder: Record<string, number> = { low: 0, medium: 1 };
  selected.sort((a, b) => (riskOrder[a.riskLevel] ?? 9) - (riskOrder[b.riskLevel] ?? 9));
  selected = selected.slice(0, maxSources);

  // 3. Dry-run: 只返回 URL 信息
  if (dryRun) {
    const dryRunSources: DryRunSource[] = [];
    for (const s of selected.slice(0, 10)) {
      let searchPath = '';
      let finalSearchUrl = '';
      try {
        const full = await fetchSourceById(s.id);
        if (full) {
          searchPath = extractSearchUrlTemplate(full as unknown as Record<string, unknown>) || '(none)';
          finalSearchUrl = buildSearchUrl(searchPath, keyword, s.host) || '(invalid)';
        }
      } catch { finalSearchUrl = '(fetch error)'; }
      dryRunSources.push({ sourceId: s.id, sourceName: s.name, host: s.host, searchPath, finalSearchUrl, riskLevel: s.riskLevel });
    }
    return makeResponse(keyword, true, selected.length, 0, 0, startTime, [], dryRunSources, []);
  }

  // 4. 并发搜索
  const tasks = selected.map((s) => async (): Promise<UnifiedSearchResult[]> => {
    try {
      return await searchOneSource(s.id, s.name, s.host, keyword, sourceTimeoutMs);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({ sourceId: s.id, sourceName: s.name, reason: msg, scope: 'source' });
      throw err;
    }
  });

  const settled = await runLimited(tasks, concurrency);
  const allResults: UnifiedSearchResult[] = [];
  let successCount = 0;
  let failCount = 0;
  for (const s of settled) {
    if (s.status === 'fulfilled') { allResults.push(...s.value); successCount++; }
    else { failCount++; }
  }

  // 按权重排序
  allResults.sort((a, b) => (b.weight || 0) - (a.weight || 0));

  return makeResponse(keyword, false, selected.length, successCount, failCount, startTime, allResults, undefined, errors);
}

// ==================== 单源搜索 ====================

async function searchOneSource(
  sourceId: string, sourceName: string, host: string,
  keyword: string, timeoutMs: number,
): Promise<UnifiedSearchResult[]> {
  // 获取完整源规则
  let fullSource: Record<string, unknown>;
  try {
    fullSource = (await fetchSourceById(sourceId)) as unknown as Record<string, unknown>;
    if (!fullSource) throw new Error('source not found');
  } catch (err) {
    throw new Error(`rule-fetch: ${err instanceof Error ? err.message : 'unknown'}`);
  }

  // 构造 URL
  const template = extractSearchUrlTemplate(fullSource);
  if (!template) throw new Error('no search URL template');

  const searchUrl = buildSearchUrl(template, keyword, host);
  if (!searchUrl) throw new Error(`unsafe URL: ${template}`);

  // 请求 HTML
  const htmlResult = await fetchHtml(searchUrl, host);
  if (!htmlResult.ok) throw new Error(htmlResult.error.code + ': ' + htmlResult.error.message);

  // 解析结果
  const parsed = parseHtmlResults(fullSource, htmlResult.body);
  if ('reason' in parsed) throw new Error(parsed.reason);

  return parsed;
}

// ==================== 辅助 ====================

function makeResponse(
  keyword: string, dryRun: boolean,
  sourceCount: number, successCount: number, failCount: number,
  startTime: number,
  results: UnifiedSearchResult[],
  sources: DryRunSource[] | undefined,
  errors: UnifiedSearchError[],
): UnifiedSearchResponse {
  return {
    ok: errors.length === 0,
    keyword, dryRun,
    sourceCount, successSourceCount: successCount, failedSourceCount: failCount,
    durationMs: Date.now() - startTime,
    results, errors,
    ...(sources ? { sources } : {}),
  };
}

async function runLimited<T>(
  tasks: Array<() => Promise<T>>, limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(tasks.length);
  const running: Promise<void>[] = [];
  for (let i = 0; i < tasks.length; i++) {
    const idx = i;
    const p = tasks[idx]().then((v) => { out[idx] = { status: 'fulfilled', value: v }; }).catch((r) => { out[idx] = { status: 'rejected', reason: r }; });
    running.push(p);
    if (running.length >= limit) {
      await Promise.race(running);
      for (let j = running.length - 1; j >= 0; j--) {
        const done = await isDone(running[j]);
        if (done) running.splice(j, 1);
      }
    }
  }
  await Promise.allSettled(running);
  return out.filter((e) => e !== undefined);
}

async function isDone(p: Promise<unknown>): Promise<boolean> {
  const r = await Promise.race([p.then(() => 'done'), new Promise<'pending'>((res) => setTimeout(() => res('pending'), 1))]);
  return r === 'done';
}
