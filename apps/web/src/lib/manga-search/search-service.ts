// ============================================================
// 聚合搜索服务 — 编排层
//   获取 comicfs 活跃源 → 并发搜索 → 聚合结果 → 去重
// ============================================================
import { getActiveSources, refreshRemoteSources } from '@/lib/comicfs/source-loader';
import { fetchSourceById } from '@/lib/comicfs/client';
import { resolveSearchUrl, cleanHost } from './url-resolver';
import { parseSearchResponse } from './source-parser';
import { dedupeResults } from './dedupe-results';
import type {
  MangaSearchResult,
  SearchResponse,
  SearchSourceError,
  SearchOptions,
  ComicfsSource,
} from './types';

// ---- 默认配置 ----
const DEFAULT_MAX_SOURCES = 10;
const DEFAULT_SOURCE_TIMEOUT_MS = 8000;
const DEFAULT_CONCURRENCY = 3;

// ---- 日志前缀 ----
const LOG = '[manga-search]';

/**
 * 聚合搜索主入口
 */
export async function aggregatedSearch(
  options: SearchOptions & { dryRun?: boolean },
): Promise<SearchResponse> {
  const {
    keyword,
    maxSources = DEFAULT_MAX_SOURCES,
    sourceTimeoutMs = DEFAULT_SOURCE_TIMEOUT_MS,
    concurrency = DEFAULT_CONCURRENCY,
    dedupe = true,
    dryRun = false,
  } = options;

  const startTime = Date.now();
  const errors: SearchSourceError[] = [];

  if (!keyword?.trim()) {
    return makeResponse(keyword || '', [], 0, 0, 0, [], [makeError('*', 'input', 'keyword is required', 'search-api')]);
  }

  // ─── 1. 获取活跃源（带重试） ───
  let sourceSummaries: Awaited<ReturnType<typeof getActiveSources>>['sources'] = [];
  let loadError: string | undefined;

  // 首次尝试
  try {
    const result = await getActiveSources({ onlyOk: false });
    sourceSummaries = result.sources;
    loadError = result.error;

    console.log(`${LOG} getActiveSources: ${sourceSummaries.length} sources (fromCache=${result.fromCache}, error=${loadError || 'none'})`);
  } catch (err) {
    console.error(`${LOG} getActiveSources exception:`, err);
    loadError = String(err);
  }

  // 重试：如果为 0，先刷新再试
  if (sourceSummaries.length === 0) {
    console.log(`${LOG} 0 active sources, trying refreshRemoteSources...`);
    try {
      const refreshed = await refreshRemoteSources();
      console.log(`${LOG} refreshRemoteSources ok: ${refreshed.index.count} total`);

      const retry = await getActiveSources({ onlyOk: false });
      sourceSummaries = retry.sources;
      console.log(`${LOG} after refresh: ${sourceSummaries.length} active sources`);
    } catch (err) {
      console.error(`${LOG} refreshRemoteSources failed:`, err);
    }
  }

  if (sourceSummaries.length === 0) {
    return makeResponse(
      keyword,
      [],
      0,
      0,
      0,
      [],
      [makeError('*', 'comicfs', loadError || 'No active comicfs sources loaded — visit /settings/sources to refresh', 'source-loader')],
    );
  }

  // ─── 2. 选源：low 优先，限制数量 ───
  const riskOrder: Record<string, number> = { low: 0, medium: 1, high: 2, blocked: 3 };
  const selectedSources = sourceSummaries
    .filter((s) => {
      // 放宽过滤：riskLevel 非 blocked/high 均可
      if (s.riskLevel === 'blocked' || s.riskLevel === 'high') return false;
      // status 非 active 跳过
      if (s.status !== 'active') return false;
      // health.ok 明确为 false 时才过滤
      if (s.healthReason === 'network-unreachable' || (s.checkedAt && !s.ok)) return false;
      return true;
    })
    .sort((a, b) => (riskOrder[a.riskLevel] ?? 9) - (riskOrder[b.riskLevel] ?? 9))
    .slice(0, maxSources);

  console.log(
    `${LOG} selected ${selectedSources.length}/${sourceSummaries.length} sources for search`,
    selectedSources.slice(0, 3).map((s) => ({ id: s.id, name: s.name, riskLevel: s.riskLevel })),
  );

  // ─── 3. dryRun 模式：只返回源信息，不实际请求 ───
  if (dryRun) {
    const dryRunSources: Array<Record<string, unknown>> = [];
    for (const s of selectedSources.slice(0, 10)) {
      const host = cleanHost(s.host);
      let searchUrl = '';
      let fetchError: string | undefined;
      try {
        const fullSource = await fetchSourceById(s.id);
        if (fullSource?.search?.path) {
          searchUrl = resolveSearchUrl(fullSource.search.path, keyword, host);
        } else {
          fetchError = 'no search.path in source rule';
        }
      } catch (err) {
        fetchError = String(err);
      }
      dryRunSources.push({
        sourceId: s.id,
        sourceName: s.name,
        host,
        riskLevel: s.riskLevel,
        searchPath: '',
        finalSearchUrl: searchUrl,
        fetchError,
      });
    }

    return {
      ok: true,
      keyword,
      total: 0,
      durationMs: Date.now() - startTime,
      sourceCount: selectedSources.length,
      successSourceCount: 0,
      failedSourceCount: 0,
      results: [],
      errors: [],
      dryRun: true,
      dryRunSources,
    } as SearchResponse & { dryRun: boolean; dryRunSources: unknown[] };
  }

  // ─── 4. 并发搜索 ───
  const startedCount = selectedSources.length;
  const sourceResults = await concurrentSearch(
    selectedSources.map((s) => ({ id: s.id, name: s.name, host: s.host })),
    keyword,
    concurrency,
    sourceTimeoutMs,
    errors,
  );

  // ─── 5. 聚合 ───
  const allResults: MangaSearchResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const sr of sourceResults) {
    if (sr.status === 'fulfilled' && sr.value.length > 0) {
      allResults.push(...sr.value);
      successCount++;
    } else if (sr.status === 'rejected') {
      failCount++;
    } else {
      // fulfilled but empty → still counted as success
      successCount++;
    }
  }

  // ─── 6. 去重 + 排序 ───
  const finalResults = dedupe ? dedupeResults(allResults) : allResults;
  finalResults.sort((a, b) => (b.weight || 0) - (a.weight || 0));

  return makeResponse(keyword, finalResults, startedCount, successCount, failCount, errors, []);
}

