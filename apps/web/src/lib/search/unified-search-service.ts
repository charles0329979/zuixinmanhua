// ============================================================
// 统一搜索服务 — 编排层
// comicfs 活跃源 → verified 过滤 → 并发搜索 → 解析 → 聚合
// ============================================================
import { getActiveSources, refreshRemoteSources } from '@/lib/comicfs/source-loader';
import { fetchSourceById } from '@/lib/comicfs/client';
import { adaptLegadoSearch } from './legado-search-adapter';
import { fetchHtml } from './fetch-html';
import { parseHtmlResults } from './parse-html-results';
import type {
  UnifiedSearchResult,
  UnifiedSearchError,
  UnifiedSearchResponse,
  UnifiedSearchOptions,
  DryRunSource,
  SearchDiagnostics,
} from './types';
import {
  DEFAULT_MAX_SOURCES,
  DEFAULT_CONCURRENCY,
  DEFAULT_SOURCE_TIMEOUT_MS,
} from './types';

// ---- Verified 源管理器 ----
interface VerifiedSourceEntry {
  id: string;
  name: string;
  verifiedAt: string;
  keyword: string;
  parsedCount: number;
  finalSearchUrl: string;
}

interface VerifiedConfig {
  enabled: boolean;
  sources: VerifiedSourceEntry[];
}

let VERIFIED_CACHE: VerifiedConfig | null = null;

async function getVerifiedConfig(): Promise<VerifiedConfig> {
  if (VERIFIED_CACHE) return VERIFIED_CACHE;
  try {
    const mod = await import('@/config/verified-search-sources.json');
    VERIFIED_CACHE = (mod.default || mod) as VerifiedConfig;
  } catch {
    VERIFIED_CACHE = { enabled: false, sources: [] };
  }
  return VERIFIED_CACHE!;
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
  let allSources: Awaited<ReturnType<typeof getActiveSources>>['sources'] = [];
  try {
    const result = await getActiveSources({ onlyOk: false });
    allSources = result.sources;
  } catch { /* fall through */ }

  if (allSources.length === 0) {
    try {
      await refreshRemoteSources();
      const retry = await getActiveSources({ onlyOk: false });
      allSources = retry.sources;
    } catch { /* fall through */ }
  }

  if (allSources.length === 0) {
    return makeResponse(keyword, dryRun, 0, 0, 0, startTime, [], [], [{
      sourceId: '*',
      sourceName: 'comicfs',
      reason: 'No active sources loaded. Check comicfs connectivity.',
      scope: 'source-loader',
    }]);
  }

  // 2. 过滤低/中风险 + active
  let candidates = allSources.filter((s) => {
    if (s.riskLevel !== 'low' && s.riskLevel !== 'medium') return false;
    if (s.status !== 'active') return false;
    if (s.healthReason === 'network-unreachable') return false;
    return true;
  });

  // 3. Verified 源优先
  const verified = await getVerifiedConfig();
  let selected = candidates;
  let usingVerified = false;

  if (verified.enabled && verified.sources.length > 0) {
    // 只使用验证通过的源
    const verifiedIds = new Set(verified.sources.map((v) => v.id));
    selected = candidates.filter((s) => verifiedIds.has(s.id));
    usingVerified = true;
  } else {
    // 回退：取前 N 个候选源
    const riskOrder: Record<string, number> = { low: 0, medium: 1 };
    selected.sort((a, b) => (riskOrder[a.riskLevel] ?? 9) - (riskOrder[b.riskLevel] ?? 9));
    selected = selected.slice(0, maxSources);
  }

  // 4. Dry-run: 只返回 URL 信息，不实际搜索
  if (dryRun) {
    const dryRunSources: DryRunSource[] = [];
    for (const s of selected.slice(0, 10)) {
      let searchPath = '(not loaded)';
      let finalSearchUrl = '(not built)';
      try {
        const full = await fetchSourceById(s.id);
        if (full) {
          const adapted = adaptLegadoSearch(
            full as unknown as Record<string, unknown>,
            keyword,
          );
          searchPath = adapted.ok ? adapted.config.urlTemplate : adapted.reason;
          finalSearchUrl = adapted.ok ? adapted.url : '(build failed)';
        }
      } catch {
        finalSearchUrl = '(fetch error)';
      }
      dryRunSources.push({
        sourceId: s.id,
        sourceName: s.name,
        host: s.host,
        searchPath,
        finalSearchUrl,
        riskLevel: s.riskLevel,
      });
    }
    return makeResponse(keyword, true, selected.length, 0, 0, startTime, [], dryRunSources, []);
  }

  // 5. 并发搜索
  const tasks = selected.map((s) => async (): Promise<UnifiedSearchResult[]> => {
    try {
      return await searchOneSource(s.id, s.name, s.host, keyword);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push({
        sourceId: s.id,
        sourceName: s.name,
        reason: msg,
        scope: 'source',
      });
      // Return empty array so Promise.allSettled doesn't break
      return [];
    }
  });

  const settled = await runLimited(tasks, concurrency);
  const allResults: UnifiedSearchResult[] = [];
  let successCount = 0;
  let failCount = 0;

  for (const s of settled) {
    if (s.status === 'fulfilled') {
      allResults.push(...s.value);
      successCount++;
    } else {
      failCount++;
    }
  }

  // 按权重排序
  allResults.sort((a, b) => (b.weight || 0) - (a.weight || 0));

  // 6. 构建诊断信息
  const diag: SearchDiagnostics | undefined =
    allResults.length === 0 && selected.length > 0
      ? {
          reason: 'NO_PARSED_RESULTS',
          hint: 'Remote sources connected, but no parser matched. Run /api/debug/search-sources.',
          suggestedAction: 'pnpm verify:search-sources',
          debugUrl: `/api/debug/search-sources?keyword=${encodeURIComponent(keyword)}&limit=20`,
          mode: usingVerified ? 'verified' : 'fallback',
          verifiedCount: usingVerified ? verified.sources.length : 0,
          attemptedSources: selected.map((s) => ({
            id: s.id,
            name: s.name,
            host: s.host,
          })),
          errors: errors.slice(0, 10),
        }
      : undefined;

  return makeResponse(
    keyword,
    false,
    selected.length,
    successCount,
    failCount,
    startTime,
    allResults,
    undefined,
    errors,
    diag,
  );
}

