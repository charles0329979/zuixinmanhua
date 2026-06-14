// ============================================================
// packages/source-core/src/rule-engine/rule-based-adapter.ts
// ★ RuleBasedAdapter — 将 MangaSource JSON 规则包装成 ISourceAdapter
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import * as cheerio from 'cheerio';
import type {
  ISourceAdapter,
  MangaSource,
  ComicInfo,
  ChapterInfo,
  ChapterDetail,
} from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import {
  extractOne,
  extractList,
  extractFromJSON,
  extractListFromJSON,
} from '@zuixinmanhua/parser';
import { resolveSearchUrl, resolveUrl, cleanHost } from './url-resolver';

export class RuleBasedAdapter implements ISourceAdapter {
  readonly id: string;
  readonly name: string;
  readonly testTargets = {} as { comicId?: string; chapterId?: string };

  constructor(
    private source: MangaSource,
    private http: IHttpClient,
  ) {
    this.id = source.id;
    this.name = source.name;
  }

  get domain(): string {
    return cleanHost(this.source.host);
  }

  // ========== 搜索 ==========

  async search(query: string): Promise<ComicInfo[]> {
    const url = resolveSearchUrl(
      this.source.search.url,
      query,
      this.domain,
    );

    const response = await this.http.get(url, {
      timeout: this.source.timeoutMs || 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/json',
        ...(this.source.headers || {}),
      },
    });

    const body = response.data as string;

    // JSON 搜索
    if (this.source.search.responseType === 'json') {
      return this.parseJsonSearch(body);
    }

