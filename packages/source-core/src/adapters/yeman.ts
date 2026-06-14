// ============================================================
// packages/source-core/src/adapters/yeman.ts
// 野蛮漫画适配器 — KIMICMS (JSON搜索 + HTML详情/章节)
// 注: 图片需要登录认证, HTTP/2 逻辑在 server 端实现
// ============================================================

import * as cheerio from 'cheerio';
import type { AdapterContext, ComicInfo, ChapterInfo, ChapterDetail } from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import { BaseAdapter } from './base.adapter';

export class YemanAdapter extends BaseAdapter {
  id = 'yeman';
  name = '野蛮漫画';
  testTargets = { comicId: '1881', chapterId: '34988' };

  private lastRequestTime = 0;
  private readonly MIN_INTERVAL_MS = 5000;

  constructor(ctx: AdapterContext, http: IHttpClient) {
    super(ctx, http);
  }

  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, this.MIN_INTERVAL_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  async search(query: string): Promise<ComicInfo[]> {
    try {
      await this.throttle();
      const { data: resp } = await this.fetch('/api/front/index/search', {
        params: { key: query },
        headers: {
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${this.ctx.baseUrl}/`,
          'Accept': 'application/json',
        },
      });
      const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
      if (json.code !== 0 || !json.data) return [];

      return json.data.map((item: any) => ({
        comicId: item.id ? String(item.id) : '',
        title: item.name || '',
        author: item.author || '未知',
        cover: item.cover || item.pic || '',
        status: item.state === '1' || item.isfull === '完结' ? 'completed' : 'ongoing',
        description: item.content || item.description || '',
        lastChapter: item.lastchapter || '',
        updatedAt: item.lastupdate_a || '',
        source: this.id,
      }));
    } catch { return []; }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    await this.throttle();
    const { data: html } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(html as string);

    const title = $('h1.title').first().text().trim()
      || $('meta[property="og:novel:book_name"]').attr('content')
      || $('title').text().trim() || '';

    let cover = $('meta[property="og:image"]').attr('content') || '';
    if (cover && !cover.startsWith('http')) {
      cover = this.ctx.baseUrl + (cover.startsWith('/') ? '' : '/') + cover;
    }

    const author = $('meta[property="og:novel:author"]').attr('content')
      || $('.authorJump').first().text().trim() || '未知';

    const statusText = $('meta[property="og:novel:status"]').attr('content')
      || $('.sort').text() || '';

    const description = $('meta[property="og:description"]').attr('content') || '';

    const tags = ($('meta[property="og:novel:category"]').attr('content') || '')
      .split(',').map((t: string) => t.trim()).filter(Boolean);

    const lastChapter = $('.last-update em').first().text().trim()
      || $('meta[property="og:novel:latest_chapter_name"]').attr('content') || '';

    return {
      comicId, title, author, cover,
      status: this.parseStatus(statusText),
      description, lastChapter, updatedAt: '', source: this.id, tags,
    };
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    await this.throttle();
    const { data: html } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(html as string);
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

    collect('.chapter-list a[href*="/chapter/"]');
    if (chapters.length === 0) {
      collect(`a[href*="/chapter/${comicId}/"]`);
    }
    return chapters.reverse();
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    await this.throttle();
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);

    try {
      const { data: html } = await this.fetch(`/chapter/${comicId}/${chapterId}.html`);
      const $ = cheerio.load(html as string);

      const pageTitle = $('title').first().text().trim();
      let comicTitle = '';
      let chapterTitle = chapters[idx]?.title || '';
      if (pageTitle) {
        const parts = pageTitle.split(/[-–|]/);
        if (parts.length >= 2) {
          comicTitle = parts[0].replace('漫画', '').trim();
          chapterTitle = chapterTitle || parts[1]?.trim() || '';
        }
      }

      const images: string[] = [];
      $('#imgsec img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src && !src.includes('load.gif') && !src.includes('static/')) {
          images.push(src);
        }
      });

      return {
        chapterId, comicTitle, chapterTitle, images,
        prevChapter: idx > 0 ? { chapterId: chapters[idx - 1].chapterId, title: chapters[idx - 1].title } : undefined,
        nextChapter: idx < chapters.length - 1 ? { chapterId: chapters[idx + 1].chapterId, title: chapters[idx + 1].title } : undefined,
      };
    } catch {
      return { chapterId, comicTitle: '', chapterTitle: chapters[idx]?.title || '', images: [] };
    }
  }

  private extractChapterId(url: string): string {
    return url.replace(/\/book\//, '').replace(/\/chapter\/\d+\//, '')
      .replace(/\.html/, '').replace(/\/$/, '').replace(/\//g, '');
  }
}