// ==================== 单源搜索 ====================

async function searchOneSource(
  sourceId: string,
  sourceName: string,
  host: string,
  keyword: string,
): Promise<UnifiedSearchResult[]> {
  // 获取完整源规则
  let fullSource: Record<string, unknown>;
  try {
    fullSource = (await fetchSourceById(sourceId)) as unknown as Record<string, unknown>;
    if (!fullSource) throw new Error('source not found');
  } catch (err) {
    throw new Error(
      `rule-fetch: ${err instanceof Error ? err.message : 'unknown'}`,
    );
  }

  // 使用 Legado 适配器构建 URL
  const adapted = adaptLegadoSearch(fullSource, keyword);
  if (!adapted.ok) {
    throw new Error(`${adapted.error}: ${adapted.reason}`);
  }

  // 请求 HTML (使用净化后的 headers)
  const htmlResult = await fetchHtml(adapted.url, host, adapted.config.headers);
  if (!htmlResult.ok) {
    throw new Error(
      `${htmlResult.error.code}: ${htmlResult.error.message}`,
    );
  }

  // 解析结果
  const parsed = parseHtmlResults(fullSource, htmlResult.body);
  if ('reason' in parsed) {
    throw new Error(`parse: ${parsed.reason}`);
  }

  return parsed;
}

// ==================== 辅助 ====================

interface Diagnostics {
  reason: string;
  hint: string;
  suggestedAction: string;
  debugUrl: string;
  mode: string;
  verifiedCount: number;
  attemptedSources: Array<{ id: string; name: string; host: string }>;
  errors: UnifiedSearchError[];
}

function makeResponse(
  keyword: string,
  dryRun: boolean,
  sourceCount: number,
  successCount: number,
  failCount: number,
  startTime: number,
  results: UnifiedSearchResult[],
  dryRunSources: DryRunSource[] | undefined,
  errors: UnifiedSearchError[],
  diagnostics?: SearchDiagnostics,
): UnifiedSearchResponse {
  return {
    ok: errors.length === 0 && results.length > 0,
    keyword,
    dryRun,
    sourceCount,
    successSourceCount: successCount,
    failedSourceCount: failCount,
    durationMs: Date.now() - startTime,
    results,
    errors,
    ...(dryRunSources ? { sources: dryRunSources } : {}),
    ...(diagnostics ? { diagnostics } : {}),
  };
}

async function runLimited<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<PromiseSettledResult<T>[]> {
  const out: PromiseSettledResult<T>[] = new Array(tasks.length);
  const running: Promise<void>[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const idx = i;
    const p = tasks[idx]()
      .then((v) => {
        out[idx] = { status: 'fulfilled' as const, value: v };
      })
      .catch((r) => {
        out[idx] = { status: 'rejected' as const, reason: r };
      });
    running.push(p);

    if (running.length >= limit) {
      await Promise.race(running);
      // Remove settled promises
      for (let j = running.length - 1; j >= 0; j--) {
        const done = await isSettled(running[j]);
        if (done) running.splice(j, 1);
      }
    }
  }

  await Promise.allSettled(running);
  return out.filter((e) => e !== undefined);
}

async function isSettled(p: Promise<unknown>): Promise<boolean> {
  const result = await Promise.race([
    p.then(() => 'done' as const),
    new Promise<'pending'>((res) => setTimeout(() => res('pending'), 1)),
  ]);
  return result === 'done';
}
