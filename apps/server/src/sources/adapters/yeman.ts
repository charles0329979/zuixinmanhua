import * as cheerio from 'cheerio';
import * as http2 from 'http2';
import * as zlib from 'zlib';
import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';
import { CircuitBreakerError } from '../source-policy.types';

/**
 * 野蛮漫画适配器 — KIMICMS (shipman 主题)
 *
 * 2026-06-06 更新:
 * - KIMICMS CDN (alihttps.top) 封禁桌面浏览器 TLS 指纹，需使用 HTTP/2 + iOS Safari UA
 * - 搜索 API 不受影响 (HTTP/1.1 + X-Requested-With 即可)
 * - 详情/章节页面需 HTTP/2 直连
 * - 图片 API (/api/comic/read/index) 需要登录认证，暂不可用
 *
 * DOM 结构 (已验证 2026-06-06):
 * - 详情页: /book/<comicId>/
 *   - 标题: h1.title
 *   - 作者: meta[property="og:novel:author"] (content 属性)
 *   - 封面: meta[property="og:image"] (content 属性)
 *   - 状态: meta[property="og:novel:status"] (content 属性)
 *   - 简介: meta[property="og:description"] (content 属性)
 * - 章节: .chapter-list a[href*="/chapter/"]
 * - 搜索: GET /api/front/index/search?key=query (JSON API)
 */

// HTTP/2 session cache (reuse connections)
const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

interface H2Session {
  client: http2.ClientHttp2Session;
  createdAt: number;
}

let _h2Session: H2Session | null = null;
const H2_SESSION_TTL = 30000; // 30 seconds

function getH2Session(): http2.ClientHttp2Session {
  const now = Date.now();
  if (_h2Session && (now - _h2Session.createdAt) < H2_SESSION_TTL && !_h2Session.client.destroyed) {
    return _h2Session.client;
  }
  if (_h2Session && !_h2Session.client.destroyed) {
    _h2Session.client.close();
  }
  const client = http2.connect('https://www.yemancomic.com');
  _h2Session = { client, createdAt: now };
  return client;
}

/** HTTP/2 GET 请求 — 用于 HTML 页面（绕过 CDN 桌面浏览器检测） */
function h2Get(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = getH2Session();
    const req = client.request({
      ':path': path,
      ':method': 'GET',
      ':authority': 'www.yemancomic.com',
      ':scheme': 'https',
      'user-agent': IOS_SAFARI_UA,
      'accept': 'text/html,application/xhtml+xml',
      'accept-language': 'zh-CN,zh-Hans;q=0.9',
    });

    const chunks: Buffer[] = [];
    let contentEncoding = '';
    req.on('response', (headers) => {
      contentEncoding = headers['content-encoding'] || '';
    });
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      try {
        let html: string;
        if (contentEncoding === 'gzip' || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
          html = zlib.gunzipSync(buffer).toString('utf-8');
        } else if (contentEncoding === 'br') {
          html = zlib.brotliDecompressSync(buffer).toString('utf-8');
        } else {
          html = buffer.toString('utf-8');
        }
        // 反爬检测: KIMICMS 重定向页特征是 JS location.replace + baidu
        // 注意: 正常页面可能包含百度统计 (hm.baidu.com)，不能仅靠 baidu.com 判断
        const isBaiduRedirect = (
          html.includes('百度一下') ||
          (html.includes('location.replace') && html.includes('baidu.com')) ||
          html.includes('http://www.baidu.com/')
        );
        if (isBaiduRedirect && html.length < 5000) {
          reject(new CircuitBreakerError('检测到重定向至百度，疑似反爬拦截', 'yeman', 'redirect'));
          return;
        }
        resolve(html);
      } catch (e: any) {
        reject(e);
      }
    });
    req.on('error', (err) => reject(err));
    req.end();
  });
}

export class YemanAdapter extends BaseAdapter {
  id = 'yeman';
  name = '野蛮漫画';
  testTargets = { comicId: '1881', chapterId: '34988' };

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

