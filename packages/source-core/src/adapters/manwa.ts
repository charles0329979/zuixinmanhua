// ============================================================
// packages/source-core/src/adapters/manwa.ts
// 漫蛙适配器 — manwafz.cc (HTML DOM 解析)
// ============================================================

import * as cheerio from 'cheerio';
import type { AdapterContext, ComicInfo, ChapterInfo, ChapterDetail } from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import { BaseAdapter } from './base.adapter';

const CDN_HOSTS = [
  'https://mwappimgs.cc',
  'https://mwfimsvfast29.cc',
  'https://mwfimsvfast36.cc',
  'https://mwfimsvfast31.cc',
  'https://mwfimsvfast25.cc',
];

export class ManwaAdapter extends BaseAdapter {
  id = 'manwa';
  name = '漫蛙';
  testTargets = { comicId: '7843', chapterId: '234756' };

  constructor(ctx: AdapterContext, http: IHttpClient) {
    super(ctx, http);
  }

  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await this.fetch('/search', {
        params: { keyword: query },
        headers: { 'Referer': `${this.ctx.baseUrl}/` },
      });
      const $ = cheerio.load(data as string);
      const results: ComicInfo[] = [];

      $('.book-list-cover').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('a').first();
        const $img = $el.find('img.book-list-cover-img').first();
        const href = $a.attr('href') || '';
        const title = $a.attr('title') || $a.text().trim();
        const comicId = this.extractBookId(href);
        if (!comicId || !title) return;

        let cover = $img.attr('data-original') || $img.attr('src') || '';
        if (cover && !cover.startsWith('http')) {
          cover = (cover.startsWith('//') ? 'https:' : this.ctx.baseUrl) + cover;
        }

        results.push({
          comicId, title, author: '未知', cover, status: 'ongoing',
          description: '', lastChapter: '', updatedAt: '', source: this.id,
        });
      });
      return results;
    } catch { return []; }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data as string);
    const fullTitle = $('title').text().trim();
    return {
      comicId,
      title: fullTitle.split(/[-–|]/)[0].trim() || fullTitle,
      author: '',
      cover: $('meta[property="og:image"]').attr('content') || '',
      status: 'ongoing',
      description: $('meta[name="description"]').attr('content') || '',
      lastChapter: '', updatedAt: '', source: this.id,
    };
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data as string);
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    const collect = (sel: string) => {
      $(sel).each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href') || '';
        const title = $el.attr('title') || $el.text().trim();
        const chapterId = this.extractChapterId(href);
        if (chapterId && !seen.has(chapterId)) {
          seen.add(chapterId);
          chapters.push({ chapterId, title, url: href, index: i });
        }
      });
    };

    collect('#detail-list-select a[href*="/chapter/"]');
    if (chapters.length === 0) {
      collect('a[href*="/chapter/"]');
    }
    return chapters;
  }

  async getChapterImages(_comicId: string, chapterId: string): Promise<ChapterDetail> {
    const { data } = await this.fetch(`/chapter/${chapterId}/`);
    const $ = cheerio.load(data as string);

    const fullTitle = $('title').text().trim();
    const parts = fullTitle.split(/[-–|]/);
    const comicTitle = parts[0]?.trim() || '';
    const chapterTitle = parts[1]?.trim() || '';

    const images: string[] = [];
    const seen = new Set<string>();

    const add = (url: string) => {
      if (!url) return;
      let clean = url.trim();
      if (/imagecover|placeholder|loading|blank|1x1|spacer/i.test(clean)) return;
      if (clean.includes('/static/images/') && !clean.includes('/upload')) return;
      if (!clean.startsWith('http')) {
        clean = CDN_HOSTS[0] + (clean.startsWith('/') ? '' : '/') + clean;
      }
      if (seen.has(clean)) return;
      seen.add(clean);
      images.push(clean);
    };

    // data-r-src attribute (manwa lazy-load)
    $('.content-img, .img-content img, #cp_img img').each((_, el) => {
      const src = $(el).attr('data-r-src') || $(el).attr('data-original') ||
        $(el).attr('data-src') || $(el).attr('src');
      if (src) add(src);
    });

    // Regex fallback
    if (images.length === 0) {
      const re = new RegExp(
        `(https?://[^"'>\\s]+?upload[^"'>\\s]*?${chapterId}[^"'>\\s]*?\\.(?:webp|jpg|png|jpeg)[^"'>\\s]*)`,
        'gi',
      );
      let m;
      while ((m = re.exec(data as string)) !== null) {
        add(m[1]);
      }
    }

    return { chapterId, comicTitle, chapterTitle, images };
  }

  private extractBookId(url: string): string {
    return (url.match(/\/book\/(\d+)/) || [])[1] || '';
  }
  private extractChapterId(url: string): string {
    return (url.match(/\/chapter\/(\d+)/) || [])[1] || '';
  }
}
