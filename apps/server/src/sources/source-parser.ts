import axios from 'axios';
import * as cheerio from 'cheerio';
import * as https from 'https';
import type { MangaSource } from './source-store';
import { splitLegadoSelector } from './legado-runner';

/** Callback for executing JS expressions (provided by JsEngineService) */
export type JsExecutor = (jsCode: string, variables: Record<string, any>) => Promise<any>;

// HTTPS agent that allows insecure SSL (for sites with expired/bad certs)
const insecureAgent = new https.Agent({ rejectUnauthorized: false });

function getAxiosConfig(source: MangaSource, overrides: Record<string, any> = {}): Record<string, any> {
  const config: Record<string, any> = {
    timeout: source.timeoutMs || 10000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36',
      ...(source.headers || {}),
    },
    responseType: 'text',
    ...overrides,
  };
  // Use insecure HTTPS agent for sources with SSL issues (e.g. expired certs)
  const srcAny = source as any;
  if (srcAny.allowInsecureSSL) {
    config.httpsAgent = insecureAgent;
  }
  return config;
}

// Re-export for external use
export type { MangaSource };

// ============================================================
// Images API handler — for sources that use AJAX to load images
// (e.g. YYDS calls POST /api/comic/read/pics to get real URLs)
// ============================================================
interface ImagesApiConfig {
  url: string;
  method?: 'GET' | 'POST';
  /** JSON path to image array, e.g. "data.pic" */
  listPath: string;
  /** Field name for each image URL in the list, e.g. "pic" */
  urlField: string;
  /** Extra body params to send with the request */
  bodyParams?: Record<string, string>;
  /** CSS selector to extract additional params from the HTML */
  extractParams?: {
    /** CSS selector for the element containing the param */
    selector: string;
    /** Attribute name to extract */
    attribute: string;
    /** Map attribute value to this param name */
    paramName: string;
    /** Default value if not found */
    defaultValue?: string;
  }[];
  /** Total image limit (fetched across multiple offset batches) */
  totalLimit?: number;
  /** Batch size per request */
  batchSize?: number;
}
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
  const resp = await axios.get(url, getAxiosConfig(source));
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
    // '&' means the element itself (not a child)
    const $el = (sel && sel !== '&') ? el.find(sel).first() : el;
    if ($el.length === 0) return '';
    const val = $el.attr(attr);
    return val || '';
  } catch { return ''; }
}

function extractText(el: cheerio.Cheerio<any>, sel: string): string {
  try {
    // '&' means the element itself (not a child)
    const $el = (sel && sel !== '&') ? el.find(sel).first() : el;
    return $el.length > 0 ? $el.text().trim() : '';
  } catch { return ''; }
}

export async function searchBySource(source: MangaSource, keyword: string): Promise<AggregatedComicResult[]> {
  const url = source.search.url.replace('{{keyword}}', encodeURIComponent(keyword));
  const fullUrl = resolveUrl(source.host, url);

  // JSON response type (e.g. KIMICMS search API)
  if (source.search.responseType === 'json') {
    return searchBySourceJSON(source, fullUrl);
  }

  const $ = await fetchHTML(fullUrl, source);
  return parseSearchFromHTML(source, $);
}

