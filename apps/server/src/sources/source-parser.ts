import axios from 'axios';
import * as cheerio from 'cheerio';
import type { MangaSource } from './source-store';

// Re-export for external use
export type { MangaSource };
export interface AggregatedSearchResponse {
  keyword: string; totalResults: number;
  sources: { sourceId: string; sourceName: string; results: AggregatedComicResult[]; error?: string }[];
}
export interface AggregatedComicResult {
  title: string; cover: string; detailUrl: string;
  sourceId: string; sourceName: string;
  latestChapter?: string; status?: string; updateTime?: string;
}

async function fetchHTML(url: string, source: MangaSource): Promise<cheerio.CheerioAPI> {
  const resp = await axios.get(url, {
    timeout: source.timeoutMs || 5000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', ...(source.headers || {}) },
    responseType: 'text',
  });
  return cheerio.load(resp.data);
}

function resolveUrl(base: string, url: string): string {
  if (!url) return '';
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return 'https:' + url;
  const host = base.replace(/\/$/, '');
  return host + (url.startsWith('/') ? url : '/' + url);
}

function extractAttr(el: cheerio.Cheerio<any>, sel: string, attr: string): string {
  try {
    const $el = sel ? el.find(sel).first() : el;
    if ($el.length === 0) return '';
    const val = $el.attr(attr);
    return val || '';
  } catch { return ''; }
}

function extractText(el: cheerio.Cheerio<any>, sel: string): string {
  try {
    const $el = sel ? el.find(sel).first() : el;
    return $el.length > 0 ? $el.text().trim() : '';
  } catch { return ''; }
}

export async function searchBySource(source: MangaSource, keyword: string): Promise<AggregatedComicResult[]> {
  const url = source.search.url.replace('{{keyword}}', encodeURIComponent(keyword));
  const fullUrl = resolveUrl(source.host, url);
  const $ = await fetchHTML(fullUrl, source);
  const results: AggregatedComicResult[] = [];

  $(source.search.listSelector).each((_, el) => {
    try {
      const $el = $(el);
      const title = extractText($el, source.search.titleSelector);
      if (!title) return;
      let cover = '';
      try {
        const $img = $el.find(source.search.coverSelector).first();
        cover = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || '';
        // CSS background-image
        if (!cover) {
          const style = $img.attr('style') || '';
          const m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (m) cover = m[1];
        }
      } catch {}
      if (cover) cover = resolveUrl(source.host, cover);
      let detailUrl = '';
      if (source.search.detailUrlSelector === '&') {
        detailUrl = $el.attr('href') || '';
      } else {
        detailUrl = extractAttr($el, source.search.detailUrlSelector, 'href');
      }
      if (detailUrl) detailUrl = resolveUrl(source.host, detailUrl);

      results.push({
        title, cover, detailUrl,
        sourceId: source.id,
        sourceName: source.name,
        latestChapter: source.search.latestChapterSelector ? extractText($el, source.search.latestChapterSelector) : undefined,
        status: source.search.statusSelector ? extractText($el, source.search.statusSelector) : undefined,
        updateTime: source.search.updateTimeSelector ? extractText($el, source.search.updateTimeSelector) : undefined,
      });
    } catch {}
  });
  return results;
}

export async function getDetailBySource(source: MangaSource, detailUrl: string): Promise<Record<string, string>> {
  const fullUrl = resolveUrl(source.host, detailUrl);
  const $ = await fetchHTML(fullUrl, source);
  return {
    title: source.detail.titleSelector ? extractText($('body'), source.detail.titleSelector) : $('title').text().trim(),
    cover: source.detail.coverSelector ? (() => { try { const v = $(source.detail.coverSelector!).first().attr('src') || $(source.detail.coverSelector!).first().attr('data-src') || ''; return resolveUrl(source.host, v); } catch { return ''; } })() : '',
    author: source.detail.authorSelector ? extractText($('body'), source.detail.authorSelector) : '',
    description: source.detail.descriptionSelector ? extractText($('body'), source.detail.descriptionSelector) : '',
    status: source.detail.statusSelector ? extractText($('body'), source.detail.statusSelector) : '',
    latestChapter: source.detail.latestChapterSelector ? extractText($('body'), source.detail.latestChapterSelector) : '',
  };
}

export async function getChaptersBySource(source: MangaSource, detailUrl: string): Promise<{ title: string; url: string }[]> {
  const fullUrl = resolveUrl(source.host, detailUrl);
  const $ = await fetchHTML(fullUrl, source);
  const chapters: { title: string; url: string }[] = [];
  $(source.chapters.listSelector).each((_, el) => {
    try {
      const $el = $(el);
      const title = extractText($el, source.chapters.titleSelector);
      let url = '';
      // '&' means the element itself is the link
      if (source.chapters.urlSelector === '&') {
        url = $el.attr('href') || '';
      } else {
        url = extractAttr($el, source.chapters.urlSelector, 'href');
      }
      if (url) url = resolveUrl(source.host, url);
      if (title) chapters.push({ title, url });
    } catch {}
  });
  return chapters;
}

export async function getImagesBySource(source: MangaSource, chapterUrl: string): Promise<string[]> {
  const fullUrl = resolveUrl(source.host, chapterUrl);
  const $ = await fetchHTML(fullUrl, source);
  const images: string[] = [];
  $(source.images.listSelector).each((_, el) => {
    try {
      const src = $(el).attr(source.images.srcAttribute) || $(el).attr('data-src') || $(el).attr('data-original') || '';
      if (src) images.push(resolveUrl(source.host, src));
    } catch {}
  });
  return images;
}

export async function aggregatedSearch(keyword: string, sources: MangaSource[]): Promise<AggregatedSearchResponse> {
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      try {
        const items = await searchBySource(source, keyword);
        return { sourceId: source.id, sourceName: source.name, results: items };
      } catch (e: any) {
        return { sourceId: source.id, sourceName: source.name, results: [], error: e.message?.slice(0, 200) };
      }
    })
  );

  const sources_data = results.map(r => r.status === 'fulfilled' ? r.value : { sourceId: 'error', sourceName: 'error', results: [], error: '搜索异常' });
  const totalResults = sources_data.reduce((sum, s) => sum + s.results.length, 0);

  return { keyword, totalResults, sources: sources_data };
}