    // HTML 搜索
    return this.parseHtmlSearch(body);
  }

  private parseJsonSearch(body: string): ComicInfo[] {
    let json: unknown;
    try {
      json = JSON.parse(body);
    } catch {
      return [];
    }

    const listPath = this.source.search.listSelector;
    const items = extractListFromJSON(json, listPath);
    if (items.length === 0) return [];

    const results: ComicInfo[] = [];
    for (const item of items) {
      if (typeof item !== 'object' || !item) continue;
      const obj = item as Record<string, unknown>;

      const title = this.getJsonField(obj, this.source.search.titleSelector);
      if (!title) continue;

      const cover = this.getJsonField(obj, this.source.search.coverSelector);
      let detailUrl = this.getJsonField(
        obj,
        this.source.search.detailUrlSelector,
      );
      if (detailUrl && !detailUrl.startsWith('http')) {
        detailUrl = resolveUrl(detailUrl, this.domain);
      }

      results.push({
        comicId: detailUrl || title,
        title,
        author: '未知',
        cover: cover ? resolveUrl(cover, this.domain) : '',
        status: 'ongoing',
        description: '',
        lastChapter:
          this.source.search.latestChapterSelector
            ? this.getJsonField(
                obj,
                this.source.search.latestChapterSelector,
              )
            : '',
        updatedAt: '',
        source: this.id,
      });
    }
    return results;
  }

  private parseHtmlSearch(html: string): ComicInfo[] {
    const $ = cheerio.load(html);
    const $items = extractList($, this.source.search.listSelector);
    if ($items.length === 0) return [];

    const results: ComicInfo[] = [];
    const seen = new Set<string>();

    $items.each((_i: number, el: any) => {
      const $el = $(el);
      const title = extractOne($, this.source.search.titleSelector, $el);
      if (!title || seen.has(title)) return;
      seen.add(title);

      let cover = '';
      try {
        cover = extractOne(
          $,
          this.source.search.coverSelector,
          $el,
        );
        if (cover) cover = resolveUrl(cover, this.domain);
      } catch {
        /* ignore */
      }

      let detailUrl = extractOne(
        $,
        this.source.search.detailUrlSelector,
        $el,
      );
      if (detailUrl) detailUrl = resolveUrl(detailUrl, this.domain);

      results.push({
        comicId: detailUrl || title,
        title,
        author: '未知',
        cover,
        status: 'ongoing',
        description: '',
        lastChapter:
          this.source.search.latestChapterSelector
            ? extractOne(
                $,
                this.source.search.latestChapterSelector,
                $el,
              )
            : '',
        updatedAt: '',
        source: this.id,
      });
    });
    return results;
  }

  // ========== 漫画详情 ==========

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const detailUrl = comicId.startsWith('http')
      ? comicId
      : resolveUrl(comicId, this.domain);

    const response = await this.http.get(detailUrl, {
      timeout: this.source.timeoutMs || 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(this.source.headers || {}),
      },
    });

    const $ = cheerio.load(response.data as string);

    let cover = '';
    if (this.source.detail.coverSelector) {
      const $el = $(this.source.detail.coverSelector).first();
      cover =
        $el.attr('content') ||
        $el.attr('src') ||
        $el.attr('data-src') ||
        '';
      if (!cover) {
        const style = $el.attr('style') || '';
        const m = style.match(/url\(['"]?([^'")]+)['"]?\)/);
        if (m) cover = m[1];
      }
      if (cover) cover = resolveUrl(cover, this.domain);
    }

    return {
      comicId,
      title:
        extractOne($, this.source.detail.titleSelector) ||
        $('title').text().trim(),
      author: this.source.detail.authorSelector
        ? extractOne($, this.source.detail.authorSelector)
        : '',
      cover,
      status: this.parseStatus(
        this.source.detail.statusSelector
          ? extractOne($, this.source.detail.statusSelector)
          : '',
      ),
      description: this.source.detail.descriptionSelector
        ? extractOne($, this.source.detail.descriptionSelector)
        : '',
      lastChapter: this.source.detail.latestChapterSelector
        ? extractOne($, this.source.detail.latestChapterSelector)
        : '',
      updatedAt: '',
      source: this.id,
    };
  }

  // ========== 章节列表 ==========

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const detailUrl = comicId.startsWith('http')
      ? comicId
      : resolveUrl(comicId, this.domain);

    const response = await this.http.get(detailUrl, {
      timeout: this.source.timeoutMs || 8000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(this.source.headers || {}),
      },
    });

    const $ = cheerio.load(response.data as string);
    const $items = extractList($, this.source.chapters.listSelector);
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    $items.each((i: number, el: any) => {
      const $el = $(el);
      const title = extractOne(
        $,
        this.source.chapters.titleSelector,
        $el,
      );
      let url = extractOne(
        $,
        this.source.chapters.urlSelector,
        $el,
      );
      if (url) url = resolveUrl(url, this.domain);

      const key = url || title;
      if (title && !seen.has(key)) {
        seen.add(key);
        chapters.push({
          chapterId: url || title,
          title,
          url: url || '',
          index: i,
        });
      }
    });
    return chapters;
  }

  // ========== 章节图片 ==========

  async getChapterImages(
    comicId: string,
    chapterId: string,
  ): Promise<ChapterDetail> {
    const chapterUrl = chapterId.startsWith('http')
      ? chapterId
      : resolveUrl(chapterId, this.domain);

    const response = await this.http.get(chapterUrl, {
      timeout: this.source.timeoutMs || 10000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(this.source.headers || {}),
      },
    });

    const $ = cheerio.load(response.data as string);
    const $items = extractList($, this.source.images.listSelector);
    const images: string[] = [];
    const srcAttr = this.source.images.srcAttribute || 'src';

    $items.each((_i: number, el: any) => {
      const $img = $(el);
      const src =
        $img.attr(srcAttr) ||
        $img.attr('data-src') ||
        $img.attr('data-original') ||
        '';
      if (src) images.push(resolveUrl(src, this.domain));
    });

    return { chapterId, comicTitle: '', chapterTitle: '', images };
  }

  // ========== Helpers ==========

  private getJsonField(
    obj: Record<string, unknown>,
    path: string,
  ): string {
    if (!obj || !path) return '';
    const value = extractFromJSON(obj, path.startsWith('$.') ? path : '$.' + path);
    if (value === null || value === undefined) return '';
    return String(value);
  }

  private parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (/完结|完結|completed/i.test(text)) return 'completed';
    if (/停更|休刊|hiatus/i.test(text)) return 'hiatus';
    return 'ongoing';
  }
}