/** JSON API 搜索 — 将 CSS 选择器字段重用作 JSON 字段名 */
async function searchBySourceJSON(source: MangaSource, fullUrl: string): Promise<AggregatedComicResult[]> {
  const resp = await axios.get(fullUrl, getAxiosConfig(source, { responseType: 'json' }));
  const json = resp.data;

  // listSelector 当作 JSON 路径，如 "data" 或 "data.list"
  const arrPath = source.search.listSelector.split('.');
  let arr: any[] = json;
  for (const key of arrPath) {
    if (arr && typeof arr === 'object' && key in arr) {
      arr = arr[key];
    } else {
      return [];
    }
  }
  if (!Array.isArray(arr)) return [];

  const results: AggregatedComicResult[] = [];
  for (const item of arr) {
    try {
      // 各 selector 字段当作 JSON key
      const title = getJsonField(item, source.search.titleSelector);
      if (!title) continue;
      const cover = getJsonField(item, source.search.coverSelector);
      let detailUrl = getJsonField(item, source.search.detailUrlSelector);
      if (detailUrl && !detailUrl.startsWith('http')) {
        detailUrl = resolveUrl(source.host, detailUrl);
      }

      results.push({
        title, cover: cover ? resolveUrl(source.host, cover) : '',
        detailUrl,
        sourceId: source.id,
        sourceName: source.name,
        latestChapter: source.search.latestChapterSelector ? getJsonField(item, source.search.latestChapterSelector) : undefined,
        status: source.search.statusSelector ? getJsonField(item, source.search.statusSelector) : undefined,
        updateTime: source.search.updateTimeSelector ? getJsonField(item, source.search.updateTimeSelector) : undefined,
      });
    } catch {}
  }
  return results;
}

function getJsonField(obj: any, path: string): string {
  if (!obj || !path) return '';
  // Support dot-notation paths like "user.name"
  const keys = path.split('.');
  let val: any = obj;
  for (const key of keys) {
    if (val && typeof val === 'object' && key in val) {
      val = val[key];
    } else {
      return '';
    }
  }
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  return String(val);
}

/** 从已获取的 HTML 解析搜索结果 (用于 client 模式) */
export function parseSearchFromHTML(source: MangaSource, $: cheerio.CheerioAPI): AggregatedComicResult[] {
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
        if (!cover) {
          const style = $img.attr('style') || '';
          const m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
          if (m) cover = m[1];
        }
      } catch {}
      if (cover) cover = resolveUrl(source.host, cover);
      let detailUrl = '';
      let dlUrlAttr = 'href';
      let dlUrlSel = source.search.detailUrlSelector || '';
      if (dlUrlSel && dlUrlSel.includes('@') && !dlUrlSel.startsWith('@')) {
        const parts = dlUrlSel.split('@');
        dlUrlSel = parts[0];
        dlUrlAttr = parts[1];
      }
      if (dlUrlSel === '&') {
        detailUrl = $el.attr(dlUrlAttr) || '';
      } else if (dlUrlSel) {
        detailUrl = extractAttr($el, dlUrlSel, dlUrlAttr);
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
  return parseDetailFromHTML(source, $);
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
      let urlAttr = 'href';
      let urlSel = source.chapters.urlSelector || '';
      // Support selector@attr syntax (e.g. ".j-chapter-link@data-hreflink")
      if (urlSel && urlSel.includes('@') && !urlSel.startsWith('@')) {
        const parts = urlSel.split('@');
        urlSel = parts[0];
        urlAttr = parts[1];
      }
      // '&' means the element itself
      if (urlSel === '&') {
        url = $el.attr(urlAttr) || '';
      } else if (urlSel) {
        url = extractAttr($el, urlSel, urlAttr);
      }
      if (url) url = resolveUrl(source.host, url);
      if (title) chapters.push({ title, url });
    } catch {}
  });
  return chapters;
}