  /** 覆写 fetch: 搜索等 API 请求仍用 HTTP/1.1 (父类 axios) */
  protected async fetch(pathOrUrl: string, opts?: any): Promise<any> {
    await this.throttle();
    return super.fetch(pathOrUrl, opts);
  }

  /** 覆写 post: 搜索等 API 请求仍用 HTTP/1.1 */
  protected async post(pathOrUrl: string, data?: any, opts?: any): Promise<any> {
    await this.throttle();
    return super.post(pathOrUrl, data, opts);
  }

  // ========== 搜索 (JSON API, HTTP/1.1 即可) ==========
  async search(query: string): Promise<ComicInfo[]> {
    try {
      await this.throttle();
      const { data: resp } = await super.fetch('/api/front/index/search', {
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

  // ========== 漫画详情 (HTTP/2) ==========
  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const html = await h2Get(`/book/${comicId}/`);
    const $ = cheerio.load(html);

    // Title
    const title = $('h1.title').first().text().trim()
      || $('meta[property="og:novel:book_name"]').attr('content')
      || $('title').text().trim()
      || '';

    // Cover: meta og:image
    let cover = $('meta[property="og:image"]').attr('content') || '';
    if (cover && !cover.startsWith('http')) {
      cover = this.ctx.baseUrl + (cover.startsWith('/') ? '' : '/') + cover;
    }

    // Author: meta og:novel:author
    let author = $('meta[property="og:novel:author"]').attr('content') || '';
    if (!author) {
      author = $('.authorJump').first().text().trim()
        || $('meta[name="author"]').attr('content')
        || '未知';
    }

    // Status: meta og:novel:status
    let status: 'ongoing' | 'completed' | 'hiatus' = 'ongoing';
    const statusText = $('meta[property="og:novel:status"]').attr('content')
      || $('.sort').text()
      || '';
    status = this.parseStatus(statusText);

    // Description: meta og:description
    let description = $('meta[property="og:description"]').attr('content') || '';
    if (!description) {
      description = $('.detail-introduce .bd p').first().text().trim()
        || $('.desc-content').first().text().trim()
        || '';
    }

    // Tags
    const tags: string[] = [];
    $('meta[property="og:novel:category"]').attr('content')?.split(',').forEach((t: string) => {
      const trimmed = t.trim();
      if (trimmed) tags.push(trimmed);
    });

    // Latest chapter
    const lastChapter = $('.last-update em').first().text().trim()
      || $('meta[property="og:novel:latest_chapter_name"]').attr('content')
      || '';

    return {
      comicId, title, author, cover, status, description,
      lastChapter, updatedAt: '', source: this.id, tags,
    };
  }

  // ========== 章节列表 (HTTP/2) ==========
  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const html = await h2Get(`/book/${comicId}/`);
    const $ = cheerio.load(html);
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

    // 新版选择器: .chapter-list a[href*="/chapter/"]
    $('.chapter-list a[href*="/chapter/"]').each((i, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const title = $el.attr('title') || $el.text().trim();
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
        const title = $el.attr('title') || $el.text().trim();
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

    // 用 HTTP/2 获取章节页面
    const html = await h2Get(`/chapter/${comicId}/${chapterId}.html`);
    const $ = cheerio.load(html);

    // 尝试从页面提取元数据
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

    // 图片通过 JS API (/api/comic/read/index) 加载，需要登录
    // 尝试从页面提取内嵌图片（通常是占位符）
    const images: string[] = [];
    $('#imgsec img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || '';
      if (src && !src.includes('load.gif') && !src.includes('static/boodo') && !src.includes('static/system')) {
        images.push(src);
      }
    });

    // 如果页面没有真实图片 URL，尝试从 KIMICMS JS 变量提取 picCount
    if (images.length === 0) {
      const scriptMatch = html.match(/picCount\s*:\s*(\d+)/);
      const picCount = scriptMatch ? parseInt(scriptMatch[1]) : 0;
      if (picCount > 0) {
        // 返回占位信息 —— 图片需客户端通过 API 加载
        // 客户端可在浏览器中打开原始页面阅读
      }
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
