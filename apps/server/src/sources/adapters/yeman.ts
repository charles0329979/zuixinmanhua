import * as cheerio from 'cheerio';
import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';

/**
 * 野蛮漫画适配器 — KIMICMS (shipman 主题)
 *
 * 反爬策略 (2026-06-04 更新):
 * - KIMICMS 检测请求频率, 连续请求会被重定向到 baidu.com
 * - 策略: 随机延迟 4-8s + User-Agent 轮换 + 被拦截后冷却 30s 重试
 *
 * DOM 结构 (已验证 2026-06):
 * - 详情页: /book/<comicId>/
 *   - 标题: h1.title
 *   - 作者: .authorJump
 *   - 状态: meta og:novel:status
 * - 章节: li.item a[href*="/chapter/"] (JS 填充)
 * - 图片: #img-box .acgn-reader-chapter__item img
 * - 搜索: GET /api/front/index/search?key=query
 */
export class YemanAdapter extends BaseAdapter {
  id = 'yeman';
  name = '野蛮漫画';
  testTargets = { comicId: '1881', chapterId: '2179470' };

  // 反爬配置: 简化的固定延迟策略
  // KIMICMS 检测短时间内请求频率, 简单固定 5s 间隔即可通过
  private lastRequestTime = 0;
  private readonly MIN_INTERVAL_MS = 5000;

  constructor(ctx: AdapterContext) { super(ctx); }

  /** 保证相邻请求至少间隔 MIN_INTERVAL_MS */
  private async throttle(): Promise<void> {
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.MIN_INTERVAL_MS) {
      await new Promise((r) => setTimeout(r, this.MIN_INTERVAL_MS - elapsed));
    }
    this.lastRequestTime = Date.now();
  }

  /** 覆写 fetch: 自动节流 */
  protected async fetch(pathOrUrl: string, opts?: any): Promise<any> {
    await this.throttle();
    return super.fetch(pathOrUrl, opts);
  }

  /** 覆写 post: 自动节流 */
  protected async post(pathOrUrl: string, data?: any, opts?: any): Promise<any> {
    await this.throttle();
    return super.post(pathOrUrl, data, opts);
  }

  // ========== 搜索 ==========
  async search(query: string): Promise<ComicInfo[]> {
    try {
      // KIMICMS GET 搜索 API
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
        comicId: item.id ? String(item.id) : this.extractId(item.info_url || ''),
        title: item.name || '',
        author: item.author || '未知',
        cover: item.cover || item.pic || '',
        status: item.state === '1' || item.isfull === '完结' ? 'completed' : 'ongoing',
        description: item.content || item.description || '',
        lastChapter: item.lastchapter || '',
        updatedAt: item.lastupdate_a || '',
        source: this.id,
      }));
    } catch {
      return [];
    }
  }

  // ========== 漫画详情 ==========
  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data);

    // Cover: from meta og:image or .detail-cover img
    let cover = $('meta[property="og:image"]').attr('content') || '';
    if (!cover) {
      const styleAttr = $('.detail-cover img').attr('style') || $('.detail-cover .thumb').attr('style') || '';
      const bgMatch = styleAttr.match(/url\(['"]?([^'")]+)['"]?\)/);
      if (bgMatch) cover = bgMatch[1];
      if (!cover) cover = $('.detail-cover img').first().attr('src') || '';
    }
    if (cover && cover.startsWith('/') && !cover.startsWith('//')) {
      cover = this.ctx.baseUrl + cover;
    }

    // Title: h1.title
    const title = $('h1.title').first().text().trim() || $('h1.title').attr('title') || '';

    // Author: .authorJump (not .js_authorJump)
    let author = '未知';
    const authorText = $('.authorJump').first().text().trim();
    if (authorText) {
      author = authorText.replace(/^作者/, '').trim() || authorText;
    }
    // Fallback: meta author
    if (author === '未知') {
      author = $('meta[name="author"]').attr('content') || $('meta[property="og:novel:author"]').attr('content') || '未知';
    }

    // Status: from meta or page text
    let status: 'ongoing' | 'completed' | 'hiatus' = 'ongoing';
    const statusText = $('.sort').text() || $('meta[property="og:novel:status"]').attr('content') || '';
    status = this.parseStatus(statusText);

    // Tags
    const tags: string[] = [];
    $('.tags li.item a, .tag-list a, .tag-item').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag) tags.push(tag);
    });

    // Description: from meta
    let description = $('meta[property="og:description"]').attr('content') || '';
    if (!description) {
      description = $('.detail-introduce .bd p').first().text().trim()
        || $('.desc-content').first().text().trim()
        || $('.intro-text').first().text().trim();
    }

    // Last chapter
    const lastChapter = $('.last-update em').first().text().trim()
      || $('.last-update').first().text().trim()
      || $('meta[property="og:novel:latest_chapter_name"]').attr('content') || '';

    return {
      comicId, title, author, cover, status, description,
      lastChapter, updatedAt: '', source: this.id, tags,
    };
  }

  // ========== 章节列表 ==========
  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data);
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    // KIMICMS shipman 主题: li.item a[href*="/chapter/"]
    $('li.item a[href*="/chapter/"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const title = $el.attr('title') || $el.find('.name').text().trim() || $el.text().trim();
      const chapterId = this.extractId(href);
      if (chapterId && !seen.has(chapterId)) {
        seen.add(chapterId);
        chapters.push({ chapterId, title, url: href, index: i });
      }
    });

    // 回退: 查找任何 /chapter/{comicId}/ 链接
    if (chapters.length === 0) {
      $(`a[href*="/chapter/${comicId}/"]`).each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href') || '';
        const title = $el.attr('title') || $el.find('.name').text().trim() || $el.text().trim();
        const chapterId = this.extractId(href);
        if (chapterId && !seen.has(chapterId)) {
          seen.add(chapterId);
          chapters.push({ chapterId, title, url: href, index: i });
        }
      });
    }

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