export async function getImagesBySource(
  source: MangaSource,
  chapterUrl: string,
  jsExec?: JsExecutor,
): Promise<string[]> {
  // Check for imagesApi support (sources that use AJAX to load images)
  const srcAny = source as any;
  if (srcAny.imagesApi) {
    return getImagesByApi(source, srcAny.imagesApi as ImagesApiConfig, chapterUrl);
  }

  // Check for @js: expression in image selector (Legado DSL)
  const imgSel = source.images.listSelector;
  const { cssPart, jsPart } = splitLegadoSelector(imgSel);

  // Standard HTML parsing method
  const fullUrl = resolveUrl(source.host, chapterUrl);
  const $ = await fetchHTML(fullUrl, source);
  const images: string[] = [];

  if (cssPart) {
    $(cssPart).each((_, el) => {
      try {
        const src = $(el).attr(source.images.srcAttribute) || $(el).attr('data-src') || $(el).attr('data-original') || '';
        if (src) images.push(resolveUrl(source.host, src));
      } catch {}
    });
  }

  // If there's a @js: part, run it through the JS executor to transform results
  if (jsPart && jsExec) {
    try {
      const result = await jsExec(jsPart, { result: JSON.stringify(images) });
      if (result?.result !== undefined) {
        // JS may return HTML <img> tags or URL array
        const transformed = result.result;
        if (typeof transformed === 'string') {
          // Extract URLs from HTML img tags
          const urlMatches = transformed.match(/src\s*=\s*["']([^"']+)["']/g);
          if (urlMatches) {
            return urlMatches.map((m: string) => {
              const url = (m.match(/["']([^"']+)["']/) || [])[1] || '';
              return url.startsWith('http') ? url : resolveUrl(source.host, url);
            });
          }
        }
        if (Array.isArray(transformed)) {
          return transformed.map((u: string) =>
            typeof u === 'string' ? (u.startsWith('http') ? u : resolveUrl(source.host, u)) : ''
          ).filter(Boolean);
        }
      }
    } catch (e: any) {
      // JS execution failed, fall through to raw images
    }
  }

  return images;
}

/** Fetch images via API (for sources like YYDS that use JS lazy-loading) */
async function getImagesByApi(
  source: MangaSource,
  apiConfig: ImagesApiConfig,
  chapterUrl: string,
): Promise<string[]> {
  const allImages: string[] = [];
  const seen = new Set<string>();
  const batchSize = apiConfig.batchSize || 999;
  const totalLimit = apiConfig.totalLimit || 999;
  const method = (apiConfig.method || 'POST').toUpperCase();

  // First, fetch the chapter HTML to extract any needed params
  let extractedParams: Record<string, string> = {};
  if (apiConfig.extractParams && apiConfig.extractParams.length > 0) {
    try {
      const fullUrl = resolveUrl(source.host, chapterUrl);
      const $ = await fetchHTML(fullUrl, source);
      for (const ep of apiConfig.extractParams) {
        const $el = $(ep.selector).first();
        const val = $el.attr(ep.attribute) || ep.defaultValue || '';
        extractedParams[ep.paramName] = val;
      }
    } catch (e: any) {
      // If HTML fetch fails, proceed with defaults
    }
  }

  // Extract chapter ID from the chapterUrl
  // e.g. /episode/1393/124128.html → 124128
  const chIdMatch = chapterUrl.match(/(\d+)\.html?$/);
  const chapterId = chIdMatch ? chIdMatch[1] : '';

  // Fetch images in batches
  for (let offset = 0; offset < totalLimit; offset += batchSize) {
    try {
      const body: Record<string, any> = {
        id: chapterId,
        offset: offset,
        limit: Math.min(batchSize, totalLimit - offset),
        ...(apiConfig.bodyParams || {}),
        ...extractedParams,
      };

      let resp: any;
      const apiUrl = resolveUrl(source.host, apiConfig.url);

      if (method === 'POST') {
        resp = await axios.post(apiUrl, body, getAxiosConfig(source, {
          responseType: 'json',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            ...(source.headers || {}),
          },
        }));
      } else {
        resp = await axios.get(apiUrl, getAxiosConfig(source, {
          responseType: 'json',
          params: body,
        }));
      }

      const json = resp.data;
      if (!json) break;

      // Navigate to the image list via listPath (e.g. "data.pic")
      let arr: any[] = json;
      const pathParts = apiConfig.listPath.split('.');
      for (const key of pathParts) {
        if (arr && typeof arr === 'object' && key in arr) {
          arr = arr[key];
        } else {
          arr = [];
          break;
        }
      }
      if (!Array.isArray(arr) || arr.length === 0) break;

      for (const item of arr) {
        const imgUrl = item[apiConfig.urlField];
        if (imgUrl && typeof imgUrl === 'string' && !seen.has(imgUrl)) {
          seen.add(imgUrl);
          allImages.push(resolveUrl(source.host, imgUrl));
        }
      }

      // If we got fewer than batchSize, we've reached the end
      if (arr.length < Math.min(batchSize, totalLimit - offset)) break;
    } catch (e: any) {
      // If any batch fails, stop
      break;
    }
  }

  // Encode URLs with spaces/Chinese chars for direct loading
  return allImages.map(function(u) {
    try {
      // Encode path segments while preserving protocol+host
      var protoEnd = u.indexOf('://');
      if (protoEnd > 0) {
        var proto = u.slice(0, protoEnd + 3);
        var rest = u.slice(protoEnd + 3);
        var pathStart = rest.indexOf('/');
        if (pathStart > 0) {
          var host = rest.slice(0, pathStart);
          var rawPath = rest.slice(pathStart);
          var encodedPath = rawPath.split('/').map(function(seg) {
            return encodeURIComponent(decodeURIComponent(seg));
          }).join('/');
          return proto + host + encodedPath;
        }
      }
    } catch(e) {}
    return u;
  });
}