// ==================== 响应构造 ====================

function makeResponse(
  keyword: string,
  results: MangaSearchResult[],
  sourceCount: number,
  successSourceCount: number,
  failedSourceCount: number,
  errors: SearchSourceError[],
  extraErrors: SearchSourceError[],
): SearchResponse {
  const allErrors = [...errors, ...extraErrors];
  return {
    ok: allErrors.length === 0,
    keyword,
    total: results.length,
    durationMs: 0,
    sourceCount,
    successSourceCount,
    failedSourceCount,
    results,
    errors: allErrors,
  };
}

function makeError(sourceId: string, sourceName: string, reason: string, scope = 'source'): SearchSourceError {
  return { sourceId, sourceName, reason, scope } as SearchSourceError;
}

// ==================== 并发搜索 ====================

interface SourceRef {
  id: string;
  name: string;
  host: string;
}

type SourceSearchResult = PromiseSettledResult<MangaSearchResult[]>;

async function concurrentSearch(
  sources: SourceRef[],
  keyword: string,
  concurrency: number,
  sourceTimeoutMs: number,
  errors: SearchSourceError[],
): Promise<SourceSearchResult[]> {
  // 每个源独立 try/catch，包装成 PromiseSettledResult
  const tasks: Array<() => Promise<MangaSearchResult[]>> = sources.map((source) => {
    return async () => {
      try {
        return await searchOneSource(source, keyword, sourceTimeoutMs);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        errors.push({
          sourceId: source.id,
          sourceName: source.name,
          reason: reason.length > 200 ? reason.slice(0, 200) + '...' : reason,
          scope: 'source',
        } as SearchSourceError);
        throw err; // re-throw so Promise.allSettled captures it
      }
    };
  });

  // 限流执行，收集 settled results
  return runWithConcurrencyLimitSettled(tasks, concurrency);
}

