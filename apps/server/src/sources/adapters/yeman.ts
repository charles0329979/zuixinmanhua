import * as cheerio from 'cheerio';
import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';

/**
 * 野蛮漫画适配器 — KIMICMS (shipman 主题)
 *
 * DOM 结构 (已验证 2026-06):
 * - 详情页: /book/<comicId>/
 *   - 封面: .detail-cover img.thumb — style="background: url('...')" (CSS背景图, 非 src)
 *   - 标题: h1.title
 *   - 作者: .js_authorJump (text after "作者")
 *   - 状态: .sort span (contains "状态：连载中/已完结")
 *   - 标签: .tags li.item a
 *   - 最新: .last-update em
 *   - 章节: #j_chapter_list li.item a — href="/chapter/<comicId>/<chapterId>.html"
 * - 章节页: /chapter/<comicId>/<chapterId>.html
 *   - 图片: .acgn-reader-chapter__item img[src]
 * - 搜索: POST /api/front/index/search {key: query} → {code:0, data:[{name, info_url}]}
 */
export class YemanAdapter extends BaseAdapter {
  id = 'yeman';
  name = '野蛮漫画';
  testTargets = { comicId: '9116', chapterId: '1049491' };

  // 反爬节流：yemancomic.com 快速连续请求会触发反爬跳转到 baidu.com
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL_MS = 2000;

  constructor(ctx: AdapterContext) { super(ctx); }

  /** 确保请求间隔 >= MIN_INTERVAL_MS，防止触发反爬 */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, this.MIN_INTERVAL_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /** 覆写 fetch 方法，自动节流 */
  protected override async fetch(pathOrUrl: string, opts?: any): Promise<any> {
    await this.throttle();
    return super.fetch(pathOrUrl, opts);
  }

  /** 覆写 post 方法，自动节流 */
  protected override async post(pathOrUrl: string, data?: any, opts?: any): Promise<any> {
    await this.throttle();
    return super.post(pathOrUrl, data, opts);
  }

  // ========== 搜索 ==========
  async search(query: string): Promise<ComicInfo[]> {
    try {
      // KIMICMS AJAX 搜索
      const params = new URLSearchParams();
      params.append('key', query);

      const { data: resp } = await this.post('/api/front/index/search', params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Referer': `${this.ctx.baseUrl}/`,
        },
      });

      const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
      if (json.code !== 0 || !json.data) return [];

      return json.data.map((item: any) => ({
        comicId: this.extractId(item.info_url || ''),
        title: item.name || '',
        author: item.author || '未知',
        cover: item.cover || item.pic || '',
        status: 'ongoing',
        description: item.description || '',
        lastChapter: item.last_chapter || '',
        updatedAt: item.update_time || '',
        source: this.id,
      }));
    } catch {
      // Fallback: try HTML search page
      try {
        const { data } = await this.fetch('/search', { params: { keyword: query } });
        const $ = cheerio.load(data);
        const results: ComicInfo[] = [];
        $('.comic-item, .search-item, .mh-item, .book-item').each((_, el) => {
          const $el = $(el);
          const link = $el.find('a').first().attr('href') || '';
          results.push({
            comicId: this.extractId(link),
            title: $el.find('.title, h3, .name').first().text().trim(),
            author: $el.find('.author').first().text().trim() || '未知',
            cover: $el.find('img').first().attr('src') || '',
            status: 'ongoing', description: '',
            lastChapter: $el.find('.chapter').first().text().trim(),
            updatedAt: $el.find('.date').first().text().trim(),
            source: this.id,
          });
        });
        return results;
      } catch { return []; }
    }
  }

  // ========== 漫画详情 ==========
  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data);

    // Cover: extracted from .detail-cover img.thumb style="background: url('...')"
    let cover = '';
    const styleAttr = $('.detail-cover img.thumb').attr('style') || $('.detail-cover .thumb').attr('style') || '';
    const bgMatch = styleAttr.match(/url\(['"]?([^'")]+)['"]?\)/);
    if (bgMatch) cover = bgMatch[1];
    // Fallback: try regular img src
    if (!cover) cover = $('.detail-cover img').first().attr('src') || '';

    // Title
    const title = $('h1.title').first().text().trim() || $('h1.title').attr('title') || '';

    // Author: from .js_authorJump text (strip "作者" prefix)
    let author = '未知';
    const authorText = $('.js_authorJump').first().text().trim();
    if (authorText) {
      author = authorText.replace(/^作者/, '').trim() || authorText;
    }
    // Fallback
    if (author === '未知' || !author) {
      author = $('.auth-profile .title').first().text().trim() || '未知';
    }

    // Status: parse from .sort span text
    const sortText = $('.sort').text();
    const status = this.parseStatus(sortText);

    // Tags
    const tags: string[] = [];
    $('.tags li.item a').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tags.push(tag);
    });

    // Description: try intro section
    let description = '';
    const introText = $('.detail-introduce .bd p').first().text().trim()
      || $('.acgn-model-detail-introduce p').first().text().trim()
      || $('.intro-text').first().text().trim();
    if (introText && introText.length > 5) description = introText;

    // Last chapter
    const lastChapter = $('.last-update em').first().text().trim()
      || $('.last-update').first().text().trim();

    // Updated: from the last-update span
    const updatedText = $('.last-update').parent().text().trim();
    const updatedMatch = updatedText.match(/(\d{4}-\d{2}-\d{2})/);
    const updatedAt = updatedMatch ? updatedMatch[1] : '';

    return {
      comicId, title, author, cover, status, description,
      lastChapter, updatedAt, source: this.id, tags,
    };
  }

  // ========== 章节列表 ==========
  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data);
    const chapters: ChapterInfo[] = [];

    $('#j_chapter_list li.item a').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const title = $el.attr('title') || $el.find('.name').text().trim() || $el.text().trim();
      chapters.push({
        chapterId: this.extractId(href),
        title,
        url: href,
        index: i,
      });
    });

    return chapters.reverse(); // newest first
  }

  // ========== 章节图片 ==========
  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);

    const { data } = await this.fetch(`/chapter/${comicId}/${chapterId}.html`);
    const $ = cheerio.load(data);

    // Comic title from page title
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

    // Images: .acgn-reader-chapter__item img — the reader container images
    const images: string[] = [];
    $('#img-box .acgn-reader-chapter__item img').each((_, el) => {
      const src = $(el).attr('src');
      if (src && !src.includes('static/system') && !src.includes('static/shipman')) {
        images.push(src);
      }
    });

    // Fallback: try broader image search if #img-box not found
    if (images.length === 0) {
      $('.acgn-reader-chapter__item img').each((_, el) => {
        const src = $(el).attr('src');
        if (src && !src.includes('static/system') && !src.includes('static/shipman')) {
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
    // /book/9116/ → "9116"
    // /chapter/9116/1049491.html → "1049491"
    // /book/9116 → "9116"
    return url
      .replace(/\/book\//, '')
      .replace(/\/chapter\/\d+\//, '')
      .replace(/\.html/, '')
      .replace(/\/$/, '')
      .replace(/\//g, '');
  }

  private parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (/完结|完結|completed/i.test(text)) return 'completed';
    if (/停更|休刊|hiatus/i.test(text)) return 'hiatus';
    return 'ongoing';
  }
}
