// ============================================================
// 单源诊断 — 逐步检测搜索链路的每个阶段
// ============================================================
import { fetchSourceById } from '@/lib/comicfs/client';
import { extractSearchUrlTemplate, buildSearchUrl } from './build-search-url';
import { fetchHtml } from './fetch-html';
import { parseHtmlResults } from './parse-html-results';
import { cleanHost } from '@/lib/manga-search/url-resolver';
import type { FetchErrorCode } from './fetch-html';

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
  error: string | null;
  errorCode?: FetchErrorCode;
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
  | 'source-load' | 'search-rule' | 'url-build'
  | 'safe-url' | 'fetch' | 'http-status'
  | 'content-type' | 'selector' | 'parse';

function step(defaults: Partial<DiagnosisSteps> = {}): DiagnosisSteps {
  return {
    sourceLoaded: false, searchRuleFound: false, searchUrlBuilt: false,
    urlSafe: false, fetchOk: false, httpStatus: 0, contentType: '',
    htmlLength: 0, containsKeyword: false, selectorFound: false,
    itemCount: 0, parsedCount: 0,
    ...defaults,
  };
}

function makeResult(
  sourceId: string, sourceName: string, host: string, keyword: string,
  ok: boolean, failedAt: DiagnosisFailedAt | null, error: string | null,
  steps: DiagnosisSteps, search: DiagnosisResult['search'],
  sampleResults: DiagnosisResult['sampleResults'],
  errorCode?: FetchErrorCode,
): DiagnosisResult {
  return { ok, sourceId, sourceName, host, keyword, failedAt, error, errorCode, steps, search, sampleResults };
}

// ---- 主诊断函数 ----

export async function diagnoseSourceSearch(
  sourceId: string,
  keyword: string,
  _options?: { timeoutMs?: number },
): Promise<DiagnosisResult> {
  const search = {
    rawSearchUrl: '', finalSearchUrl: '',
    listSelector: '', titleSelector: '', urlSelector: '', coverSelector: '',
  };
  const sampleResults: DiagnosisResult['sampleResults'] = [];

  // Step 1: Load source
  let fullSource: Record<string, unknown>;
  try {
    const fetched = await fetchSourceById(sourceId);
    if (!fetched) throw new Error('source not found');
    fullSource = fetched as unknown as Record<string, unknown>;
  } catch (err) {
    return makeResult(sourceId, '', '', keyword, false, 'source-load',
      String(err), step(), search, []);
  }

  const sourceName = (typeof fullSource.name === 'string' ? fullSource.name : sourceId);
  const rawHost = (typeof fullSource.host === 'string' ? fullSource.host : '');
  const host = cleanHost(rawHost);
  const steps = step({ sourceLoaded: true });

  // Step 2: Extract search URL template
  const template = extractSearchUrlTemplate(fullSource);
  if (!template) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'search-rule',
      'No search URL template found in source rule', steps, search, []);
  }
  search.rawSearchUrl = template;
  steps.searchRuleFound = true;

  // Step 3: Build final URL
  const finalUrl = buildSearchUrl(template, keyword, host);
  if (!finalUrl) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'url-build',
      'Failed to build search URL', steps, search, []);
  }
  search.finalSearchUrl = finalUrl;
  steps.searchUrlBuilt = true;
  steps.urlSafe = true;

  // Step 4: Fetch HTML
  const htmlResult = await fetchHtml(finalUrl, host);
  if (!htmlResult.ok) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'fetch',
      htmlResult.error.message, steps, search, [], htmlResult.error.code);
  }
  steps.fetchOk = true;
  steps.httpStatus = htmlResult.httpStatus || 200;
  steps.contentType = htmlResult.contentType;
  steps.htmlLength = htmlResult.body.length;
  steps.containsKeyword = htmlResult.body.includes(keyword);

  // Step 5: Check selector
  const listSelector = getSelector(fullSource, ['item', 'list', 'ruleSearchList']);
  search.listSelector = listSelector;
  search.titleSelector = getSelector(fullSource, ['title', 'ruleSearchName']);
  search.urlSelector = getSelector(fullSource, ['url', 'detailUrl', 'ruleSearchNoteUrl']);
  search.coverSelector = getSelector(fullSource, ['cover', 'ruleSearchCoverUrl']);

  if (!listSelector) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'selector',
      'Missing search list selector', steps, search, []);
  }
  steps.selectorFound = true;

  // Step 6: Parse
  const parsed = parseHtmlResults(fullSource, htmlResult.body);
  if ('reason' in parsed) {
    return makeResult(sourceId, sourceName, host, keyword, false, 'parse',
      parsed.reason, steps, search, []);
  }

  steps.itemCount = 0; // parseHtmlResults doesn't return item count separately
  steps.parsedCount = parsed.length;

  for (const r of parsed.slice(0, 5)) {
    sampleResults.push({ title: r.title, detailUrl: r.detailUrl, cover: r.cover || null });
  }

  return makeResult(sourceId, sourceName, host, keyword, parsed.length > 0,
    parsed.length > 0 ? null : 'parse',
    parsed.length > 0 ? null : 'Parsed 0 results (selector may not match)',
    steps, search, sampleResults);
}

