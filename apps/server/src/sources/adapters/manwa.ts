import * as cheerio from 'cheerio';
import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';

/**
 * 漫蛙适配器 — manwafz.cc (2026-06-06 更新)
 *
 * 旧域名 manwa.com 已停售，新域名 manwafz.cc
 * - 服务端 HTML 渲染
 * - 图片 CDN 多路切换 (mwfimsvfast29.cc 等)，无需登录
 * - 封面使用 lazy-load (data-original)
 *
 * DOM:
 * - 搜索: /search?keyword={{q}} → div.book-list-cover > a > img.book-list-cover-img
 * - 详情: /book/{{id}} → meta[name=description], ul#detail-list-select a
 * - 图片: /chapter/{{chId}} → 路径 /upload/book/id/... 嵌入 HTML
 */

// CDN 域名优先级列表（从 checkImgLine() base64 解码提取）
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

  constructor(ctx: AdapterContext) { super(ctx); }

  // ========== 搜索 ==========
  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await this.fetch('/search', {
        params: { keyword: query },
        headers: { 'Referer': `${this.ctx.baseUrl}/` },
      });
      const $ = cheerio.load(data);
      const results: ComicInfo[] = [];

      $('.book-list-cover').each((_, el) => {
        const $el = $(el);
        const $a = $el.find('a').first();
        const $img = $el.find('img.book-list-cover-img').first();
        const href = $a.attr('href') || '';
        const title = $a.attr('title') || $a.text().trim();
        const comicId = this.extractId(href);
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

  // ========== 漫画详情 ==========
  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data);

    const fullTitle = $('title').text().trim();
    const title = fullTitle.split(/[-–|]/)[0].trim() || fullTitle;
    const description = $('meta[name="description"]').attr('content') || '';
    let cover = $('meta[property="og:image"]').attr('content') || '';

    return {
      comicId, title, author: '', cover,
      status: 'ongoing', description, lastChapter: '', updatedAt: '', source: this.id,
    };
  }

  // ========== 章节列表 ==========
  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await this.fetch(`/book/${comicId}/`);
    const $ = cheerio.load(data);
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    $('#detail-list-select a[href*="/chapter/"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const title = $el.attr('title') || $el.text().trim();
      const chapterId = this.extractChapterId(href);
      if (chapterId && !seen.has(chapterId)) {
        seen.add(chapterId);
        chapters.push({ chapterId, title, url: href, index: i });
      }
    });

    // 回退
    if (chapters.length === 0) {
      $('a[href*="/chapter/"]').each((i, el) => {
        const $el = $(el);
        const href = $el.attr('href') || '';
        const title = $el.attr('title') || $el.text().trim();
        const chapterId = this.extractChapterId(href);
        if (chapterId && !seen.has(chapterId)) {
          seen.add(chapterId);
          chapters.push({ chapterId, title, url: href, index: i });
        }
      });
    }

    return chapters;
  }

  // ========== 章节图片 ==========
  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const { data } = await this.fetch(`/chapter/${chapterId}/`);
    const $ = cheerio.load(data);

    // 元数据
    const fullTitle = $('title').text().trim();
    const parts = fullTitle.split(/[-–|]/);
    const comicTitle = parts[0]?.trim() || '';
    const chapterTitle = parts[1]?.trim() || '';

    const images: string[] = [];
    const seen = new Set<string>();

    const add = (url: string) => {
      if (!url) return;
      let clean = url.trim();
      // 过滤占位符
      if (/imagecover|placeholder|loading|blank|1x1|spacer/i.test(clean)) return;
      if (clean.includes('/static/images/') && !clean.includes('/upload')) return;
      // 补全相对 URL
      if (!clean.startsWith('http')) {
        clean = (clean.startsWith('/') ? '' : '/') + clean;
        // Use CDN host from the page, fallback to first CDN
        clean = CDN_HOSTS[0] + clean;
      }
      if (seen.has(clean)) return;
      seen.add(clean);
      images.push(clean);
    };

    // 方法1: data-r-src 属性 (漫蛙使用自定义 lazy-load)
    // 元素: <img class="content-img lazy_img" data-r-src="FULL_CDN_URL" ...>
    $('.content-img, .img-content img, #cp_img img').each((_, el) => {
      const $el = $(el);
      const realSrc = $el.attr('data-r-src') || $el.attr('data-original') || $el.attr('data-src') || $el.attr('src');
      if (realSrc) add(realSrc);
    });

    // 方法2: 正则匹配 HTML 中的图片路径
    // 路径格式: /static/upload2/book/id/{comicId}/{chapterId}/{hash}_zb.webp
    if (images.length === 0) {
      const re = /\/static\/upload2\/book\/id\/\d+\/(\d+)\/[a-f0-9_]+\.(?:webp|jpg|png|jpeg)/gi;
      let m;
      while ((m = re.exec(data)) !== null) {
        if (m[1] === chapterId) add(m[0]);
      }
    }

    // 方法3: 更宽泛的正则 — 扫描所有图片 URL
    if (images.length === 0) {
      const re = /(?:data-r-src|data-original|data-src|src)\s*=\s*["']([^"']+\.(?:webp|jpg|png|jpeg)[^"']*)["']/gi;
      let m;
      while ((m = re.exec(data)) !== null) {
        add(m[1]);
      }
    }

    // 方法4: 通用 URL 匹配 — 找所有包含 upload + chapterId 的图片链接
    if (images.length === 0) {
      const re = new RegExp(
        `(https?://[^"'>\\s]+?upload[^"'>\\s]*?${chapterId}[^"'>\\s]*?\\.(?:webp|jpg|png|jpeg)[^"'>\\s]*)`,
        'gi',
      );
      let m;
      while ((m = re.exec(data)) !== null) {
        add(m[1]);
      }
    }

    return { chapterId, comicTitle, chapterTitle, images };
  }

  // ========== Helpers ==========
  private extractId(url: string): string {
    return (url.match(/\/book\/(\d+)/) || [])[1] || '';
  }

  private extractChapterId(url: string): string {
    return (url.match(/\/chapter\/(\d+)/) || [])[1] || '';
  }
}