// ========== Parse-only 函数 (用于 client 模式 — 客户端预取 HTML 后提交解析) ==========

/** 从 HTML 字符串解析搜索结果 */
export function parseSearchHTML(source: MangaSource, html: string): AggregatedComicResult[] {
  const $ = cheerio.load(html);
  return parseSearchFromHTML(source, $);
}

/** 从 HTML 字符串解析漫画详情 */
export function parseDetailHTML(source: MangaSource, html: string): Record<string, string> {
  const $ = cheerio.load(html);
  return parseDetailFromHTML(source, $);
}

function parseDetailFromHTML(source: MangaSource, $: cheerio.CheerioAPI): Record<string, string> {
  // Cover: try various attributes (content for meta, src/data-src for img)
  let cover = '';
  if (source.detail.coverSelector) {
    try {
      const $el = $(source.detail.coverSelector!).first();
      cover = $el.attr('content') || $el.attr('src') || $el.attr('data-src') || '';
      // CSS background-image fallback
      if (!cover) {
        const style = $el.attr('style') || '';
        const m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (m) cover = m[1];
      }
      if (cover) cover = resolveUrl(source.host, cover);
    } catch {}
  }

  // Description: try content attr (meta) then text
  let description = '';
  if (source.detail.descriptionSelector) {
    try {
      const $el = $(source.detail.descriptionSelector!).first();
      description = $el.attr('content') || $el.text().trim();
    } catch {}
  }

  return {
    title: source.detail.titleSelector ? extractText($('body'), source.detail.titleSelector) : $('title').text().trim(),
    cover,
    author: source.detail.authorSelector ? extractText($('body'), source.detail.authorSelector) : '',
    description,
    status: source.detail.statusSelector ? extractText($('body'), source.detail.statusSelector) : '',
    latestChapter: source.detail.latestChapterSelector ? extractText($('body'), source.detail.latestChapterSelector) : '',
  };
}

/** 从 HTML 字符串解析章节列表 */
export function parseChaptersHTML(source: MangaSource, html: string): { title: string; url: string }[] {
  const $ = cheerio.load(html);
  const chapters: { title: string; url: string }[] = [];
  $(source.chapters.listSelector).each((_, el) => {
    try {
      const $el = $(el);
      const title = extractText($el, source.chapters.titleSelector);
      let url = '';
      let urlAttr = 'href'; // default: extract href attribute
      let urlSel = source.chapters.urlSelector || '';
      // Support selector@attr syntax (e.g. ".j-chapter-link@data-hreflink")
      if (urlSel && urlSel.includes('@') && !urlSel.startsWith('@')) {
        const parts = urlSel.split('@');
        urlSel = parts[0];
        urlAttr = parts[1];
      }
      if (urlSel === '&') {
        url = $el.attr(urlAttr) || '';
      } else if (urlSel) {
        url = extractAttr($el, urlSel, urlAttr);
      }
      if (url) url = resolveUrl(source.host, url);
      if (title) chapters.push({ title, url });
    } catch {}
  });
  return chapters;
}

/** 从 HTML 字符串解析图片列表 */
export function parseImagesHTML(source: MangaSource, html: string): string[] {
  const $ = cheerio.load(html);
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