/**
 * 限流执行 + 返回 PromiseSettledResult[]
 */
async function runWithConcurrencyLimitSettled<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const results: PromiseSettledResult<T>[] = [];
  const executing: Array<Promise<void>> = [];

  for (const task of tasks) {
    const idx = results.length;
    results.push({ status: 'pending' } as unknown as PromiseSettledResult<T>);

    const p = task()
      .then((value) => {
        results[idx] = { status: 'fulfilled', value };
      })
      .catch((reason) => {
        results[idx] = { status: 'rejected', reason };
      });

    executing.push(p);

    if (executing.length >= limit) {
      // 等待任意一个完成
      await Promise.race(executing);
      // 移除已完成的
      for (let i = executing.length - 1; i >= 0; i--) {
        // 检查是否已完成
        const settled = await reflect(executing[i]);
        if (settled) executing.splice(i, 1);
      }
    }
  }

  await Promise.allSettled(executing);
  return results;
}

/** 检查 promise 是否已完成 */
async function reflect(p: Promise<unknown>): Promise<boolean> {
  try {
    const result = await Promise.race([
      p.then(() => 'done' as const),
      new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 0)),
    ]);
    return result === 'done';
  } catch {
    return true; // rejected = done
  }
}

// ==================== 单源搜索 ====================

async function searchOneSource(
  source: SourceRef,
  keyword: string,
  timeoutMs: number,
): Promise<MangaSearchResult[]> {
  const host = cleanHost(source.host);

  // 1. 获取完整源规则
  let fullSource: ComicfsSource | null = null;
  try {
    fullSource = await fetchSourceById(source.id);
  } catch (err) {
    throw new Error(`rule-fetch-failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  if (!fullSource?.search?.path) {
    throw new Error(`no-search-rule`);
  }

  // 2. 解析搜索 URL
  const searchUrl = resolveSearchUrl(fullSource.search.path, keyword, host);

  console.log(`${LOG} [${source.name}] host=${host} path=${fullSource.search.path} → ${searchUrl}`);

  // 3. URL 校验
  if (!searchUrl || !/^https?:\/\//i.test(searchUrl)) {
    throw new Error(`invalid-search-url: ${searchUrl}`);
  }

  // 4. 请求目标站（域名 failover: cn.xxx → www.xxx）
  const results = await fetchWithDomainFailover(searchUrl, host, fullSource, source, keyword, timeoutMs);
  return results;
}

// ==================== 域名 Failover ====================

const FAILOVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

async function fetchWithDomainFailover(
  searchUrl: string,
  host: string,
  fullSource: ComicfsSource,
  source: SourceRef,
  keyword: string,
  timeoutMs: number,
): Promise<MangaSearchResult[]> {
  // 尝试的 URL 列表：原始 URL + failover URLs
  const urlsToTry: string[] = [searchUrl];

  // 生成域名 failover：cn.xxx → www.xxx, m.xxx
  try {
    const urlObj = new URL(searchUrl);
    const hostname = urlObj.hostname;
    if (hostname.startsWith('cn.') || hostname.startsWith('m.')) {
      const parts = hostname.split('.');
      const baseDomain = parts.slice(1).join('.');
      // 尝试 www 子域名
      if (hostname.startsWith('cn.')) {
        urlObj.hostname = `www.${baseDomain}`;
        urlsToTry.push(urlObj.toString());
      }
      if (hostname.startsWith('www.') || hostname.startsWith('cn.')) {
        urlObj.hostname = `m.${baseDomain}`;
        urlsToTry.push(urlObj.toString());
      }
    }
  } catch {
    // URL parse error, just use original
  }

  let lastError: Error | null = null;

  for (const url of urlsToTry) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { ...FAILOVER_HEADERS, Referer: host },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || undefined;
      const body = await response.text();

      if (!body || body.length < 100) {
        return [];
      }

      const results = parseSearchResponse(fullSource, body, contentType);
      console.log(`${LOG} [${source.name}] parsed ${results.length} results from ${url}`);
      return results;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error('timeout');
      }
      console.log(`${LOG} [${source.name}] failover try ${url}: ${lastError.message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError || new Error('all-failover-exhausted');
}
