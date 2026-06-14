// ============================================================
// packages/source-core/src/adapters/baozi.ts
// 包子漫画适配器 — 迁移自 apps/server (改用 IHttpClient)
// ============================================================

import * as cheerio from 'cheerio';
import type { AdapterContext, ComicInfo, ChapterInfo, ChapterDetail } from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import { BaseAdapter } from './base.adapter';

export class BaoziAdapter extends BaseAdapter {
  id = 'baozi';
  name = '包子漫画';
  testTargets = { comicId: 'douluodalu-fengxuandongman' };

  constructor(ctx: AdapterContext, http: IHttpClient) {
    super(ctx, http);
  }

  async search(query: string): Promise<ComicInfo[]> {
    const { data } = await this.fetch('/search', {
      params: { q: query },
    });
    const $ = cheerio.load(data as string);
    const results: ComicInfo[] = [];

    $('.comics-card').each((_, el) => {
      const $el = $(el);
      const $poster = $el.find('.comics-card__poster');
      const $title = $el.find('.comics-card__title h3');
      const $chapter = $el.find('.chapter');
      const $small = $el.find('.comics-card__info small');

      const href = $poster.attr('href') || '';
      const title = $title.first().text().trim() || $poster.attr('title') || '';
      const cover = $poster.find('img').first().attr('src') || '';
      const smallText = $small.first().text().trim();
      const author = smallText ? smallText.split(/[/\s]+/)[0] : '未知';
      const lastChapter = $chapter.first().text().trim();

      if (!title) return;

      results.push({
        comicId: this.extractId(href),
        title, author, cover,
        status: 'ongoing',
        description: '',
        lastChapter,
        updatedAt: '',
        source: this.id,
      });
    });
    return results;
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await this.fetch(`/comic/${comicId}`);
    const $ = cheerio.load(data as string);

    let cover = '';
    const bgStyle = $('.de-info__bg').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/);
    if (bgMatch) cover = bgMatch[1];

    const statusText = $('.comics-detail__status, .tag-list').text();
    const lastChapter = $('.comics-chapters__item').first().find('div').text().trim();

    return {
      comicId,
      title: $('.comics-detail__title').first().text().trim(),
      author: $('.comics-detail__author').first().text().trim()
        .replace('作者：', '').replace('作者:', '').trim() || '未知',
      cover,
      status: this.parseStatus(statusText),
      description: $('.comics-detail__desc').first().text().trim(),
      lastChapter,
      updatedAt: '',
      source: this.id,
    };
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch(`/comic/${comicId}`);
    const $ = cheerio.load(data as string);
    const chapters: ChapterInfo[] = [];

    $('.comics-chapters__item').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const slotMatch = href.match(/chapter_slot=(\d+)/);
      const chapterId = slotMatch ? slotMatch[1] : this.extractId(href);
      chapters.push({
        chapterId,
        title: $el.find('div').first().text().trim() || $el.text().trim(),
        url: href,
        index: i,
      });
    });
    return chapters.reverse();
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);
    const chapterUrl = chapters[idx]?.url || `/chapter/${chapterId}`;

    const { data } = await this.fetch(chapterUrl);
    const $ = cheerio.load(data as string);

    const pageTitle = $('title').first().text().trim();
    let comicTitle = '';
    let chapterTitle = chapters[idx]?.title || '';
    if (pageTitle) {
      const parts = pageTitle.split(/\s*[-–|]\s*/);
      if (parts.length >= 2) {
        chapterTitle = chapterTitle || parts[0].trim();
        comicTitle = parts[1]?.trim() || '';
      }
    }

    const images: string[] = [];
    $('amp-img.comic-contain__item').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src) images.push(src);
    });

    if (images.length === 0) {
      $('img.comic-image, .chapter-img img, .comic-content img, img.lazy, amp-img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original') || '';
        if (src && !src.includes('avatar') && !src.includes('icon')) {
          images.push(src);
        }
      });
    }

    return {
      chapterId, comicTitle, chapterTitle, images,
      prevChapter: idx > 0 ? { chapterId: chapters[idx - 1].chapterId, title: chapters[idx - 1].title } : undefined,
      nextChapter: idx < chapters.length - 1 ? { chapterId: chapters[idx + 1].chapterId, title: chapters[idx + 1].title } : undefined,
    };
  }
}
