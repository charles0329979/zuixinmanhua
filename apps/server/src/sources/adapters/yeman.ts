import * as cheerio from 'cheerio';
import * as http2 from 'http2';
import * as zlib from 'zlib';
import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';
import { CircuitBreakerError } from '../source-policy.types';

/**
 * 野蛮漫画适配器 — KIMICMS (boodo 主题)
 *
 * 2026-06-06 更新:
 * - KIMICMS CDN (alihttps.top) 封禁桌面浏览器 TLS 指纹，需使用 HTTP/2 + iOS Safari UA
 * - 搜索 API 不受影响 (HTTP/1.1 + X-Requested-With 即可)
 * - 详情/章节页面需 HTTP/2 直连
 * - 图片 API (/api/comic/read/index) 需要登录认证
 * - KIMICMS 注册 API 已关闭，需要已有账号
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
 * - 图片: POST /api/comic/read/index (需登录 cookie)
 * - 登录: POST /api/user/userarr/login {user, pass}
 */

const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// ========== HTTP/2 请求工具（绕过 CDN 桌面浏览器检测）==========

function h2Request(method: string, path: string, body?: string, extraHeaders?: Record<string, string>): Promise<{ body: string; cookies: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect('https://www.yemancomic.com');
    const headers: Record<string, string> = {
      ':path': path,
      ':method': method,
      ':authority': 'www.yemancomic.com',
      ':scheme': 'https',
      'user-agent': IOS_SAFARI_UA,
      'accept': 'text/html,application/xhtml+xml,application/json',
      'accept-language': 'zh-CN,zh-Hans;q=0.9',
      ...(extraHeaders || {}),
    };
    if (body) {
      headers['content-length'] = String(Buffer.byteLength(body));
    }

    const req = client.request(headers);
    const chunks: Buffer[] = [];
    let cookies = '';
    let contentEncoding = '';

    req.on('response', (h) => {
      contentEncoding = h['content-encoding'] || '';
      const sc = h['set-cookie'];
      if (sc) cookies = (Array.isArray(sc) ? sc : [sc]).map(c => c.split(';')[0].trim()).join('; ');
    });
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      let text: string;
      try {
        if (contentEncoding === 'gzip' || (buffer[0] === 0x1f && buffer[1] === 0x8b)) {
          text = zlib.gunzipSync(buffer).toString('utf-8');
        } else if (contentEncoding === 'br') {
          text = zlib.brotliDecompressSync(buffer).toString('utf-8');
        } else {
          text = buffer.toString('utf-8');
        }
      } catch {
        text = buffer.toString('utf-8');
      }

      // 反爬检测: KIMICMS 重定向页特征是 JS location.replace + baidu
      const isBaiduRedirect = (
        text.includes('百度一下') ||
        (text.includes('location.replace') && text.includes('baidu.com')) ||
        (text.includes('http://www.baidu.com/') && text.length < 5000)
      );
      if (isBaiduRedirect) {
        client.close();
        reject(new CircuitBreakerError('检测到重定向至百度，疑似反爬拦截', 'yeman', 'redirect'));
        return;
      }
      client.close();
      resolve({ body: text, cookies });
    });
    req.on('error', (err) => {
      client.close();
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}

function h2Get(path: string): Promise<string> {
  return h2Request('GET', path).then(r => r.body);
}

function h2Post(path: string, formData: string, cookies?: string): Promise<{ body: string; cookies: string }> {
  const headers: Record<string, string> = {
    'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
    'x-requested-with': 'XMLHttpRequest',
    'referer': 'https://www.yemancomic.com/user/login',
    'origin': 'https://www.yemancomic.com',
  };
  if (cookies) headers['cookie'] = cookies;
  return h2Request('POST', path, formData, headers);
}

// ========== 登录状态（模块级缓存）==========

let _loginCookies: string | null = null;
let _loginExpiry = 0;

async function ensureLogin(): Promise<string | null> {
  // TODO: 从配置读取用户名密码
  // 目前 KIMICMS 注册已关闭，需要用户提供已有账号
  // 如果没有配置账号，返回 null（图片不可用）
  return null;
}

export class YemanAdapter extends BaseAdapter {
  id = 'yeman';
  name = '野蛮漫画';
  testTargets = { comicId: '1881', chapterId: '34988' };

  private lastRequestTime = 0;
  private readonly MIN_INTERVAL_MS = 5000;

  constructor(ctx: AdapterContext) { super(ctx); }

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
    await this.throttle();
    const html = await h2Get(`/book/${comicId}/`);
    const $ = cheerio.load(html);

    const title = $('h1.title').first().text().trim()
      || $('meta[property="og:novel:book_name"]').attr('content')
      || $('title').text().trim() || '';

    let cover = $('meta[property="og:image"]').attr('content') || '';
    if (cover && !cover.startsWith('http')) {
      cover = this.ctx.baseUrl + (cover.startsWith('/') ? '' : '/') + cover;
    }

    let author = $('meta[property="og:novel:author"]').attr('content')
      || $('.authorJump').first().text().trim()
      || $('meta[name="author"]').attr('content')
      || '未知';

    const statusText = $('meta[property="og:novel:status"]').attr('content')
      || $('.sort').text() || '';
    const status = this.parseStatus(statusText);

    let description = $('meta[property="og:description"]').attr('content') || '';
    if (!description) {
      description = $('.detail-introduce .bd p').first().text().trim()
        || $('.desc-content').first().text().trim() || '';
    }

    const tags: string[] = [];
    $('meta[property="og:novel:category"]').attr('content')?.split(',')
      .forEach((t: string) => { const trimmed = t.trim(); if (trimmed) tags.push(trimmed); });

    const lastChapter = $('.last-update em').first().text().trim()
      || $('meta[property="og:novel:latest_chapter_name"]').attr('content') || '';

    return { comicId, title, author, cover, status, description, lastChapter, updatedAt: '', source: this.id, tags };
  }

  // ========== 章节列表 (HTTP/2) ==========
  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    await this.throttle();
    const html = await h2Get(`/book/${comicId}/`);
    const $ = cheerio.load(html);
    const chapters: ChapterInfo[] = [];
    const seen = new Set<string>();

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

    return chapters.reverse();
  }

  // ========== 章节图片 (HTTP/2 + 登录 API) ==========
  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    await this.throttle();
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);

    // 获取章节页面元数据
    const html = await h2Get(`/chapter/${comicId}/${chapterId}.html`);
    const $ = cheerio.load(html);

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

    // 尝试从脚本提取 picCount
    const picCountMatch = html.match(/picCount\s*:\s*(\d+)/);
    const picCount = picCountMatch ? parseInt(picCountMatch[1]) : 0;

    // 尝试登录并加载图片
    const images: string[] = [];
    const cookies = await ensureLogin();

    if (cookies && picCount > 0) {
      // 分批加载图片 (每批 5 张)
      for (let offset = 0; offset < picCount; offset += 5) {
        await this.throttle();
        try {
          const formData = `id=${chapterId}&aid=${comicId}&offset=${offset}&limit=5`;
          const { body } = await h2Post('/api/comic/read/index', formData, cookies);
          const json = JSON.parse(body);
          if (json.code === 1 && json.data?.pic) {
            for (const p of json.data.pic) {
              if (p.pic) images.push(p.pic);
            }
          }
        } catch {
          // 单批失败不影响其他批次
        }
      }
    }

    // 如果未登录，尝试从 HTML 中提取真实图片 URL（通常不会有）
    if (images.length === 0) {
      $('#imgsec img').each((_, el) => {
        const src = $(el).attr('src') || $(el).attr('data-src') || '';
        if (src && !src.includes('load.gif') && !src.includes('static/')) {
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

  // ========== Helpers ==========
  private extractId(url: string): string {
    return url.replace(/\/book\//, '').replace(/\/chapter\/\d+\//, '').replace(/\.html/, '').replace(/\/$/, '').replace(/\//g, '');
  }

  private parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (/完结|完結|completed/i.test(text)) return 'completed';
    if (/停更|休刊|hiatus/i.test(text)) return 'hiatus';
    return 'ongoing';
  }
}
