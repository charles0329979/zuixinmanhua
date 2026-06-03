import * as cheerio from 'cheerio';
import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';

/**
 * 包子漫画适配器 — 基于真实 DOM 结构 (Nuxt.js + AMP + Pure.css)
 *
 * DOM 结构 (已验证 2026-06):
 * - 搜索卡片: .comics-card > a.comics-card__poster[title] + a.comics-card__info > .comics-card__title > h3
 * - 详情页:   .comics-detail__title, .comics-detail__author, .comics-detail__desc
 * - 封面:     .de-info__bg[style*=background-image] (CSS background, 不是 <img>)
 * - 章节:     .comics-chapters__item (grid items)
 */
export class BaoziAdapter extends BaseAdapter {
  id = 'baozi';
  name = '包子漫画';
  testTargets = { comicId: 'douluodalu-fengxuandongman' };

  constructor(ctx: AdapterContext) { super(ctx); }

  // ========== 搜索 ==========
  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await this.fetch('/search', { params: { q: query } });
      const $ = cheerio.load(data);
      const results: ComicInfo[] = [];

      $('.comics-card').each((_, el) => {
        const $el = $(el);
        const $poster = $el.find('.comics-card__poster');
        const $info = $el.find('.comics-card__info');
        const $title = $el.find('.comics-card__title h3');
        const $chapter = $el.find('.chapter');
        const $small = $info.find('small');

        // URL: from poster link href
        const href = $poster.attr('href') || $info.attr('href') || '';
        // Title: from h3 text OR poster title attribute (more reliable)
        const title = $title.first().text().trim() || $poster.attr('title') || '';
        // Cover: poster img src
        const cover = $poster.find('img').first().attr('src') || '';
        // Author: first part of <small> text before separator
        const smallText = $small.first().text().trim();
        const author = smallText ? smallText.split(/[/\s]+/)[0] : '未知';
        // Last chapter: from .chapter overlay badge
        const lastChapter = $chapter.first().text().trim();

        if (!title) return; // skip empty cards

        results.push({
          comicId: this.extractId(href),
          title,
          author,
          cover,
          status: 'ongoing',
          description: '',
          lastChapter,
          updatedAt: '',
          source: this.id,
        });
      });
      return results;
    } catch { return []; }
  }

  // ========== 漫画详情 ==========
  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await this.fetch(`/comic/${comicId}`);
    const $ = cheerio.load(data);

    // Cover: extracted from .de-info__bg style="background-image:url('...')"
    let cover = '';
    const bgStyle = $('.de-info__bg').attr('style') || '';
    const bgMatch = bgStyle.match(/url\(['"]?([^'")]+)['"]?\)/);
    if (bgMatch) cover = bgMatch[1];

    // Status: check if .comics-detail__status or tag-list contains "完结"
    const statusText = $('.comics-detail__status, .tag-list').text();
    const status = this.parseStatus(statusText);

    // Last chapter: from the first chapter item
    const lastChapter = $('.comics-chapters__item').first().find('div').text().trim();

    return {
      comicId,
      title: $('.comics-detail__title').first().text().trim(),
      author: $('.comics-detail__author').first().text().trim().replace('作者：', '').replace('作者:', '').trim() || '未知',
      cover,
      status,
      description: $('.comics-detail__desc').first().text().trim(),
      lastChapter,
      updatedAt: '',
      source: this.id,
    };
  }

  // ========== 章节列表 ==========
  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch(`/comic/${comicId}`);
    const $ = cheerio.load(data);
    const chapters: ChapterInfo[] = [];

    $('.comics-chapters__item').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      // 真实 URL: /user/page_direct?comic_id=...&section_slot=0&chapter_slot=N
      // 用 chapter_slot 作为 chapterId
      const slotMatch = href.match(/chapter_slot=(\d+)/);
      const chapterId = slotMatch ? slotMatch[1] : this.extractId(href);
      chapters.push({
        chapterId,
        title: $el.find('div').first().text().trim() || $el.text().trim(),
        url: href,  // 保留完整 URL 供 getChapterImages 使用
        index: i,
      });
    });
    return chapters.reverse(); // newest first
  }

  // ========== 章节图片 ==========
  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);
    const chapterUrl = chapters[idx]?.url || `/chapter/${chapterId}`;

    // 使用真实 URL：/user/page_direct?comic_id=...&chapter_slot=N
    let data: string;
    try {
      const resp = await this.fetch(chapterUrl);
      data = resp.data;
    } catch {
      return { chapterId, comicTitle: '', chapterTitle: chapters[idx]?.title || '', images: [] };
    }

    const $ = cheerio.load(data);

    // 从页面标题提取漫画名: "第344话 复活仪式开始 - 斗罗大陆 - 包子漫画"
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

    // 包子漫画使用 AMP 格式：<amp-img class="comic-contain__item" src="..." data-src="...">
    $('amp-img.comic-contain__item').each((_, el) => {
      const $el = $(el);
      const src = $el.attr('src') || $el.attr('data-src') || '';
      if (src) images.push(src);
    });

    // Fallback: 兼容其他可能的图片格式
    if (images.length === 0) {
      $('img.comic-image, .chapter-img img, .comic-content img, img.lazy, amp-img').each((_, el) => {
        const $img = $(el);
        const src = $img.attr('src') || $img.attr('data-src') || $img.attr('data-original') || $img.attr('srcset')?.split(' ')[0];
        if (src && !src.includes('avatar') && !src.includes('icon') && !src.includes('logo')) {
          images.push(src);
        }
      });
    }

    return {
      chapterId,
      comicTitle,
      chapterTitle,
      images,
      prevChapter: idx > 0 ? { chapterId: chapters[idx - 1].chapterId, title: chapters[idx - 1].title } : undefined,
      nextChapter: idx < chapters.length - 1 ? { chapterId: chapters[idx + 1].chapterId, title: chapters[idx + 1].title } : undefined,
    };
  }

  // ========== Helpers ==========
  private extractId(url: string): string {
    return url.replace(/\/comic\//, '').replace(/\/chapter\//, '').replace(/\/view\//, '').replace(/\//g, '');
  }

  private parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (text.includes('完结') || text.includes('完結') || text.includes('completed')) return 'completed';
    if (text.includes('停更') || text.includes('休刊')) return 'hiatus';
    return 'ongoing';
  }
}
