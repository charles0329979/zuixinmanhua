// ============================================================
// 单源诊断 — 逐步检测搜索链路的每个阶段
// 使用 legado-search-adapter + 净化的 fetch
// ============================================================
import { fetchSourceById } from '@/lib/comicfs/client';
import { adaptLegadoSearch } from './legado-search-adapter';
import { fetchHtml, type FetchErrorCode } from './fetch-html';
import { parseHtmlResults } from './parse-html-results';
import { cleanHost } from '@/lib/manga-search/url-resolver';

// ---- 诊断步骤 ----
export interface DiagnosisSteps {
  sourceLoaded: boolean;
  searchRuleFound: boolean;
  searchUrlBuilt: boolean;
  urlSafe: boolean;
  fetchOk: boolean;
  httpStatus: number;
  contentType: string;
  htmlLength: number;
  containsKeyword: boolean;
  selectorFound: boolean;
  itemCount: number;
  parsedCount: number;
}

export interface DiagnosisResult {
  ok: boolean;
  sourceId: string;
  sourceName: string;
  host: string;
  keyword: string;
  failedAt: DiagnosisFailedAt | null;
  error: {
    code: string;
    message: string;
    url?: string;
    cause?: string;
  } | null;
  steps: DiagnosisSteps;
  search: {
    rawSearchUrl: string;
    finalSearchUrl: string;
    listSelector: string;
    titleSelector: string;
    urlSelector: string;
    coverSelector: string;
  };
  sampleResults: Array<{ title: string; detailUrl: string; cover: string | null }>;
}

export type DiagnosisFailedAt =
  | 'source-load'
  | 'search-rule'
  | 'url-build'
  | 'safe-url'
  | 'fetch'
  | 'http-status'
  | 'content-type'
  | 'selector'
  | 'parse';

function emptySteps(): DiagnosisSteps {
  return {
    sourceLoaded: false,
    searchRuleFound: false,
    searchUrlBuilt: false,
    urlSafe: false,
    fetchOk: false,
    httpStatus: 0,
    contentType: '',
    htmlLength: 0,
    containsKeyword: false,
    selectorFound: false,
    itemCount: 0,
    parsedCount: 0,
  };
}

function emptySearch(): DiagnosisResult['search'] {
  return { rawSearchUrl: '', finalSearchUrl: '', listSelector: '', titleSelector: '', urlSelector: '', coverSelector: '' };
}

// ---- 主诊断函数 ----

export async function diagnoseSourceSearch(
  sourceId: string,
  keyword: string,
  _options?: { timeoutMs?: number },
): Promise<DiagnosisResult> {
  const search = emptySearch();
  const sampleResults: DiagnosisResult['sampleResults'] = [];

  // Step 1: Load source from comicfs
  let fullSource: Record<string, unknown>;
  let sourceName = sourceId;
  let host = '';

  try {
    const fetched = await fetchSourceById(sourceId);
    if (!fetched) throw new Error('source not found in comicfs');
    fullSource = fetched as unknown as Record<string, unknown>;
    sourceName = (fullSource.name as string) || sourceId;
    host = cleanHost((fullSource.host as string) || '');
  } catch (err) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'source-load', {
      code: 'SOURCE_NOT_FOUND',
      message: err instanceof Error ? err.message : String(err),
    }, emptySteps(), search, []);
  }

  const steps = emptySteps();
  steps.sourceLoaded = true;

  // Step 2: Extract search URL via Legado adapter
  const adapted = adaptLegadoSearch(fullSource, keyword);

  if (!adapted.ok) {
    const failedAtMap: Record<string, DiagnosisFailedAt> = {
      NO_SEARCH_URL: 'search-rule',
      URL_BUILD_FAILED: 'url-build',
      UNSUPPORTED_SEARCH_METHOD: 'url-build',
    };
    return makeResult(
      sourceId, sourceName, host, keyword, false,
      failedAtMap[adapted.error] || 'search-rule',
      { code: adapted.error, message: adapted.reason },
      steps, search, [],
    );
  }

  search.rawSearchUrl = adapted.config.urlTemplate;
  search.finalSearchUrl = adapted.url;
  search.listSelector = adapted.config.listSelector;
  search.titleSelector = adapted.config.titleSelector;
  search.urlSelector = adapted.config.detailUrlSelector;
  search.coverSelector = adapted.config.coverSelector;

  steps.searchRuleFound = true;
  steps.searchUrlBuilt = true;
  steps.urlSafe = true;

  // Step 3: Fetch HTML
  const htmlResult = await fetchHtml(adapted.url, host, adapted.config.headers);

  if (!htmlResult.ok) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'fetch', {
      code: htmlResult.error.code,
      message: htmlResult.error.message,
      url: htmlResult.error.url,
      cause: htmlResult.error.cause,
    }, steps, search, []);
  }

  steps.fetchOk = true;
  steps.httpStatus = htmlResult.httpStatus;
  steps.contentType = htmlResult.contentType;
  steps.htmlLength = htmlResult.body.length;
  steps.containsKeyword = htmlResult.body.includes(keyword);

  // Step 4: Check selectors
  if (!search.listSelector) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'selector', {
      code: 'MISSING_SELECTOR',
      message: 'Missing search list selector in source rule',
    }, steps, search, []);
  }
  steps.selectorFound = true;

  // Step 5: Parse HTML
  const parsed = parseHtmlResults(fullSource, htmlResult.body);
  if ('reason' in parsed) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'parse', {
      code: 'PARSE_ERROR',
      message: parsed.reason,
    }, steps, search, []);
  }

  steps.parsedCount = parsed.length;

  for (const r of parsed.slice(0, 5)) {
    sampleResults.push({
      title: r.title,
      detailUrl: r.detailUrl,
      cover: r.cover || null,
    });
  }

  return makeResult(
    sourceId, sourceName, host, keyword,
    parsed.length > 0,
    parsed.length > 0 ? null : 'parse',
    parsed.length > 0
      ? null
      : { code: 'NO_PARSED_RESULTS', message: 'Selector matched 0 results' },
    steps, search, sampleResults,
  );
}

