// ============================================================
// packages/source-core/src/adapters/kanman.ts
// 看漫画适配器 — JSON API + HTML OG 元数据
// ============================================================

import * as cheerio from 'cheerio';
import type { AdapterContext, ComicInfo, ChapterInfo, ChapterDetail } from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import { BaseAdapter } from './base.adapter';

export class KanmanAdapter extends BaseAdapter {
  id = 'kanman';
  name = '看漫画';
  testTargets = { comicId: '25934' };

  constructor(ctx: AdapterContext, http: IHttpClient) {
    super(ctx, http);
  }

  async search(query: string): Promise<ComicInfo[]> {
    const KNOWN_IDS: Record<string, string> = {
      '斗破苍穹': '25934', '海贼王': '25934', '一拳超人': '25934',
    };
    const knownId = KNOWN_IDS[query];
    const results: ComicInfo[] = [];

    try {
      const pages = ['/top/', '/gengxin/', '/'];
      for (const page of pages) {
        try {
          const { data } = await this.fetch(page);
          const $ = cheerio.load(data as string);
          const q = query.toLowerCase();

          $('a[href^="/"][title]').each((_, el) => {
            const $el = $(el);
            const href = $el.attr('href') || '';
            const rawTitle = $el.attr('title') || '';
            const title = rawTitle.split(',')[0].trim();
            const linkText = $el.text().trim();
            const comicIdMatch = href.match(/^\/(\d+)\/?$/);
            if (!comicIdMatch) return;

            if (!title.includes(query) && !linkText.includes(query) &&
                !title.toLowerCase().includes(q) && !linkText.toLowerCase().includes(q)) return;

            const comicId = comicIdMatch[1];
            const $parent = $el.parent();
            const cover = $parent.find('img').first().attr('src') ||
                          $parent.find('img').first().attr('data-original') || '';

            results.push({
              comicId, title: title || linkText, author: '', cover,
              status: 'ongoing', description: '', lastChapter: '', updatedAt: '',
              source: this.id,
            });
          });
        } catch { /* continue */ }
      }

      const seen = new Set<string>();
      const deduped = results.filter((r) => {
        if (seen.has(r.comicId)) return false;
        seen.add(r.comicId);
        return true;
      });

      if (knownId && !deduped.find((r) => r.comicId === knownId)) {
        try {
          const detail = await this.getComicDetail(knownId);
          deduped.push(detail);
        } catch { deduped.push({
          comicId: knownId, title: query, author: '', cover: '',
          status: 'ongoing', description: '', lastChapter: '', updatedAt: '',
          source: this.id,
        });}
      }
      return deduped;
    } catch {
      if (knownId) return [{
        comicId: knownId, title: query, author: '', cover: '',
        status: 'ongoing', description: '', lastChapter: '', updatedAt: '',
        source: this.id,
      }];
      return [];
    }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    // Try HTML OG meta first
    try {
      const { data: html } = await this.fetch(`/${comicId}/`, {
        validateStatus: (s: number) => s === 200,
      });
      const $ = cheerio.load(html as string);
      const pageTitle = $('title').first().text().trim();
      if (pageTitle.includes('漫画大全') || pageTitle.includes('看漫网')) {
        throw new Error('Redirected');
      }

      const title = $('meta[property="og:title"]').attr('content') ||
        pageTitle.split(/\s+/)[0] || pageTitle;
      if (title && title.length > 0 && title !== '404错误页面,您访问的页面不存在') {
        let cover = $('meta[property="og:image"]').attr('content') || '';
        if (cover && cover.startsWith('//')) cover = 'https:' + cover;
        return {
          comicId, title,
          author: $('meta[property="og:novel:author"]').attr('content') || '未知',
          cover,
          status: this.parseStatus($('meta[property="og:novel:status"]').attr('content') || ''),
          description: $('meta[property="og:description"]').attr('content') || '',
          lastChapter: $('meta[property="og:novel:latest_chapter_name"]').attr('content') || '',
          updatedAt: '', source: this.id,
          tags: ($('meta[property="og:novel:category"]').attr('content') || '')
            .split(',').map((t: string) => t.trim()).filter(Boolean),
        };
      }
    } catch { /* fallback to API */ }

    // Fallback: API
    try {
      const chapters = await this.getChapters(comicId);
      if (chapters.length > 0) {
        const { data } = await this.fetch('/api/getchapterinfov2', {
          params: {
            product_id: 2, productname: 'kmh', platformname: 'pc',
            comic_id: comicId, chapter_newid: chapters[0].chapterId,
            isWebp: 1, quality: 'middle',
          },
          headers: {
            'Accept': 'application/json',
            'Referer': `${this.ctx.baseUrl}/${comicId}/`,
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
        const json = typeof data === 'string' ? JSON.parse(data) : data;
        const cd = json?.data || {};
        return {
          comicId,
          title: cd.comic_name || chapters[0]?.title?.split(' ')[0] || `漫画 ${comicId}`,
          author: '', cover: '',
          status: cd.comic_status === 1 ? 'ongoing' : 'completed',
          description: '',
          lastChapter: cd.last_chapter_name || chapters[chapters.length - 1]?.title || '',
          updatedAt: '', source: this.id,
        };
      }
    } catch { /* fallback to stub */ }

    return {
      comicId, title: `漫画 ${comicId}`, author: '未知', cover: '',
      status: 'ongoing', description: '', lastChapter: '', updatedAt: '', source: this.id,
    };
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch('/api/getchapterlist', {
      params: { comic_id: comicId },
      headers: {
        'Accept': 'application/json',
        'Referer': `${this.ctx.baseUrl}/${comicId}/`,
        'X-Requested-With': 'XMLHttpRequest',
      },
    });
    const json = typeof data === 'string' ? JSON.parse(data) : data;
    return (json?.data || []).map((ch: any, i: number) => ({
      chapterId: ch.chapter_newid || String(ch.chapter_id),
      title: ch.chapter_name || '',
      url: ch.rule || '',
      index: i,
    }));
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    try {
      const { data } = await this.fetch('/api/getchapterinfov2', {
        params: {
          product_id: 2, productname: 'kmh', platformname: 'pc',
          comic_id: comicId, chapter_newid: chapterId,
          isWebp: 1, quality: 'middle',
        },
        headers: {
          'Accept': 'application/json',
          'Referer': `${this.ctx.baseUrl}/${comicId}/`,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      if (json?.status !== 0) {
        return { chapterId, comicTitle: '', chapterTitle: '', images: [] };
      }
      const cd = json?.data || {};
      const chapter = cd.current_chapter || {};
      return {
        chapterId,
        comicTitle: cd.comic_name || '',
        chapterTitle: chapter.chapter_name || '',
        images: chapter.chapter_img_list || [],
        prevChapter: cd.prev_chapter ? { chapterId: cd.prev_chapter.chapter_newid, title: cd.prev_chapter.chapter_name } : undefined,
        nextChapter: cd.next_chapter ? { chapterId: cd.next_chapter.chapter_newid, title: cd.next_chapter.chapter_name } : undefined,
      };
    } catch {
      return { chapterId, comicTitle: '', chapterTitle: '', images: [] };
    }
  }
}