// ---- 辅助 ----

function getSelector(source: Record<string, unknown>, names: string[]): string {
  const search = (source.search || {}) as Record<string, unknown>;
  const raw = (((source.metadata || {}) as Record<string, unknown>).raw || {}) as Record<string, unknown>;
  for (const name of names) {
    const val = search?.[name] ?? raw?.[name];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

// ---- 批量诊断 ----

export async function diagnoseSourceBatch(
  keyword: string,
  limit: number,
): Promise<{
  items: Array<{
    sourceId: string; sourceName: string; host: string;
    ok: boolean; failedAt: string | null; error: string | null;
    httpStatus: number; htmlLength: number; itemCount: number;
    parsedCount: number; finalSearchUrl: string;
  }>;
  passed: number; failed: number; total: number;
  recommendedSourceIds: string[];
}> {
  const { getActiveSources, refreshRemoteSources: refresh } = await import('@/lib/comicfs/source-loader');

  let sources: Awaited<ReturnType<typeof getActiveSources>>['sources'] = [];
  try { sources = (await getActiveSources({ onlyOk: false })).sources; } catch { /* ok */ }
  if (sources.length === 0) {
    try { await refresh(); sources = (await getActiveSources({ onlyOk: false })).sources; } catch { /* ok */ }
  }

  const filtered = sources
    .filter((s) => s.riskLevel === 'low' || s.riskLevel === 'medium')
    .filter((s) => s.status === 'active')
    .slice(0, limit);

  const items: Awaited<ReturnType<typeof diagnoseSourceBatch>>['items'] = [];
  let passed = 0;
  const recommendedSourceIds: string[] = [];

  // Sequential with concurrency 2
  for (let i = 0; i < filtered.length; i += 2) {
    const batch = filtered.slice(i, i + 2);
    const results = await Promise.allSettled(
      batch.map((s) => diagnoseSourceSearch(s.id, keyword)),
    );
    for (const r of results) {
      if (r.status === 'fulfilled') {
        const d = r.value;
        items.push({
          sourceId: d.sourceId, sourceName: d.sourceName, host: d.host,
          ok: d.ok, failedAt: d.failedAt, error: d.error,
          httpStatus: d.steps.httpStatus, htmlLength: d.steps.htmlLength,
          itemCount: d.steps.itemCount, parsedCount: d.steps.parsedCount,
          finalSearchUrl: d.search.finalSearchUrl,
        });
        if (d.ok) { passed++; recommendedSourceIds.push(d.sourceId); }
      }
    }
  }

  return { items, passed, failed: items.length - passed, total: items.length, recommendedSourceIds };
}