// ---- 批量诊断 ----

export interface BatchDiagnosisItem {
  sourceId: string;
  sourceName: string;
  host: string;
  ok: boolean;
  failedAt: string | null;
  error: { code: string; message: string; url?: string; cause?: string } | null;
  httpStatus: number;
  htmlLength: number;
  itemCount: number;
  parsedCount: number;
  finalSearchUrl: string;
}

export interface BatchDiagnosisResult {
  ok: boolean;
  keyword: string;
  limit: number;
  total: number;
  passed: number;
  failed: number;
  items: BatchDiagnosisItem[];
  recommendedSourceIds: string[];
}

export async function diagnoseSourceBatch(
  keyword: string,
  limit: number,
): Promise<BatchDiagnosisResult> {
  const { getActiveSources, refreshRemoteSources: refresh } = await import(
    '@/lib/comicfs/source-loader'
  );

  // 获取活跃源
  let sources: Awaited<ReturnType<typeof getActiveSources>>['sources'] = [];
  try {
    sources = (await getActiveSources({ onlyOk: false })).sources;
  } catch { /* ok */ }
  if (sources.length === 0) {
    try {
      await refresh();
      sources = (await getActiveSources({ onlyOk: false })).sources;
    } catch { /* ok */ }
  }

  // 过滤：low/medium + active
  const filtered = sources
    .filter((s) => s.riskLevel === 'low' || s.riskLevel === 'medium')
    .filter((s) => s.status === 'active')
    .slice(0, Math.min(limit, 50));

  const items: BatchDiagnosisItem[] = [];
  const recommendedSourceIds: string[] = [];
  let passed = 0;

  // 并发限制 2
  for (let i = 0; i < filtered.length; i += 2) {
    const batch = filtered.slice(i, i + 2);
    const results = await Promise.allSettled(
      batch.map((s) => diagnoseSourceSearch(s.id, keyword)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const d = r.value;
        items.push({
          sourceId: d.sourceId,
          sourceName: d.sourceName,
          host: d.host,
          ok: d.ok,
          failedAt: d.failedAt,
          error: d.error,
          httpStatus: d.steps.httpStatus,
          htmlLength: d.steps.htmlLength,
          itemCount: d.steps.itemCount,
          parsedCount: d.steps.parsedCount,
          finalSearchUrl: d.search.finalSearchUrl,
        });
        if (d.ok) {
          passed++;
          recommendedSourceIds.push(d.sourceId);
        }
      }
    }
  }

  return {
    ok: true,
    keyword,
    limit,
    total: items.length,
    passed,
    failed: items.length - passed,
    items,
    recommendedSourceIds,
  };
}

// ---- 辅助 ----

function makeResult(
  sourceId: string,
  sourceName: string,
  host: string,
  keyword: string,
  ok: boolean,
  failedAt: DiagnosisFailedAt | null,
  error: { code: string; message: string; url?: string; cause?: string } | null,
  steps: DiagnosisSteps,
  search: DiagnosisResult['search'],
  sampleResults: DiagnosisResult['sampleResults'],
): DiagnosisResult {
  return { ok, sourceId, sourceName, host, keyword, failedAt, error, steps, search, sampleResults };
}
