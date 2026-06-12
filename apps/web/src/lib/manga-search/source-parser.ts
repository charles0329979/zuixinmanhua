// ============================================================
// 源搜索解析器
// 将 comicfs 源规则的 search 部分应用于 HTML/JSON，
// 提取 MangaSearchResult 列表
// ============================================================
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;
import { extractOne, extractList, extractFromJSON, extractListFromJSON } from './html-parser';
import { resolveUrl, cleanHost } from './url-resolver';
import type { MangaSearchResult, SourceSearchRule, ComicfsSource } from './types';

/**
 * 从 HTML 响应解析搜索结果
 */
export function parseSearchResults(
  source: Pick<ComicfsSource, 'id' | 'name' | 'host' | 'search'>,
  html: string,
): MangaSearchResult[] {
  const $ = cheerio.load(html);
  const host = cleanHost(source.host);
  const searchRule = source.search as SourceSearchRule;

  // 1. 找到列表容器
  const $items = extractList($, searchRule.item);

  if ($items.length === 0) return [];

  // 2. 遍历每个项目
  const results: MangaSearchResult[] = [];

  $items.each((i, el) => {
    const $el = $(el);

    const title = extractOne($, searchRule.title, $el);
    if (!title) return; // 跳过无标题项

    const rawUrl = extractOne($, searchRule.url, $el);
    const detailUrl = resolveUrl(rawUrl, host);

    const cover = extractOne($, searchRule.cover, $el) || undefined;

    const result: MangaSearchResult = {
      id: `${source.id}:${detailUrl || i}`,
      sourceId: source.id,
      sourceName: source.name,
      title,
      cover: cover ? resolveUrl(cover, host) : undefined,
      detailUrl: detailUrl || host,
      weight: 100,
    };

    // 可选字段
    const latestChapter = extractOne($, searchRule.latest, $el);
    if (latestChapter) result.latestChapter = latestChapter;

    const status = extractOne($, searchRule.status, $el);
    if (status) result.status = status;

    const updateTime = extractOne($, searchRule.updateTime, $el);
    if (updateTime) result.updateTime = updateTime;

    results.push(result);
  });

  return results;
}

/**
 * 从 JSON 响应解析搜索结果
 */
export function parseSearchResultsJSON(
  source: Pick<ComicfsSource, 'id' | 'name' | 'host' | 'search'>,
  data: unknown,
): MangaSearchResult[] {
  const host = cleanHost(source.host);
  const searchRule = source.search as SourceSearchRule;

  // listSelector 是 JSONPath
  const items = extractListFromJSON(data, searchRule.item);
  if (!items.length) return [];

  const results: MangaSearchResult[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];

    const title = asString(extractFromJSON(item, searchRule.title));
    if (!title) continue;

    const rawUrl = asString(extractFromJSON(item, searchRule.url));
    const detailUrl = resolveUrl(rawUrl, host);

    const cover = asString(extractFromJSON(item, searchRule.cover)) || undefined;

    results.push({
      id: `${source.id}:${detailUrl || i}`,
      sourceId: source.id,
      sourceName: source.name,
      title,
      cover: cover ? resolveUrl(cover, host) : undefined,
      detailUrl: detailUrl || host,
      weight: 100,
      latestChapter: asString(extractFromJSON(item, searchRule.latest)) || undefined,
      status: asString(extractFromJSON(item, searchRule.status)) || undefined,
      updateTime: asString(extractFromJSON(item, searchRule.updateTime)) || undefined,
    });
  }

  return results;
}

/**
 * 根据 comicfs 源搜索，自动判断 HTML 还是 JSON
 */
export function parseSearchResponse(
  source: Pick<ComicfsSource, 'id' | 'name' | 'host' | 'search'>,
  body: string,
  contentType?: string,
): MangaSearchResult[] {
  // 如果明确是 JSON 内容类型，或内容以 JSON 开头
  if (
    contentType?.includes('application/json') ||
    contentType?.includes('text/json') ||
    /^\s*[{[]/.test(body)
  ) {
    try {
      const data = JSON.parse(body);
      // 检查是否是有效的搜索结果（有数据数组）
      const host = cleanHost(source.host);
      const searchRule = source.search as SourceSearchRule;

      // 尝试 JSON 解析
      if (typeof data === 'object' && data !== null) {
        const jsonResults = parseSearchResultsJSON(source, data);
        if (jsonResults.length > 0) return jsonResults;

        // JSON 路径可能失败，回退到 HTML
      }
    } catch {
      // JSON 解析失败，回退到 HTML
    }
  }

  // 默认 HTML 解析
  try {
    return parseSearchResults(source, body);
  } catch {
    return [];
  }
}

function asString(val: unknown): string {
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  if (val === null || val === undefined) return '';
  return String(val);
}
