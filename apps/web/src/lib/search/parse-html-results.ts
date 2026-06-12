// ============================================================
// HTML 结果解析器 — 使用 Legado 选择器引擎提取搜索结果
// ============================================================
import * as cheerio from 'cheerio';
import { extractOne, extractList } from '@/lib/manga-search/html-parser';
import { resolveUrl, cleanHost } from '@/lib/manga-search/url-resolver';
import type { UnifiedSearchResult } from './types';

function getSelector(source: Record<string, unknown>, names: string[]): string {
  const search = (source.search || {}) as Record<string, unknown>;
  const raw = (((source.metadata || {}) as Record<string, unknown>).raw || {}) as Record<string, unknown>;
  for (const name of names) {
    const val = search?.[name] ?? raw?.[name];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return '';
}

export function parseHtmlResults(
  source: Record<string, unknown>,
  html: string,
): UnifiedSearchResult[] | { reason: string } {
  const itemSelector = getSelector(source, ['item', 'list', 'ruleSearchList']);
  if (!itemSelector) return { reason: 'missing search list selector' };

  const titleSelector = getSelector(source, ['title', 'ruleSearchName']);
  const urlSelector = getSelector(source, ['url', 'detailUrl', 'ruleSearchNoteUrl']);
  const coverSelector = getSelector(source, ['cover', 'ruleSearchCoverUrl']);
  const authorSelector = getSelector(source, ['author', 'ruleSearchAuthor']);
  const latestSelector = getSelector(source, ['latestChapter', 'ruleSearchLastChapter', 'latest']);
  const statusSelector = getSelector(source, ['status']);
  const updateTimeSelector = getSelector(source, ['updateTime']);

  const sourceId = (typeof source.id === 'string' ? source.id : 'unknown');
  const sourceName = (typeof source.name === 'string' ? source.name : sourceId);
  const host = cleanHost((typeof source.host === 'string' ? source.host : '') || '');

  let $: cheerio.CheerioAPI;
  try { $ = cheerio.load(html); } catch { return { reason: 'cheerio parse failed' }; }

  let $items: cheerio.Cheerio<any>;
  try { $items = extractList($, itemSelector); } catch { return { reason: `selector error: ${itemSelector}` }; }
  if ($items.length === 0) return [];

  const results: UnifiedSearchResult[] = [];
  $items.each((i, el) => {
    const $el = $(el);
    const title = titleSelector ? extractOne($, titleSelector, $el) : '';
    if (!title) return;

    const rawUrl = urlSelector ? extractOne($, urlSelector, $el) : '';
    const detailUrl = resolveUrl(rawUrl, host) || host;
    const coverRaw = coverSelector ? extractOne($, coverSelector, $el) : '';
    const cover = coverRaw ? resolveUrl(coverRaw, host) : undefined;
    const author = authorSelector ? extractOne($, authorSelector, $el) : undefined;
    const latestChapter = latestSelector ? extractOne($, latestSelector, $el) : undefined;
    const status = statusSelector ? extractOne($, statusSelector, $el) : undefined;
    const updateTime = updateTimeSelector ? extractOne($, updateTimeSelector, $el) : undefined;

    results.push({
      id: `${sourceId}:${detailUrl || i}`,
      sourceId, sourceName, title,
      cover: cover || undefined,
      author: author || undefined,
      latestChapter: latestChapter || undefined,
      status: status || undefined,
      detailUrl, updateTime: updateTime || undefined,
      weight: 100,
    });
  });
  return results;
}
